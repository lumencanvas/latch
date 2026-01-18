/**
 * Base Connection Adapter
 *
 * Abstract base class for all connection adapters.
 * Provides common functionality for status management, events, and reconnection.
 */

import type {
  BaseConnectionConfig,
  ConnectionAdapter,
  ConnectionStatus,
  ConnectionStatusInfo,
} from '../types'

type StatusCallback = (status: ConnectionStatusInfo) => void
type MessageCallback = (message: { topic?: string; data: unknown }) => void
type ErrorCallback = (error: Error) => void

/**
 * Abstract base adapter class
 */
export abstract class BaseAdapter implements ConnectionAdapter {
  protected _status: ConnectionStatus = 'disconnected'
  protected _error?: string
  protected _lastConnected?: Date
  protected _reconnectAttempts = 0
  protected _reconnectTimer?: ReturnType<typeof setTimeout>
  protected _disposed = false

  protected statusListeners = new Set<StatusCallback>()
  protected messageListeners = new Set<MessageCallback>()
  protected errorListeners = new Set<ErrorCallback>()

  constructor(
    public readonly connectionId: string,
    public readonly protocol: string,
    protected config: BaseConnectionConfig
  ) {}

  // =========================================================================
  // Status
  // =========================================================================

  get status(): ConnectionStatus {
    return this._status
  }

  protected setStatus(status: ConnectionStatus, error?: string): void {
    this._status = status
    this._error = error

    if (status === 'connected') {
      this._lastConnected = new Date()
      this._reconnectAttempts = 0
    }

    const statusInfo: ConnectionStatusInfo = {
      status,
      error,
      lastConnected: this._lastConnected,
      reconnectAttempts: this._reconnectAttempts,
    }

    this.emitStatus(statusInfo)
  }

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
  // Reconnection Logic
  // =========================================================================

  protected scheduleReconnect(): void {
    if (this._disposed) return
    if (!this.config.autoReconnect) return
    if (
      this.config.maxReconnectAttempts > 0 &&
      this._reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      console.log(
        `[${this.protocol}] Max reconnect attempts reached for ${this.connectionId}`
      )
      this.setStatus('error', 'Max reconnection attempts reached')
      return
    }

    this._reconnectAttempts++
    this.setStatus('reconnecting')

    const delay = this.config.reconnectDelay * Math.min(this._reconnectAttempts, 5)
    console.log(
      `[${this.protocol}] Scheduling reconnect for ${this.connectionId} in ${delay}ms (attempt ${this._reconnectAttempts})`
    )

    this._reconnectTimer = setTimeout(async () => {
      if (this._disposed) return

      try {
        await this.connect()
      } catch (error) {
        console.error(`[${this.protocol}] Reconnect failed:`, error)
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

  // =========================================================================
  // Abstract Methods
  // =========================================================================

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract send(data: unknown, options?: Record<string, unknown>): Promise<void>

  // =========================================================================
  // Lifecycle
  // =========================================================================

  dispose(): void {
    this._disposed = true
    this.cancelReconnect()

    // Clear all listeners
    this.statusListeners.clear()
    this.messageListeners.clear()
    this.errorListeners.clear()

    // Disconnect if connected
    if (this._status === 'connected' || this._status === 'connecting') {
      this.disconnect().catch(() => {
        // Ignore disconnect errors during disposal
      })
    }
  }
}
