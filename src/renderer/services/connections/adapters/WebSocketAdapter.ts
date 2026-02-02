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
  SendOptions,
} from '../types'

export class WebSocketAdapterImpl extends BaseAdapter {
  private ws: WebSocket | null = null
  private wsConfig: WebSocketConnectionConfig

  constructor(config: WebSocketConnectionConfig) {
    super(config.id, 'websocket', config)
    this.wsConfig = config
  }

  protected async doConnect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

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
          this.emitError(error)
          reject(error)
        }

        ws.onclose = () => {
          clearTimeout(timeout)
          this.ws = null

          if (!this._disposed) {
            this.handleUnexpectedDisconnect()
          }
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        reject(error)
      }
    })
  }

  protected async doDisconnect(): Promise<void> {
    if (this.ws) {
      // Nullify event handlers before closing to prevent stale callbacks
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }

  protected async doSend(data: unknown, _options?: SendOptions): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data)
    this.ws.send(message)
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
