/**
 * WebSocket Adapter
 *
 * Direct WebSocket adapter for when CLASP router is not available.
 * Provides a simple WebSocket connection with JSON message handling.
 */

import { BaseAdapter } from './BaseAdapter'
import type {
  WebSocketConnectionConfig,
  ConnectionTypeDefinition,
} from '../types'

export class WebSocketAdapterImpl extends BaseAdapter {
  protocol = 'websocket'
  private ws: WebSocket | null = null
  private wsConfig: WebSocketConnectionConfig

  constructor(config: WebSocketConnectionConfig) {
    super(config.id, 'websocket', config)
    this.wsConfig = config
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    this.setStatus('connecting')

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.wsConfig.url, this.wsConfig.protocols)
        this.ws = ws

        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Connection timeout'))
        }, 10000)

        ws.onopen = () => {
          clearTimeout(timeout)
          this.setStatus('connected')
          console.log(`[WebSocket] Connected to ${this.wsConfig.url}`)
          resolve()
        }

        ws.onmessage = (event) => {
          let data = event.data
          try {
            data = JSON.parse(event.data)
          } catch {
            // Keep as string if not JSON
          }
          this.emitMessage({ data })
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          const error = new Error('WebSocket error')
          this.setStatus('error', error.message)
          this.emitError(error)
          reject(error)
        }

        ws.onclose = () => {
          clearTimeout(timeout)
          this.ws = null

          if (this._status !== 'error' && !this._disposed) {
            this.setStatus('disconnected')
            this.scheduleReconnect()
          }
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        this.setStatus('error', error.message)
        reject(error)
      }
    })
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect()
    this.config.autoReconnect = false

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.setStatus('disconnected')
  }

  async send(data: unknown): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data)
    this.ws.send(message)
  }

  dispose(): void {
    super.dispose()
  }
}

export const websocketConnectionType: ConnectionTypeDefinition<WebSocketConnectionConfig> = {
  id: 'websocket',
  name: 'WebSocket',
  icon: 'plug',
  color: '#22C55E',
  category: 'protocol',
  description: 'Direct WebSocket connection to any WebSocket server',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'url',
      type: 'text',
      label: 'Server URL',
      description: 'WebSocket URL (ws:// or wss://)',
      default: 'ws://localhost:8080',
    },
    {
      id: 'protocols',
      type: 'text',
      label: 'Subprotocols',
      description: 'Optional comma-separated subprotocols',
      default: '',
    },
    {
      id: 'autoConnect',
      type: 'checkbox',
      label: 'Auto Connect',
      default: true,
    },
    {
      id: 'autoReconnect',
      type: 'checkbox',
      label: 'Auto Reconnect',
      default: true,
    },
    {
      id: 'reconnectDelay',
      type: 'number',
      label: 'Reconnect Delay (ms)',
      default: 5000,
      props: { min: 1000, max: 60000, step: 1000 },
    },
  ],
  defaultConfig: {
    url: 'ws://localhost:8080',
    protocols: [],
    autoConnect: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  createAdapter: (config) => new WebSocketAdapterImpl(config),
}
