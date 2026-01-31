/**
 * CLASP Protocol Adapter
 *
 * Adapter for the CLASP (Creative Low-latency Application Streaming Protocol).
 * Uses the official @clasp-to/core library for protocol handling.
 */

import { Clasp, ClaspBuilder, type Value } from '@clasp-to/core'
import { BaseAdapter } from './BaseAdapter'
import type {
  ClaspConnectionConfig,
  ClaspAdapter as IClaspAdapter,
  ConnectionTypeDefinition,
} from '../types'

// Re-export types from the library
export type ClaspValue = Value

/** Quality of Service levels (for API compatibility) */
export enum QoS {
  Fire = 0,
  Confirm = 1,
  Commit = 2,
}

/**
 * CLASP Adapter Implementation using @clasp-to/core
 */
export class ClaspAdapterImpl extends BaseAdapter implements IClaspAdapter {
  protocol = 'clasp' as const

  private client: Clasp | null = null
  private claspConfig: ClaspConnectionConfig
  private subscriptionCallbacks = new Map<number, () => void>()
  private nextSubId = 1

  constructor(config: ClaspConnectionConfig) {
    super(config.id, 'clasp', config)
    this.claspConfig = config
  }

  // =========================================================================
  // Connection Lifecycle
  // =========================================================================

  protected async doConnect(): Promise<void> {
    if (this.client?.connected) {
      return
    }

    const builder = new ClaspBuilder(this.claspConfig.url)
      .name(this.config.name || 'latch')
      .reconnect(false) // We handle reconnection via BaseAdapter

    if (this.claspConfig.token) {
      builder.token(this.claspConfig.token)
    }

    try {
      this.client = await builder.connect()
      console.log(`[CLASP] Connected to ${this.claspConfig.url}, session: ${this.client.session}`)
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      throw error
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (this.client) {
      this.client.close()
      this.client = null
    }
    this.subscriptionCallbacks.clear()
  }

  // =========================================================================
  // Send Methods
  // =========================================================================

  protected async doSend(data: unknown): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('Not connected')
    }

    // Handle different message types based on data structure
    if (typeof data === 'object' && data !== null) {
      const msg = data as Record<string, unknown>

      if (msg.type === 'SET' && msg.address) {
        this.client.set(msg.address as string, msg.value as Value)
      } else if (msg.type === 'PUBLISH' && msg.address) {
        if (msg.signal === 'stream') {
          this.client.stream(msg.address as string, msg.value as Value)
        } else if (msg.signal === 'gesture') {
          this.client.gesture(
            msg.address as string,
            (msg.gestureId ?? msg.id ?? 0) as number,
            (msg.phase ?? 'move') as 'start' | 'move' | 'end' | 'cancel',
            msg.payload as Value | undefined
          )
        } else {
          this.client.emit(msg.address as string, msg.payload as Value | undefined)
        }
      } else if (msg.type === 'BUNDLE' && Array.isArray(msg.messages)) {
        const bundleOpts = msg.timestamp ? { at: msg.timestamp as number } : undefined
        this.client.bundle(msg.messages as Array<{ set?: [string, Value]; emit?: [string, Value] }>, bundleOpts)
      } else if (msg.address) {
        // Generic send - treat as set if has address
        this.client.set(msg.address as string, (msg.value ?? msg) as Value)
      }
    }
  }

  // =========================================================================
  // CLASP-Specific Methods
  // =========================================================================

  async setParam(key: string, value: unknown): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('Not connected')
    }
    this.client.set(key, value as Value)
  }

  getParam(key: string): unknown {
    if (!this.client) {
      return undefined
    }
    return this.client.cached(key)
  }

  async subscribe(
    pattern: string,
    callback?: (address: string, value: ClaspValue, meta: Record<string, unknown>) => void,
    options?: { maxRate?: number; epsilon?: number }
  ): Promise<number> {
    if (!this.client?.connected) {
      throw new Error('Not connected')
    }

    const id = this.nextSubId++

    // Use the library's on() method with optional rate/epsilon filtering
    const unsubscribe = this.client.on(pattern, (value: Value, address: string) => {
      if (callback) {
        callback(address, value, { pattern })
      }
      // Also emit through the adapter's message system
      this.emitMessage({
        topic: address,
        data: { type: 'SET', value, address }
      })
    }, options)

    this.subscriptionCallbacks.set(id, unsubscribe)
    return id
  }

  async unsubscribe(subscriptionId: number): Promise<void> {
    const unsubscribe = this.subscriptionCallbacks.get(subscriptionId)
    if (unsubscribe) {
      unsubscribe()
      this.subscriptionCallbacks.delete(subscriptionId)
    }
  }

  async emit(trigger: string, payload?: unknown): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('Not connected')
    }
    this.client.emit(trigger, payload as Value | undefined)
  }

  async stream(channel: string, data: unknown): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('Not connected')
    }
    this.client.stream(channel, data as Value)
  }

  async sendBundle(
    messages: Array<{ set?: [string, ClaspValue]; emit?: [string, ClaspValue] }>,
    scheduledTime?: number
  ): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('Not connected')
    }
    const opts = scheduledTime ? { at: scheduledTime } : undefined
    this.client.bundle(messages as Array<{ set?: [string, Value]; emit?: [string, Value] }>, opts)
  }

  // =========================================================================
  // Getters
  // =========================================================================

  get session(): string | null {
    return this.client?.session ?? null
  }

  get serverTime(): number {
    return this.client?.time() ?? Date.now() * 1000
  }

  get allParams(): Map<string, ClaspValue> {
    // The library caches params internally
    return new Map()
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    this.subscriptionCallbacks.clear()
    super.dispose()
  }
}

// ============================================================================
// Connection Type Definition for Registration
// ============================================================================

export const claspConnectionType: ConnectionTypeDefinition<ClaspConnectionConfig> = {
  id: 'clasp',
  name: 'CLASP Router',
  icon: 'radio',
  color: '#6366f1',
  category: 'protocol',
  description: 'Connect to a CLASP (Creative Low-latency Application Streaming Protocol) router',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'url',
      type: 'text',
      label: 'Server URL',
      description: 'WebSocket URL of the CLASP router (e.g. ws://localhost:7330 or wss://relay.clasp.to)',
      default: 'ws://localhost:7330',
    },
    {
      id: 'token',
      type: 'text',
      label: 'Auth Token',
      description: 'Optional authentication token',
      default: '',
    },
    {
      id: 'autoConnect',
      type: 'checkbox',
      label: 'Auto Connect',
      description: 'Connect automatically on flow start',
      default: true,
    },
    {
      id: 'autoReconnect',
      type: 'checkbox',
      label: 'Auto Reconnect',
      description: 'Reconnect automatically on disconnect',
      default: true,
    },
    {
      id: 'reconnectDelay',
      type: 'number',
      label: 'Reconnect Delay (ms)',
      description: 'Delay between reconnection attempts',
      default: 5000,
      props: { min: 1000, max: 60000, step: 1000 },
    },
  ],
  defaultConfig: {
    url: 'ws://localhost:7330',
    token: '',
    autoConnect: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  createAdapter: (config) => new ClaspAdapterImpl(config),
}
