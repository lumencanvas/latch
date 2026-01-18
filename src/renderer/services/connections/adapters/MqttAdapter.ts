/**
 * MQTT Adapter
 *
 * Direct MQTT adapter for connecting to MQTT brokers.
 * Supports multiple transports: ws, wss (browser), mqtt, mqtts (Electron/Node).
 */

import mqtt from 'mqtt'
import type { MqttClient, IClientOptions } from 'mqtt'
import { BaseAdapter } from './BaseAdapter'
import type {
  MqttConnectionConfig,
  ConnectionTypeDefinition,
} from '../types'
import { isElectron } from '@/utils/platform'

export class MqttAdapterImpl extends BaseAdapter {
  protocol = 'mqtt'
  private client: MqttClient | null = null
  private mqttConfig: MqttConnectionConfig
  private subscriptions = new Map<string, { qos: 0 | 1 | 2 }>()

  constructor(config: MqttConnectionConfig) {
    super(config.id, 'mqtt', config)
    this.mqttConfig = config
  }

  /**
   * Build the broker URL from config fields
   */
  private getBrokerUrl(): string {
    // Support legacy brokerUrl field
    if (this.mqttConfig.brokerUrl) {
      return this.mqttConfig.brokerUrl
    }

    const { transport, host, port, path } = this.mqttConfig
    const wsPath = path || '/mqtt'

    switch (transport) {
      case 'ws':
        return `ws://${host}:${port}${wsPath}`
      case 'wss':
        return `wss://${host}:${port}${wsPath}`
      case 'mqtt':
        return `mqtt://${host}:${port}`
      case 'mqtts':
        return `mqtts://${host}:${port}`
      default:
        // Default to ws for browser compatibility
        return `ws://${host}:${port}${wsPath}`
    }
  }

  async connect(): Promise<void> {
    if (this.client?.connected) {
      return
    }

    this.setStatus('connecting')

    return new Promise((resolve, reject) => {
      try {
        const brokerUrl = this.getBrokerUrl()
        const connectTimeout = this.mqttConfig.connectTimeout ?? 10000

        const options: IClientOptions = {
          clientId: this.mqttConfig.clientId || `latch_${Math.random().toString(16).slice(2, 10)}`,
          keepalive: this.mqttConfig.keepAlive ?? 60,
          clean: this.mqttConfig.cleanSession ?? true,
          reconnectPeriod: 0, // We handle reconnection ourselves
          connectTimeout,
          protocolVersion: this.mqttConfig.protocolVersion ?? 4,
        }

        // Authentication
        if (this.mqttConfig.username) {
          options.username = this.mqttConfig.username
        }
        if (this.mqttConfig.password) {
          options.password = this.mqttConfig.password
        }

        // Last Will and Testament
        if (this.mqttConfig.will?.topic) {
          options.will = {
            topic: this.mqttConfig.will.topic,
            payload: Buffer.from(this.mqttConfig.will.payload || ''),
            qos: this.mqttConfig.will.qos ?? 0,
            retain: this.mqttConfig.will.retain ?? false,
          }
        }

        console.log(`[MQTT] Connecting to ${brokerUrl}...`)
        const client = mqtt.connect(brokerUrl, options)
        this.client = client

        const timeout = setTimeout(() => {
          client.end(true)
          reject(new Error('Connection timeout'))
        }, connectTimeout)

        client.on('connect', () => {
          clearTimeout(timeout)
          this.setStatus('connected')
          console.log(`[MQTT] Connected to ${brokerUrl}`)

          // Resubscribe to any existing subscriptions
          for (const [topic, opts] of this.subscriptions) {
            client.subscribe(topic, { qos: opts.qos })
          }

          resolve()
        })

        client.on('message', (topic, payload) => {
          let data: unknown = payload.toString()
          try {
            data = JSON.parse(data as string)
          } catch {
            // Keep as string if not JSON
          }
          this.emitMessage({ topic, data })
        })

        client.on('error', (err) => {
          clearTimeout(timeout)
          console.error(`[MQTT] Error:`, err.message)
          this.setStatus('error', err.message)
          this.emitError(err)
          reject(err)
        })

        client.on('close', () => {
          clearTimeout(timeout)
          this.client = null

          if (this._status !== 'error' && !this._disposed) {
            this.setStatus('disconnected')
            this.scheduleReconnect()
          }
        })

        client.on('offline', () => {
          if (this._status === 'connected') {
            this.setStatus('disconnected')
          }
        })
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

    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client!.end(false, {}, () => {
          this.client = null
          resolve()
        })
      })
    }

    this.setStatus('disconnected')
  }

  async send(data: unknown, options?: { topic?: string; qos?: 0 | 1 | 2; retain?: boolean }): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error('Not connected')
    }

    const topic = options?.topic
    if (!topic) {
      throw new Error('Topic is required for MQTT publish')
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data)
    this.client.publish(topic, message, {
      qos: options?.qos ?? 0,
      retain: options?.retain ?? false,
    })
  }

  /**
   * Subscribe to an MQTT topic
   */
  subscribe(topic: string, qos: 0 | 1 | 2 = 0): void {
    this.subscriptions.set(topic, { qos })
    if (this.client?.connected) {
      this.client.subscribe(topic, { qos })
    }
  }

  /**
   * Unsubscribe from an MQTT topic
   */
  unsubscribe(topic: string): void {
    this.subscriptions.delete(topic)
    if (this.client?.connected) {
      this.client.unsubscribe(topic)
    }
  }

  /**
   * Publish a message to a topic
   */
  publish(topic: string, message: unknown, options?: { qos?: 0 | 1 | 2; retain?: boolean }): void {
    if (!this.client || !this.client.connected) {
      throw new Error('Not connected')
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message)
    this.client.publish(topic, payload, {
      qos: options?.qos ?? 0,
      retain: options?.retain ?? false,
    })
  }

  dispose(): void {
    this.subscriptions.clear()
    super.dispose()
  }
}

export const mqttConnectionType: ConnectionTypeDefinition<MqttConnectionConfig> = {
  id: 'mqtt',
  name: 'MQTT',
  icon: 'radio',
  color: '#8B5CF6',
  category: 'protocol',
  description: 'Connect to an MQTT broker for pub/sub messaging',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'transport',
      type: 'select',
      label: 'Transport',
      description: 'Connection protocol (ws/wss for browser, mqtt/mqtts for Electron)',
      default: 'ws',
      props: {
        options: isElectron()
          ? [
              { value: 'mqtt', label: 'MQTT (tcp)' },
              { value: 'mqtts', label: 'MQTT/TLS (tcp+tls)' },
              { value: 'ws', label: 'WebSocket' },
              { value: 'wss', label: 'WebSocket/TLS' },
            ]
          : [
              { value: 'ws', label: 'WebSocket' },
              { value: 'wss', label: 'WebSocket/TLS (secure)' },
            ],
      },
    },
    {
      id: 'host',
      type: 'text',
      label: 'Host',
      description: 'Broker hostname or IP address',
      default: 'localhost',
    },
    {
      id: 'port',
      type: 'number',
      label: 'Port',
      description: 'Broker port (common: 1883 tcp, 8883 tls, 8083 ws, 8084 wss)',
      default: 8083,
      props: { min: 1, max: 65535 },
    },
    {
      id: 'path',
      type: 'text',
      label: 'WebSocket Path',
      description: 'Path for WebSocket connections (usually /mqtt)',
      default: '/mqtt',
    },
    {
      id: 'clientId',
      type: 'text',
      label: 'Client ID',
      description: 'Unique client identifier (auto-generated if empty)',
      default: '',
    },
    {
      id: 'username',
      type: 'text',
      label: 'Username',
      description: 'Authentication username (optional)',
      default: '',
    },
    {
      id: 'password',
      type: 'text',
      label: 'Password',
      description: 'Authentication password (optional)',
      default: '',
      props: { type: 'password' },
    },
    {
      id: 'cleanSession',
      type: 'checkbox',
      label: 'Clean Session',
      description: 'Start with a clean session (no persistent subscriptions)',
      default: true,
    },
    {
      id: 'keepAlive',
      type: 'number',
      label: 'Keep Alive (seconds)',
      description: 'Ping interval to keep connection alive',
      default: 60,
      props: { min: 10, max: 600, step: 10 },
    },
    {
      id: 'connectTimeout',
      type: 'number',
      label: 'Connect Timeout (ms)',
      description: 'Connection timeout in milliseconds',
      default: 10000,
      props: { min: 1000, max: 60000, step: 1000 },
    },
    {
      id: 'protocolVersion',
      type: 'select',
      label: 'Protocol Version',
      description: 'MQTT protocol version',
      default: 4,
      props: {
        options: [
          { value: 3, label: 'MQTT 3.1' },
          { value: 4, label: 'MQTT 3.1.1 (recommended)' },
          { value: 5, label: 'MQTT 5.0' },
        ],
      },
    },
    {
      id: 'autoConnect',
      type: 'checkbox',
      label: 'Auto Connect',
      description: 'Connect automatically when flow starts',
      default: true,
    },
    {
      id: 'autoReconnect',
      type: 'checkbox',
      label: 'Auto Reconnect',
      description: 'Automatically reconnect on connection loss',
      default: true,
    },
    {
      id: 'reconnectDelay',
      type: 'number',
      label: 'Reconnect Delay (ms)',
      description: 'Initial delay before reconnection attempts',
      default: 5000,
      props: { min: 1000, max: 60000, step: 1000 },
    },
  ],
  defaultConfig: {
    transport: 'ws',
    host: 'localhost',
    port: 8083,
    path: '/mqtt',
    clientId: '',
    username: '',
    password: '',
    cleanSession: true,
    keepAlive: 60,
    connectTimeout: 10000,
    protocolVersion: 4,
    autoConnect: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  createAdapter: (config) => new MqttAdapterImpl(config),
}
