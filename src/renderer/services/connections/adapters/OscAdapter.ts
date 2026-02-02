/**
 * OSC Adapter
 *
 * OSC (Open Sound Control) adapter for browser-compatible OSC communication.
 * Uses WebSocket transport since browsers cannot use UDP directly.
 * Compatible with OSC bridges like CLASP Bridge.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import OSC from 'osc-js'

// OSC message argument types
type OscArgument = number | string | Uint8Array | boolean | null
import { BaseAdapter } from './BaseAdapter'
import type {
  OscConnectionConfig,
  ConnectionTypeDefinition,
  SendOptions,
} from '../types'

export class OscAdapterImpl extends BaseAdapter {
  private osc: OSC | null = null
  private oscConfig: OscConnectionConfig

  constructor(config: OscConnectionConfig) {
    super(config.id, 'osc', config)
    this.oscConfig = config
  }

  protected async doConnect(): Promise<void> {
    if (this.osc?.status() === OSC.STATUS.IS_OPEN) {
      return
    }

    return new Promise((resolve, reject) => {
      try {
        // osc-js uses WebSocket plugin for browser
        const osc = new OSC({
          plugin: new OSC.WebsocketClientPlugin({
            host: this.oscConfig.host,
            port: this.oscConfig.port,
          }),
        })
        this.osc = osc

        const timeout = setTimeout(() => {
          osc.close()
          reject(new Error('Connection timeout'))
        }, 10000)

        osc.on('open', () => {
          clearTimeout(timeout)
          resolve()
        })

        osc.on('*', (message: { address: string; args: unknown[] }) => {
          this.emitMessage({
            topic: message.address,
            data: message.args,
          })
        })

        osc.on('error', (err: Error) => {
          clearTimeout(timeout)
          this.emitError(err)
          reject(err)
        })

        osc.on('close', () => {
          clearTimeout(timeout)
          this.osc = null

          if (!this._disposed) {
            this.handleUnexpectedDisconnect()
          }
        })

        osc.open()
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        reject(error)
      }
    })
  }

  protected async doDisconnect(): Promise<void> {
    if (this.osc) {
      this.osc.close()
      this.osc = null
    }
  }

  protected async doSend(data: unknown, options?: SendOptions): Promise<void> {
    if (!this.osc || this.osc.status() !== OSC.STATUS.IS_OPEN) {
      throw new Error('Not connected')
    }

    const address = options?.topic
    if (!address) {
      throw new Error('OSC address is required')
    }

    const args = Array.isArray(data) ? data : [data]
    const message = new OSC.Message(address, ...args)
    this.osc.send(message)
  }

  /**
   * Send an OSC message to an address
   */
  sendMessage(address: string, ...args: OscArgument[]): void {
    if (!this.osc || this.osc.status() !== OSC.STATUS.IS_OPEN) {
      throw new Error('Not connected')
    }

    const message = new OSC.Message(address, ...(args as any[]))
    this.osc.send(message)
  }

  /**
   * Send an OSC bundle (multiple messages with timetag)
   */
  sendBundle(messages: Array<{ address: string; args: OscArgument[] }>, timetag?: number): void {
    if (!this.osc || this.osc.status() !== OSC.STATUS.IS_OPEN) {
      throw new Error('Not connected')
    }

    const oscMessages = messages.map(m => new OSC.Message(m.address, ...(m.args as any[])))
    const bundle = new OSC.Bundle(oscMessages, timetag ?? Date.now())
    this.osc.send(bundle)
  }
}

export const oscConnectionType: ConnectionTypeDefinition<OscConnectionConfig> = {
  id: 'osc',
  name: 'OSC',
  icon: 'radio-tower',
  color: '#F97316',
  category: 'protocol',
  description: 'Open Sound Control over WebSocket (use with CLASP Bridge)',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'host',
      type: 'text',
      label: 'Host',
      description: 'OSC WebSocket server host',
      default: 'localhost',
    },
    {
      id: 'port',
      type: 'number',
      label: 'Port',
      description: 'OSC WebSocket server port',
      default: 8080,
      props: { min: 1, max: 65535 },
    },
    {
      id: 'transport',
      type: 'select',
      label: 'Transport',
      description: 'Transport protocol (WebSocket for browser)',
      default: 'websocket',
      props: {
        options: [
          { value: 'websocket', label: 'WebSocket' },
          { value: 'udp', label: 'UDP (Electron only)' },
        ],
      },
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
    host: 'localhost',
    port: 8080,
    transport: 'websocket',
    autoConnect: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  createAdapter: (config) => new OscAdapterImpl(config),
}
