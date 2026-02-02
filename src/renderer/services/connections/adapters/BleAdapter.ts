/**
 * BLE Connection Adapter
 *
 * Enhanced Bluetooth Low Energy adapter with:
 * - Device scanning and discovery
 * - Service/characteristic enumeration
 * - Multiple data format support
 * - Auto-reconnection
 * - Standard BLE profile detection
 */

import { BaseAdapter } from './BaseAdapter'
import type { BleConnectionConfig, SendOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface BleDeviceInfo {
  id: string
  name: string
  connected: boolean
  rssi?: number
  services?: string[]
}

export interface BleServiceInfo {
  uuid: string
  isPrimary: boolean
  characteristics: BleCharacteristicInfo[]
}

export interface BleCharacteristicInfo {
  uuid: string
  properties: BleCharacteristicProperties
  descriptors?: string[]
}

export interface BleCharacteristicProperties {
  read: boolean
  write: boolean
  writeWithoutResponse: boolean
  notify: boolean
  indicate: boolean
  broadcast: boolean
  authenticatedSignedWrites: boolean
}

export type BleDataFormat = 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32' | 'float64' | 'utf8' | 'raw'

// Standard BLE profile UUIDs
export const BLE_STANDARD_SERVICES = {
  // Health & Fitness
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  HEART_RATE_SHORT: '180d',
  BLOOD_PRESSURE: '00001810-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  RUNNING_SPEED_CADENCE: '00001814-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE: '00001826-0000-1000-8000-00805f9b34fb',

  // Environment
  ENVIRONMENTAL_SENSING: '0000181a-0000-1000-8000-00805f9b34fb',
  TEMPERATURE: '00001809-0000-1000-8000-00805f9b34fb',

  // Device Info
  DEVICE_INFORMATION: '0000180a-0000-1000-8000-00805f9b34fb',
  BATTERY_SERVICE: '0000180f-0000-1000-8000-00805f9b34fb',

  // Input
  HID: '00001812-0000-1000-8000-00805f9b34fb',

  // Generic
  GENERIC_ACCESS: '00001800-0000-1000-8000-00805f9b34fb',
  GENERIC_ATTRIBUTE: '00001801-0000-1000-8000-00805f9b34fb',
}

export const BLE_STANDARD_CHARACTERISTICS = {
  // Heart Rate
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
  BODY_SENSOR_LOCATION: '00002a38-0000-1000-8000-00805f9b34fb',

  // Battery
  BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',

  // Device Information
  MANUFACTURER_NAME: '00002a29-0000-1000-8000-00805f9b34fb',
  MODEL_NUMBER: '00002a24-0000-1000-8000-00805f9b34fb',
  FIRMWARE_REVISION: '00002a26-0000-1000-8000-00805f9b34fb',
  SERIAL_NUMBER: '00002a25-0000-1000-8000-00805f9b34fb',

  // Environmental
  TEMPERATURE: '00002a6e-0000-1000-8000-00805f9b34fb',
  HUMIDITY: '00002a6f-0000-1000-8000-00805f9b34fb',
  PRESSURE: '00002a6d-0000-1000-8000-00805f9b34fb',
}

// ============================================================================
// BLE Adapter
// ============================================================================

export class BleAdapter extends BaseAdapter {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private services: Map<string, BluetoothRemoteGATTService> = new Map()
  private characteristics: Map<string, BluetoothRemoteGATTCharacteristic> = new Map()
  private notificationHandlers: Map<string, (value: DataView) => void> = new Map()
  private boundDisconnectHandler: (() => void) | null = null

  constructor(
    connectionId: string,
    private bleConfig: BleConnectionConfig
  ) {
    super(connectionId, 'ble', bleConfig)
    // BLE doesn't benefit from message buffering
    this.bufferEnabled = false
  }

  // =========================================================================
  // Static Device Scanning
  // =========================================================================

  /**
   * Scan for BLE devices
   * Note: Web Bluetooth requires user gesture, so this triggers a picker dialog
   */
  static async scanDevices(options?: {
    filters?: BluetoothLEScanFilter[]
    optionalServices?: BluetoothServiceUUID[]
    acceptAllDevices?: boolean
  }): Promise<BluetoothDevice | null> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth API not supported')
    }

    const bluetooth = (navigator as Navigator & { bluetooth: Bluetooth }).bluetooth

    try {
      // acceptAllDevices and filters are mutually exclusive
      if (options?.acceptAllDevices) {
        return await bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: options.optionalServices || [],
        })
      }

      // Use filters if provided, otherwise use empty filters (will show device picker)
      const filters = options?.filters && options.filters.length > 0 ? options.filters : undefined
      if (filters) {
        return await bluetooth.requestDevice({
          filters,
          optionalServices: options?.optionalServices || [],
        })
      }

      // Fallback: accept all devices
      return await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: options?.optionalServices || [],
      })
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        // User cancelled the picker
        return null
      }
      throw error
    }
  }

  /**
   * Get list of previously paired devices
   */
  static async getPairedDevices(): Promise<BluetoothDevice[]> {
    if (!('bluetooth' in navigator)) {
      return []
    }

    const bluetooth = (navigator as Navigator & { bluetooth: Bluetooth }).bluetooth

    // getDevices() is available in newer browsers
    if ('getDevices' in bluetooth) {
      try {
        return await (bluetooth as Bluetooth & { getDevices(): Promise<BluetoothDevice[]> }).getDevices()
      } catch {
        return []
      }
    }

    return []
  }

  // =========================================================================
  // Connection
  // =========================================================================

  protected async doConnect(): Promise<void> {
    // If we don't have a device, request one
    if (!this.device) {
      const filters: BluetoothLEScanFilter[] = []
      const optionalServices: BluetoothServiceUUID[] = []

      if (this.bleConfig.serviceUUID) {
        // Try to use short UUID if it's a standard service
        const shortUUID = this.bleConfig.serviceUUID.length <= 4
          ? this.bleConfig.serviceUUID
          : this.bleConfig.serviceUUID

        filters.push({ services: [shortUUID] })
        optionalServices.push(shortUUID)
      }

      if (this.bleConfig.characteristicUUIDs) {
        optionalServices.push(...this.bleConfig.characteristicUUIDs)
      }

      this.device = await BleAdapter.scanDevices({
        filters: filters.length > 0 ? filters : undefined,
        optionalServices,
        acceptAllDevices: filters.length === 0,
      })

      if (!this.device) {
        throw new Error('No device selected')
      }

      // Listen for disconnection - store bound handler for cleanup
      this.boundDisconnectHandler = () => this.handleBleDisconnect()
      this.device.addEventListener('gattserverdisconnected', this.boundDisconnectHandler)
    }

    // Connect to GATT server
    if (!this.device.gatt) {
      throw new Error('GATT not available on device')
    }

    this.server = await this.device.gatt.connect()

    // Enumerate services if we have a service UUID
    if (this.bleConfig.serviceUUID) {
      await this.discoverServices()
    }

  }

  protected async doDisconnect(): Promise<void> {
    // Stop all notifications
    for (const [uuid, characteristic] of this.characteristics) {
      try {
        if (this.notificationHandlers.has(uuid)) {
          await characteristic.stopNotifications()
        }
      } catch {
        // Ignore errors during disconnect
      }
    }

    this.notificationHandlers.clear()
    this.characteristics.clear()
    this.services.clear()

    if (this.server?.connected) {
      this.server.disconnect()
    }

    this.server = null
    // Keep device reference for reconnection
  }

  protected async doSend(data: unknown, options?: SendOptions): Promise<void> {
    const uuid = options?.topic
    const format = (options?.format as BleDataFormat) || 'raw'

    if (!uuid) {
      throw new Error('Characteristic UUID required for send')
    }

    await this.writeCharacteristic(uuid, data as ArrayBuffer | Uint8Array | number | string, format)
  }

  private handleBleDisconnect(): void {
    this.server = null
    this.characteristics.clear()
    this.services.clear()
    this.notificationHandlers.clear()

    if (!this._disposed) {
      this.handleUnexpectedDisconnect()
    }
  }

  // =========================================================================
  // Service Discovery
  // =========================================================================

  async discoverServices(): Promise<BleServiceInfo[]> {
    if (!this.server?.connected) {
      throw new Error('Not connected')
    }

    const serviceInfos: BleServiceInfo[] = []

    try {
      let services: BluetoothRemoteGATTService[]

      if (this.bleConfig.serviceUUID) {
        // Get specific service
        const service = await this.server.getPrimaryService(this.bleConfig.serviceUUID)
        services = [service]
      } else {
        // Get all services
        services = await this.server.getPrimaryServices()
      }

      for (const service of services) {
        this.services.set(service.uuid, service)

        const characteristics = await service.getCharacteristics()
        const charInfos: BleCharacteristicInfo[] = []

        for (const char of characteristics) {
          this.characteristics.set(char.uuid, char)

          charInfos.push({
            uuid: char.uuid,
            properties: {
              read: char.properties.read,
              write: char.properties.write,
              writeWithoutResponse: char.properties.writeWithoutResponse,
              notify: char.properties.notify,
              indicate: char.properties.indicate,
              broadcast: char.properties.broadcast,
              authenticatedSignedWrites: char.properties.authenticatedSignedWrites,
            },
          })
        }

        serviceInfos.push({
          uuid: service.uuid,
          isPrimary: service.isPrimary,
          characteristics: charInfos,
        })
      }
    } catch (error) {
      console.error('[BLE] Service discovery error:', error)
    }

    return serviceInfos
  }

  async getServices(): Promise<BleServiceInfo[]> {
    return this.discoverServices()
  }

  // =========================================================================
  // Characteristic Operations
  // =========================================================================

  async readCharacteristic(uuid: string, format: BleDataFormat = 'raw'): Promise<unknown> {
    const characteristic = this.characteristics.get(uuid) || await this.getCharacteristic(uuid)

    if (!characteristic) {
      throw new Error(`Characteristic ${uuid} not found`)
    }

    if (!characteristic.properties.read) {
      throw new Error(`Characteristic ${uuid} does not support read`)
    }

    const value = await characteristic.readValue()
    return this.parseValue(value, format)
  }

  async writeCharacteristic(
    uuid: string,
    data: ArrayBuffer | Uint8Array | number | string,
    format: BleDataFormat = 'raw',
    withResponse = true
  ): Promise<void> {
    const characteristic = this.characteristics.get(uuid) || await this.getCharacteristic(uuid)

    if (!characteristic) {
      throw new Error(`Characteristic ${uuid} not found`)
    }

    const buffer = this.encodeValue(data, format)

    if (withResponse && characteristic.properties.write) {
      await characteristic.writeValue(buffer)
    } else if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(buffer)
    } else {
      throw new Error(`Characteristic ${uuid} does not support write`)
    }
  }

  async subscribeToNotifications(
    uuid: string,
    callback: (value: unknown, raw: DataView) => void,
    format: BleDataFormat = 'raw'
  ): Promise<void> {
    const characteristic = this.characteristics.get(uuid) || await this.getCharacteristic(uuid)

    if (!characteristic) {
      throw new Error(`Characteristic ${uuid} not found`)
    }

    if (!characteristic.properties.notify && !characteristic.properties.indicate) {
      throw new Error(`Characteristic ${uuid} does not support notifications`)
    }

    // Store handler
    const handler = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic
      if (target.value) {
        const parsed = this.parseValue(target.value, format)
        callback(parsed, target.value)
        this.emitMessage({ topic: uuid, data: parsed })
      }
    }

    this.notificationHandlers.set(uuid, (value: DataView) => {
      const parsed = this.parseValue(value, format)
      callback(parsed, value)
    })

    characteristic.addEventListener('characteristicvaluechanged', handler)
    await characteristic.startNotifications()
  }

  async unsubscribeFromNotifications(uuid: string): Promise<void> {
    const characteristic = this.characteristics.get(uuid)

    if (characteristic && this.notificationHandlers.has(uuid)) {
      try {
        await characteristic.stopNotifications()
      } catch {
        // Ignore
      }
      this.notificationHandlers.delete(uuid)
    }
  }

  private async getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic | null> {
    // Search in discovered services
    for (const service of this.services.values()) {
      try {
        const char = await service.getCharacteristic(uuid)
        this.characteristics.set(uuid, char)
        return char
      } catch {
        // Not in this service, continue
      }
    }

    return null
  }

  // =========================================================================
  // Data Parsing
  // =========================================================================

  private parseValue(value: DataView, format: BleDataFormat): unknown {
    switch (format) {
      case 'uint8':
        return value.getUint8(0)
      case 'int8':
        return value.getInt8(0)
      case 'uint16':
        return value.getUint16(0, true)
      case 'int16':
        return value.getInt16(0, true)
      case 'uint32':
        return value.getUint32(0, true)
      case 'int32':
        return value.getInt32(0, true)
      case 'float32':
        return value.getFloat32(0, true)
      case 'float64':
        return value.getFloat64(0, true)
      case 'utf8':
        return new TextDecoder().decode(value.buffer)
      case 'raw':
      default:
        return new Uint8Array(value.buffer)
    }
  }

  private encodeValue(data: ArrayBuffer | Uint8Array | number | string, format: BleDataFormat): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
      return data
    }

    if (data instanceof Uint8Array) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    }

    if (typeof data === 'string') {
      return new TextEncoder().encode(data).buffer
    }

    // Number
    let buffer: ArrayBuffer
    let view: DataView

    switch (format) {
      case 'uint8':
      case 'int8':
        buffer = new ArrayBuffer(1)
        view = new DataView(buffer)
        format === 'uint8' ? view.setUint8(0, data) : view.setInt8(0, data)
        break
      case 'uint16':
      case 'int16':
        buffer = new ArrayBuffer(2)
        view = new DataView(buffer)
        format === 'uint16' ? view.setUint16(0, data, true) : view.setInt16(0, data, true)
        break
      case 'uint32':
      case 'int32':
        buffer = new ArrayBuffer(4)
        view = new DataView(buffer)
        format === 'uint32' ? view.setUint32(0, data, true) : view.setInt32(0, data, true)
        break
      case 'float32':
        buffer = new ArrayBuffer(4)
        view = new DataView(buffer)
        view.setFloat32(0, data, true)
        break
      case 'float64':
        buffer = new ArrayBuffer(8)
        view = new DataView(buffer)
        view.setFloat64(0, data, true)
        break
      default:
        buffer = new ArrayBuffer(1)
        view = new DataView(buffer)
        view.setUint8(0, data)
    }

    return buffer
  }

  // =========================================================================
  // Device Info
  // =========================================================================

  getDeviceInfo(): BleDeviceInfo | null {
    if (!this.device) return null

    return {
      id: this.device.id,
      name: this.device.name || 'Unknown',
      connected: this.server?.connected || false,
    }
  }

  getDeviceName(): string {
    return this.device?.name || 'Unknown Device'
  }

  isConnected(): boolean {
    return this.server?.connected || false
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  override dispose(): void {
    // Remove gattserverdisconnected event listener
    if (this.device && this.boundDisconnectHandler) {
      this.device.removeEventListener('gattserverdisconnected', this.boundDisconnectHandler)
      this.boundDisconnectHandler = null
    }

    super.dispose()
    this.device = null
    this.server = null
    this.services.clear()
    this.characteristics.clear()
    this.notificationHandlers.clear()
  }
}
