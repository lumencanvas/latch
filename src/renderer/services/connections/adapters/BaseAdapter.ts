/**
 * Base Connection Adapter
 *
 * Abstract base class for all connection adapters.
 * Provides common functionality for status management, events, reconnection,
 * state machine integration, and message buffering.
 */

import type {
  BaseConnectionConfig,
  ConnectionAdapter,
  ConnectionStatus,
  ConnectionStatusInfo,
  ExtendedConnectionStatusInfo,
  SendOptions,
} from '../types'
import {
  ConnectionStateMachine,
  createConnectionStateMachine,
  type ConnectionState,
} from '../ConnectionStateMachine'
import {
  getMessageBufferManager,
  type EnqueueOptions,
} from '../MessageBuffer'

type StatusCallback = (status: ConnectionStatusInfo) => void
type MessageCallback = (message: { topic?: string; data: unknown }) => void
type ErrorCallback = (error: Error) => void

/**
 * Map state machine states to connection status
 */
function machineStateToStatus(state: ConnectionState): ConnectionStatus {
  switch (state) {
    case 'idle':
    case 'disconnected':
      return 'disconnected'
    case 'connecting':
      return 'connecting'
    case 'connected':
      return 'connected'
    case 'disconnecting':
      return 'disconnected' // Treat as disconnected during transition
    case 'reconnecting':
      return 'reconnecting'
    case 'error':
      return 'error'
    default:
      return 'disconnected'
  }
}

/**
 * Abstract base adapter class
 */
export abstract class BaseAdapter implements ConnectionAdapter {
  protected _disposed = false

  /** State machine for managing connection state */
  protected stateMachine: ConnectionStateMachine

  /** Message buffer manager */
  protected bufferManager = getMessageBufferManager()

  /** Whether to buffer messages when disconnected (default: true) */
  protected bufferEnabled = true

  protected statusListeners = new Set<StatusCallback>()
  protected messageListeners = new Set<MessageCallback>()
  protected errorListeners = new Set<ErrorCallback>()

  protected _reconnectTimer?: ReturnType<typeof setTimeout>

  constructor(
    public readonly connectionId: string,
    public readonly protocol: string,
    protected config: BaseConnectionConfig
  ) {
    // Initialize state machine
    this.stateMachine = createConnectionStateMachine()

    // Listen to state machine changes and emit status updates
    this.stateMachine.onStateChange((state, context) => {
      const status = machineStateToStatus(state)
      const statusInfo: ExtendedConnectionStatusInfo = {
        status,
        error: context.error,
        lastConnected: context.lastConnected,
        reconnectAttempts: context.reconnectAttempts,
        machineState: state,
        isBusy: this.stateMachine.isBusy(),
        bufferedMessages: this.bufferManager.getStats(connectionId).queued,
      }
      this.emitStatus(statusInfo)
    })
  }

  // =========================================================================
  // Status (derived from state machine)
  // =========================================================================

  get status(): ConnectionStatus {
    return machineStateToStatus(this.stateMachine.state)
  }

  /**
   * Get extended status info including buffer stats
   */
  getExtendedStatus(): ExtendedConnectionStatusInfo {
    const context = this.stateMachine.context
    return {
      status: this.status,
      error: context.error,
      lastConnected: context.lastConnected,
      reconnectAttempts: context.reconnectAttempts,
      machineState: this.stateMachine.state,
      isBusy: this.stateMachine.isBusy(),
      bufferedMessages: this.bufferManager.getStats(this.connectionId).queued,
    }
  }

  /**
   * Check if the adapter can accept a connect request
   */
  canConnect(): boolean {
    return this.stateMachine.can('CONNECT')
  }

  /**
   * Check if the adapter can accept a disconnect request
   */
  canDisconnect(): boolean {
    return this.stateMachine.can('DISCONNECT')
  }

  // =========================================================================
  // Status Emission (for backwards compatibility)
  // =========================================================================

  protected emitStatus(status: ConnectionStatusInfo): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status)
      } catch (e) {
        console.error('[BaseAdapter] Status listener error:', e)
      }
    }
  }

  protected emitMessage(message: { topic?: string; data: unknown }): void {
    for (const listener of this.messageListeners) {
      try {
        listener(message)
      } catch (e) {
        console.error('[BaseAdapter] Message listener error:', e)
      }
    }
  }

  protected emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error)
      } catch (e) {
        console.error('[BaseAdapter] Error listener error:', e)
      }
    }
  }

  // =========================================================================
  // Event Subscriptions
  // =========================================================================

  onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageListeners.add(callback)
    return () => this.messageListeners.delete(callback)
  }

  onError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback)
    return () => this.errorListeners.delete(callback)
  }

  // =========================================================================
  // Connection Lifecycle (with state machine)
  // =========================================================================

  /**
   * Connect to the remote endpoint
   * Uses state machine to prevent race conditions
   */
  async connect(): Promise<void> {
    if (this._disposed) {
      throw new Error('Adapter has been disposed')
    }

    // Check if we can connect
    if (!this.stateMachine.can('CONNECT')) {
      const currentState = this.stateMachine.state
      if (currentState === 'connected') {
        // Already connected, treat as success
        return
      }
      throw new Error(`Cannot connect from state: ${currentState}`)
    }

    // Transition to connecting
    this.stateMachine.send({ type: 'CONNECT' })

    try {
      await this.doConnect()
      this.stateMachine.send({ type: 'CONNECTED' })

      // Flush buffered messages after successful connection
      await this.flushBufferedMessages()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.stateMachine.send({ type: 'ERROR', error: errorMsg })
      this.emitError(error instanceof Error ? error : new Error(errorMsg))
      throw error
    }
  }

  /**
   * Disconnect from the remote endpoint
   * Uses state machine to prevent race conditions
   */
  async disconnect(): Promise<void> {
    // Cancel any pending reconnect
    this.cancelReconnect()

    // Check if we can disconnect
    if (!this.stateMachine.can('DISCONNECT')) {
      const currentState = this.stateMachine.state
      if (currentState === 'disconnected' || currentState === 'idle') {
        // Already disconnected
        return
      }
      // Force disconnect for cleanup
      console.warn(`[BaseAdapter] Force disconnect from state: ${currentState}`)
    }

    this.stateMachine.send({ type: 'DISCONNECT' })

    try {
      await this.doDisconnect()
    } catch (error) {
      console.error('[BaseAdapter] Disconnect error:', error)
    } finally {
      this.stateMachine.send({ type: 'DISCONNECTED' })
    }
  }

  /**
   * Send data with optional buffering
   */
  async send(data: unknown, options?: SendOptions): Promise<void> {
    const shouldBuffer = options?.buffer !== false && this.bufferEnabled

    if (this.stateMachine.isConnected()) {
      // Connected - send directly
      await this.doSend(data, options)
    } else if (shouldBuffer) {
      // Not connected - buffer the message
      const enqueueOptions: EnqueueOptions = {
        priority: options?.priority,
        ttl: options?.ttl,
        topic: options?.topic,
        sendOptions: options,
      }
      const messageId = this.bufferManager.enqueue(
        this.connectionId,
        data,
        enqueueOptions
      )
      if (messageId) {
        // message buffered successfully
      }
    } else {
      // Not connected and buffering disabled
      throw new Error('Not connected and buffering disabled')
    }
  }

  // =========================================================================
  // Message Buffer
  // =========================================================================

  /**
   * Flush buffered messages after connection
   */
  protected async flushBufferedMessages(): Promise<void> {
    const messages = this.bufferManager.flush(this.connectionId)
    if (messages.length === 0) return


    for (const message of messages) {
      try {
        await this.doSend(message.data, message.options as SendOptions)
        this.bufferManager.markSent(this.connectionId, message.id)
      } catch (error) {
        console.error(
          `[${this.protocol}] Failed to send buffered message ${message.id}:`,
          error
        )
        const willRetry = this.bufferManager.markFailed(
          this.connectionId,
          message.id
        )
        if (!willRetry) {
          console.warn(
            `[${this.protocol}] Message ${message.id} exceeded max retries, dropped`
          )
        }
      }
    }
  }

  /**
   * Get buffer statistics for this connection
   */
  getBufferStats() {
    return this.bufferManager.getStats(this.connectionId)
  }

  /**
   * Clear the message buffer for this connection
   */
  clearBuffer(): void {
    this.bufferManager.clear(this.connectionId)
  }

  // =========================================================================
  // Reconnection Logic
  // =========================================================================

  protected scheduleReconnect(): void {
    if (this._disposed) return
    if (!this.config.autoReconnect) return

    const context = this.stateMachine.context
    if (
      this.config.maxReconnectAttempts > 0 &&
      context.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.stateMachine.send({
        type: 'ERROR',
        error: 'Max reconnection attempts reached',
      })
      return
    }

    // Transition to reconnecting state
    if (!this.stateMachine.send({ type: 'RECONNECT_SCHEDULED' })) {
      // Can't schedule reconnect from current state
      return
    }

    const delay =
      this.config.reconnectDelay *
      Math.min(this.stateMachine.context.reconnectAttempts, 5)

    this._reconnectTimer = setTimeout(async () => {
      if (this._disposed) return

      // Start the reconnection attempt
      if (!this.stateMachine.send({ type: 'RECONNECT_START' })) {
        // Can't start reconnect from current state
        return
      }

      try {
        await this.connect()
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`[${this.protocol}] Reconnect failed:`, errorMsg)
        // Transition to error state before scheduling next reconnect
        this.stateMachine.send({ type: 'ERROR', error: errorMsg })
        this.scheduleReconnect()
      }
    }, delay)
  }

  protected cancelReconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = undefined
    }
  }

  /**
   * Connect with explicit retry logic and exponential backoff.
   * Use this for initial connections where you want immediate retries.
   * @param maxRetries Maximum number of retry attempts (default: 3)
   * @param baseDelay Base delay between retries in ms (default: 1000)
   * @param maxDelay Maximum delay cap in ms (default: 10000)
   */
  async connectWithRetry(
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 10000
  ): Promise<void> {
    if (this._disposed) {
      throw new Error('Adapter has been disposed')
    }

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.connect()
        return // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          // Calculate exponential backoff delay with jitter
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
          const jitter = Math.random() * delay * 0.1 // 10% jitter
          const totalDelay = delay + jitter


          await this.sleep(totalDelay)
        }
      }
    }

    // All retries exhausted
    throw lastError ?? new Error('Connection failed after all retries')
  }

  /**
   * Helper to sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Handle unexpected disconnection (connection dropped)
   * Call this from subclass when connection is lost unexpectedly
   */
  protected handleUnexpectedDisconnect(error?: string): void {
    if (this._disposed) return

    const currentState = this.stateMachine.state

    // If already in error state, don't send another event
    // Just schedule reconnect if configured
    if (currentState === 'error') {
      this.scheduleReconnect()
      return
    }

    // If in connecting state and there's an error, send ERROR
    if (currentState === 'connecting' && error) {
      this.stateMachine.send({ type: 'ERROR', error })
    } else if (error) {
      // For other states, send ERROR if there's an error message
      this.stateMachine.send({ type: 'ERROR', error })
    } else if (this.stateMachine.can('DISCONNECTED')) {
      // Only send DISCONNECTED if it's a valid transition
      this.stateMachine.send({ type: 'DISCONNECTED' })
    }

    // Schedule reconnection if configured
    this.scheduleReconnect()
  }

  // =========================================================================
  // Abstract Methods (to be implemented by subclasses)
  // =========================================================================

  /**
   * Perform the actual connection
   * Called after state machine validates the transition
   */
  protected abstract doConnect(): Promise<void>

  /**
   * Perform the actual disconnection
   * Called after state machine validates the transition
   */
  protected abstract doDisconnect(): Promise<void>

  /**
   * Perform the actual send operation
   * Called when connected, or for processing buffered messages
   */
  protected abstract doSend(
    data: unknown,
    options?: SendOptions
  ): Promise<void>

  // =========================================================================
  // Lifecycle
  // =========================================================================

  dispose(): void {
    this._disposed = true
    this.cancelReconnect()

    // Clear message buffer
    this.bufferManager.removeBuffer(this.connectionId)

    // Clear all listeners
    this.statusListeners.clear()
    this.messageListeners.clear()
    this.errorListeners.clear()

    // Disconnect if connected
    if (
      this.stateMachine.isConnected() ||
      this.stateMachine.state === 'connecting'
    ) {
      this.disconnect().catch(() => {
        // Ignore disconnect errors during disposal
      })
    }

    // Reset state machine
    this.stateMachine.send({ type: 'RESET' })
  }
}
