/**
 * Connection State Machine
 *
 * Provides explicit state management for connections to prevent race conditions
 * and ensure valid state transitions. Inspired by XState patterns but kept simple.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Valid connection states
 */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

/**
 * Events that can trigger state transitions
 */
export type ConnectionEvent =
  | { type: 'CONNECT' }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECT' }
  | { type: 'DISCONNECTED' }
  | { type: 'ERROR'; error: string }
  | { type: 'RECONNECT_SCHEDULED' }
  | { type: 'RECONNECT_START' }
  | { type: 'RESET' }

/**
 * State machine context (metadata associated with current state)
 */
export interface ConnectionContext {
  /** Current error message if in error state */
  error?: string
  /** Number of reconnection attempts */
  reconnectAttempts: number
  /** Timestamp of last successful connection */
  lastConnected?: Date
  /** Timestamp of state change */
  stateChangedAt: Date
}

/**
 * Callback for state changes
 */
export type StateChangeCallback = (
  state: ConnectionState,
  context: ConnectionContext,
  event: ConnectionEvent
) => void

// ============================================================================
// Transition Table
// ============================================================================

/**
 * Valid state transitions map
 * Key: current state
 * Value: map of event type -> next state
 */
const transitions: Record<ConnectionState, Partial<Record<ConnectionEvent['type'], ConnectionState>>> = {
  idle: {
    CONNECT: 'connecting',
  },
  connecting: {
    CONNECTED: 'connected',
    ERROR: 'error',
    DISCONNECT: 'disconnecting',
  },
  connected: {
    DISCONNECT: 'disconnecting',
    ERROR: 'error',
  },
  disconnecting: {
    DISCONNECTED: 'disconnected',
    ERROR: 'error',
  },
  disconnected: {
    CONNECT: 'connecting',
    RECONNECT_SCHEDULED: 'reconnecting',
    RESET: 'idle',
  },
  reconnecting: {
    RECONNECT_START: 'connecting',
    DISCONNECT: 'disconnected',
    RESET: 'idle',
  },
  error: {
    CONNECT: 'connecting',
    RECONNECT_SCHEDULED: 'reconnecting',
    RESET: 'idle',
    DISCONNECT: 'disconnected',
  },
}

// ============================================================================
// State Machine Class
// ============================================================================

/**
 * Connection state machine instance
 *
 * Usage:
 * ```typescript
 * const machine = new ConnectionStateMachine()
 *
 * machine.onStateChange((state, context, event) => {
 *   console.log(`State changed to ${state}`, context, event)
 * })
 *
 * if (machine.can('CONNECT')) {
 *   machine.send({ type: 'CONNECT' })
 * }
 * ```
 */
export class ConnectionStateMachine {
  private _state: ConnectionState = 'idle'
  private _context: ConnectionContext = {
    reconnectAttempts: 0,
    stateChangedAt: new Date(),
  }
  private listeners = new Set<StateChangeCallback>()

  /**
   * Get current state
   */
  get state(): ConnectionState {
    return this._state
  }

  /**
   * Get current context
   */
  get context(): Readonly<ConnectionContext> {
    return { ...this._context }
  }

  /**
   * Check if an event can be sent from current state
   */
  can(eventType: ConnectionEvent['type']): boolean {
    return transitions[this._state][eventType] !== undefined
  }

  /**
   * Get list of valid events from current state
   */
  validEvents(): ConnectionEvent['type'][] {
    return Object.keys(transitions[this._state]) as ConnectionEvent['type'][]
  }

  /**
   * Send an event to trigger a state transition
   * Returns true if transition was successful, false if invalid
   */
  send(event: ConnectionEvent): boolean {
    const nextState = transitions[this._state][event.type]

    if (nextState === undefined) {
      console.warn(
        `[ConnectionStateMachine] Invalid transition: ${this._state} + ${event.type}`
      )
      return false
    }

    this._state = nextState

    // Update context based on event
    this._context.stateChangedAt = new Date()

    if (event.type === 'ERROR' && 'error' in event) {
      this._context.error = event.error
    } else if (event.type === 'CONNECTED') {
      this._context.error = undefined
      this._context.reconnectAttempts = 0
      this._context.lastConnected = new Date()
    } else if (event.type === 'RECONNECT_SCHEDULED') {
      this._context.reconnectAttempts++
    } else if (event.type === 'RESET') {
      this._context.error = undefined
      this._context.reconnectAttempts = 0
    }

    // Notify listeners
    this.notifyListeners(event)


    return true
  }

  /**
   * Force state (use sparingly, mainly for initialization)
   */
  forceState(state: ConnectionState, context?: Partial<ConnectionContext>): void {
    this._state = state
    if (context) {
      Object.assign(this._context, context)
    }
    this._context.stateChangedAt = new Date()
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Check if in a "busy" state (connecting/disconnecting)
   */
  isBusy(): boolean {
    return this._state === 'connecting' || this._state === 'disconnecting'
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._state === 'connected'
  }

  /**
   * Check if in an error state
   */
  isError(): boolean {
    return this._state === 'error'
  }

  /**
   * Get state duration in milliseconds
   */
  getStateDuration(): number {
    return Date.now() - this._context.stateChangedAt.getTime()
  }

  private notifyListeners(event: ConnectionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(this._state, this._context, event)
      } catch (error) {
        console.error('[ConnectionStateMachine] Listener error:', error)
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new connection state machine
 */
export function createConnectionStateMachine(): ConnectionStateMachine {
  return new ConnectionStateMachine()
}
