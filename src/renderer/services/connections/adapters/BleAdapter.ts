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
import type { BleConnectionConfig, ConnectionTypeDefinition, SendOptions } from '../types'

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
  /**
   * Devices granted this session, kept as a fallback for {@link getDeviceById} so the
   * gesture-free handoff doesn't depend SOLELY on `getDevices()` (flag-gated / absent on
   * some Chromium builds). Populated by {@link scanDevices} when a chooser grants a device.
   */
  private static grantedDevices = new Map<string, BluetoothDevice>()

  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private services: Map<string, BluetoothRemoteGATTService> = new Map()
  private characteristics: Map<string, BluetoothRemoteGATTCharacteristic> = new Map()
  private notificationHandlers: Map<string, (event: Event) => void> = new Map()
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
      let device: BluetoothDevice | null
      // acceptAllDevices and filters are mutually exclusive.
      const filters = options?.filters && options.filters.length > 0 ? options.filters : undefined
      if (options?.acceptAllDevices || !filters) {
        device = await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: options?.optionalServices || [] })
      } else {
        device = await bluetooth.requestDevice({ filters, optionalServices: options?.optionalServices || [] })
      }
      // Retain the granted device so getDeviceById can reconnect even where getDevices()
      // is unavailable (the sole-dependency handoff would otherwise silently fail).
      if (device) BleAdapter.grantedDevices.set(device.id, device)
      return device
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

  /**
   * Resolve a previously-granted device by its stable id WITHOUT a user gesture,
   * via `getDevices()`. Returns `null` when Web Bluetooth / `getDevices()` is
   * unavailable or the permission isn't held.
   *
   * This is the gesture-free reconnection path: the scan panel (a user gesture)
   * grants a device, and a `ble-scanner` node later re-resolves that exact device
   * by id from the render loop with no second chooser. `gatt.connect()` on the
   * returned device needs no gesture, so the whole run-driven reconnect is legal.
   */
  static async getDeviceById(id: string): Promise<BluetoothDevice | null> {
    if (!id) return null
    // Prefer a device granted this session (works even without getDevices()); fall back to
    // getDevices() for a cross-reload grant.
    const cached = BleAdapter.grantedDevices.get(id)
    if (cached) return cached
    const devices = await BleAdapter.getPairedDevices()
    const found = devices.find((d) => d.id === id) ?? null
    if (found) BleAdapter.grantedDevices.set(id, found)
    return found
  }

  /**
   * Inject a pre-selected/granted `BluetoothDevice` (from the scan panel or a
   * `ble-scanner` node's `device` output) so {@link doConnect} reuses it instead
   * of popping the native chooser again. Idempotent for the same device; swapping
   * devices rewires the `gattserverdisconnected` listener so the closure (which
   * retains `this`) can't leak or fire for a stale device.
   */
  setDevice(device: BluetoothDevice | null): void {
    if (device === this.device) return

    if (this.device && this.boundDisconnectHandler) {
      this.device.removeEventListener('gattserverdisconnected', this.boundDisconnectHandler)
      this.boundDisconnectHandler = null
    }

    this.device = device

    if (device) {
      this.boundDisconnectHandler = () => this.handleBleDisconnect()
      device.addEventListener('gattserverdisconnected', this.boundDisconnectHandler)
    }
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

    // The adapter may have been disposed DURING the awaited gatt.connect() (node deleted /
    // device changed mid-connect). dispose() already ran its synchronous server.disconnect()
    // on a then-null server, so the link we just opened would leak — drop it now.
    if (this._disposed) {
      try { this.server?.disconnect() } catch { /* already gone */ }
      this.server = null
      return
    }

    // Enumerate services if we have a service UUID
    if (this.bleConfig.serviceUUID) {
      await this.discoverServices()
    }

  }

  protected async doDisconnect(): Promise<void> {
    // Detach listeners, then stop all notifications.
    this.detachNotificationListeners()
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
    // Only act on an UNEXPECTED drop (from the connected state). An intentional
    // disconnect already tore everything down and moved the machine off 'connected';
    // the browser still fires gattserverdisconnected asynchronously afterwards, and
    // driving handleUnexpectedDisconnect from 'disconnected' logs a spurious
    // invalid-transition warning. (Reconnect detection is preserved: a real drop leaves
    // status === 'connected' when the event fires.)
    if (this.status !== 'connected') return

    // Remove the characteristicvaluechanged listeners BEFORE dropping the maps — each
    // handler closure retains `this`, so merely clearing the map (not removing the
    // listener) leaks them and stacks duplicate handlers across reconnects. Muse
    // subscribes 5+ characteristics, so this leak compounds fast.
    this.detachNotificationListeners()
    this.server = null
    this.characteristics.clear()
    this.services.clear()
    this.notificationHandlers.clear()

    if (!this._disposed) {
      // Pass an error so the state machine takes the valid ERROR transition: a bare
      // DISCONNECTED is NOT a legal transition out of 'connected', so without this the
      // adapter would stay stuck reporting 'connected' with a dead link (never reconnects).
      this.handleUnexpectedDisconnect('BLE GATT server disconnected')
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

    // A top-level enumeration failure (getPrimaryService[s] rejecting) always propagates: it's
    // the real GATT error, and swallowing it lets doConnect resolve "connected" with an empty
    // characteristics map — which then surfaces downstream as a misleading "Characteristic
    // <uuid> not found" (or, for the all-services printer path, a false "no write characteristic").
    let services: BluetoothRemoteGATTService[]
    if (this.bleConfig.serviceUUID) {
      services = [await this.server.getPrimaryService(this.bleConfig.serviceUUID)]
    } else {
      services = await this.server.getPrimaryServices()
    }

    for (const service of services) {
      this.services.set(service.uuid, service)

      // Per-service resilience: one restricted/unreadable service must not abort enumeration
      // of the rest (the wanted write/notify char may live in a later service).
      let characteristics: BluetoothRemoteGATTCharacteristic[]
      try {
        characteristics = await service.getCharacteristics()
      } catch (error) {
        console.warn('[BLE] getCharacteristics failed for', service.uuid, error)
        continue
      }
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

    // If re-subscribing, detach the previous listener first so they don't stack
    // (each closure retains `this`).
    const previous = this.notificationHandlers.get(uuid)
    if (previous) {
      characteristic.removeEventListener('characteristicvaluechanged', previous)
    }

    // Store the SAME handler we attach, so unsubscribe / disconnect can remove it.
    this.notificationHandlers.set(uuid, handler)
    characteristic.addEventListener('characteristicvaluechanged', handler)
    await characteristic.startNotifications()
  }

  async unsubscribeFromNotifications(uuid: string): Promise<void> {
    const characteristic = this.characteristics.get(uuid)
    const handler = this.notificationHandlers.get(uuid)

    if (characteristic && handler) {
      characteristic.removeEventListener('characteristicvaluechanged', handler)
      try {
        await characteristic.stopNotifications()
      } catch {
        // Ignore
      }
      this.notificationHandlers.delete(uuid)
    }
  }

  /**
   * Detach all `characteristicvaluechanged` listeners. The handler closures retain
   * `this`, so they must be removed (not merely dropped from the map) — otherwise
   * they stack across reconnects and keep the adapter alive.
   */
  private detachNotificationListeners(): void {
    for (const [uuid, characteristic] of this.characteristics) {
      const handler = this.notificationHandlers.get(uuid)
      if (handler) {
        characteristic.removeEventListener('characteristicvaluechanged', handler)
      }
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

    // Detach notification listeners before dropping the characteristic refs.
    this.detachNotificationListeners()

    // Drop the physical GATT link SYNCHRONOUSLY. super.dispose() fires a fire-and-forget
    // disconnect(), but we null `this.server` right after it returns — so the async
    // doDisconnect body would find `server` already null and never disconnect the radio,
    // leaving the device connected until page reload. gatt.disconnect() is synchronous,
    // and the disconnect listener was already removed above so this won't re-enter
    // handleBleDisconnect.
    try {
      if (this.server?.connected) this.server.disconnect()
    } catch {
      // Device already gone.
    }

    super.dispose()
    this.device = null
    this.server = null
    this.services.clear()
    this.characteristics.clear()
    this.notificationHandlers.clear()
  }
}

/**
 * Connection-type definition for BLE — the metadata + factory that registers the
 * (already-implemented) BleAdapter as a first-class connection type. Co-located
 * with the adapter, mirroring `mqttConnectionType` in MqttAdapter.ts; picked up by
 * the `protocolRegistry` glob via `protocols/ble/protocol.ts`.
 *
 * `autoConnect` defaults to false: Web Bluetooth requires a user gesture to pick a
 * device, so a connection can't silently dial on flow start without a prior pairing.
 */
export const bleConnectionType: ConnectionTypeDefinition<BleConnectionConfig> = {
  id: 'ble',
  name: 'Bluetooth LE',
  icon: 'bluetooth',
  color: '#2563EB',
  category: 'protocol',
  description: 'Connect to a Bluetooth Low Energy device over Web Bluetooth (GATT)',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'serviceUUID',
      type: 'text',
      label: 'Service UUID',
      description: 'GATT service to connect to (a 16-bit id like 0x180d, or a full UUID)',
      default: '',
    },
    {
      id: 'autoConnect',
      type: 'checkbox',
      label: 'Auto Connect',
      description: 'Connect on flow start (only works after the device has been paired via a gesture)',
      default: false,
    },
    {
      id: 'autoReconnect',
      type: 'checkbox',
      label: 'Auto Reconnect',
      description: 'Reconnect automatically if the device drops',
      default: true,
    },
    {
      id: 'reconnectDelay',
      type: 'number',
      label: 'Reconnect Delay (ms)',
      description: 'Delay before a reconnection attempt',
      default: 5000,
      props: { min: 1000, max: 60000, step: 1000 },
    },
  ],
  defaultConfig: {
    serviceUUID: '',
    autoConnect: false,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  // BleAdapter's ctor is (connectionId, config); the id travels on the config.
  createAdapter: (config) => new BleAdapter(config.id, config),
}
