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
import { normalizeUuid } from '@/services/ble/defineDeviceProfile'

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

  /**
   * Per-`deviceId` count of live logical holders of the shared GATT link. `getDeviceById` hands the
   * SAME `BluetoothDevice` (hence the same GATTServer) to every adapter bound to one id, so a naive
   * `dispose()` would `server.disconnect()` a link a sibling adapter still needs. We only physically
   * disconnect when the LAST holder releases. Keyed by device id; see acquire/releaseGattRef.
   */
  private static gattRefs = new Map<string, number>()

  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private services: Map<string, BluetoothRemoteGATTService> = new Map()
  private characteristics: Map<string, BluetoothRemoteGATTCharacteristic> = new Map()
  private notificationHandlers: Map<string, (event: Event) => void> = new Map()
  private boundDisconnectHandler: (() => void) | null = null
  /** The device id this adapter currently holds a shared-GATT ref for (null = not holding). Captured
   *  at acquire so release works even after `this.device` is nulled during dispose, and so a reconnect
   *  (which re-enters doConnect) doesn't double-count. */
  private gattRefId: string | null = null

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
   * List every device this session knows about — the union of the gesture-granted cache and
   * `getDevices()` — with each device's current GATT connection state. Powers the device-manager
   * "Paired devices" list. De-duplicated by id (the cache and getDevices() can overlap).
   */
  static async listKnownDevices(): Promise<{ id: string; name: string; connected: boolean }[]> {
    const map = new Map<string, BluetoothDevice>()
    for (const [id, d] of BleAdapter.grantedDevices) map.set(id, d)
    for (const d of await BleAdapter.getPairedDevices()) map.set(d.id, d)
    return Array.from(map.values()).map((d) => ({
      id: d.id,
      name: d.name || '(unnamed device)',
      connected: d.gatt?.connected ?? false,
    }))
  }

  /**
   * Forget a granted device: drop it from the session cache AND, where supported, revoke the
   * Web Bluetooth permission via `BluetoothDevice.forget()` (Chromium 101+). Closes the
   * "grantedDevices cache never evicted" gap. Best-effort — a browser without `forget()` still
   * evicts the cache entry so the app stops offering a gesture-free reconnect to it.
   */
  static async forgetDevice(id: string): Promise<void> {
    const cached = BleAdapter.grantedDevices.get(id)
    const device = cached ?? (await BleAdapter.getPairedDevices()).find((d) => d.id === id)
    BleAdapter.grantedDevices.delete(id)
    const forgettable = device as (BluetoothDevice & { forget?: () => Promise<void> }) | undefined
    if (forgettable?.forget) {
      try {
        await forgettable.forget()
      } catch {
        /* revoke is best-effort — the cache eviction above is the guaranteed part */
      }
    }
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
        // requestDevice() only accepts a full 128-bit UUID string or a numeric SIG alias — a bare
        // 4-hex string (e.g. '180d', from a hand-typed generic ble node) throws. Normalize to the
        // canonical full UUID (same fix class as the SIG device-profile requests). See later-111.
        const serviceUUID = normalizeUuid(this.bleConfig.serviceUUID)
        filters.push({ services: [serviceUUID] })
        optionalServices.push(serviceUUID)
      }

      if (this.bleConfig.characteristicUUIDs) {
        // Normalize here too: these are pushed straight into optionalServices, so a bare-short
        // entry would throw the same way.
        optionalServices.push(...this.bleConfig.characteristicUUIDs.map((u) => normalizeUuid(u)))
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

    // Capture the id NOW, before the await: a concurrent dispose() nulls this.device synchronously,
    // so reading this.device.id after the await (in the _disposed branch below) would be null and the
    // acquire/release would silently no-op — leaking the just-opened radio (a lone node deleted while
    // connecting). We register the hold against the captured id regardless.
    const deviceId = this.device.id
    this.server = await this.device.gatt.connect()

    // Register as a holder of this device's shared GATT link. Idempotent per adapter (a reconnect
    // re-enters doConnect but a holder already counted stays counted). Done BEFORE the _disposed
    // check so the block below can release-and-conditionally-disconnect without dropping a sibling's link.
    this.acquireGattRef(deviceId)

    // The adapter may have been disposed DURING the awaited gatt.connect() (node deleted /
    // device changed mid-connect). Release our just-acquired hold and only drop the physical link
    // if no sibling adapter is still bound to this device (else we'd tear down a link they need).
    if (this._disposed) {
      try { if (this.releaseGattRef() && this.server?.connected) this.server.disconnect() } catch { /* already gone */ }
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

    // Release our hold; only physically disconnect if we were the LAST holder (a sibling adapter
    // bound to the same device keeps the shared link alive).
    if (this.releaseGattRef() && this.server?.connected) {
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
      // Normalize like the scan-path filters (later-111): getPrimaryService rejects a bare 4-hex
      // string ('180d') the same way requestDevice does — it needs a full 128-bit UUID or a numeric
      // alias. Without this, a hand-typed short serviceUUID reaching discovery via the pre-injected
      // setDevice() path (no scan) throws instead of resolving the service.
      services = [await this.server.getPrimaryService(normalizeUuid(this.bleConfig.serviceUUID))]
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

  /**
   * Read the raw {@link DataView} without format parsing, so callers can run the
   * SIG profile parser (`parseCharacteristicValue`) exactly like the notification
   * path — otherwise a read and a notification of the same characteristic decode
   * to different outputs.
   */
  async readCharacteristicRaw(uuid: string): Promise<DataView> {
    const characteristic = this.characteristics.get(uuid) || await this.getCharacteristic(uuid)
    if (!characteristic) {
      throw new Error(`Characteristic ${uuid} not found`)
    }
    if (!characteristic.properties.read) {
      throw new Error(`Characteristic ${uuid} does not support read`)
    }
    return characteristic.readValue()
  }

  /** Discovered GATT properties for a characteristic UUID, or null if not yet discovered. */
  getCharacteristicProperties(uuid: string): BleCharacteristicProperties | null {
    const c = this.characteristics.get(uuid)
    if (!c) return null
    const p = c.properties
    return {
      read: p.read,
      write: p.write,
      writeWithoutResponse: p.writeWithoutResponse,
      notify: p.notify,
      indicate: p.indicate,
      broadcast: p.broadcast,
      authenticatedSignedWrites: p.authenticatedSignedWrites,
    }
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

  /** Register this adapter as a holder of the shared GATT link for `id`. Idempotent: a reconnect
   *  re-enters doConnect but a holder already counted stays counted (so a flapping device can't leak
   *  refs), and a graceful disconnect clears gattRefId so a later reconnect re-acquires. Takes an
   *  explicit id (captured before doConnect's await) so a dispose that nulls this.device mid-connect
   *  can't make this silently no-op. */
  private acquireGattRef(id: string): void {
    if (!id || this.gattRefId) return
    this.gattRefId = id
    BleAdapter.gattRefs.set(id, (BleAdapter.gattRefs.get(id) ?? 0) + 1)
  }

  /** Release this adapter's hold. Returns true ONLY if this call was the LAST holder releasing — i.e.
   *  the caller should physically disconnect the shared server. Idempotent + clamped at zero: a second
   *  call (gattRefId already null) returns FALSE, so the double release-path in dispose() —
   *  the sync block AND the doDisconnect() that super.dispose() runs (SYNCHRONOUSLY when there are no
   *  notification awaits, before `this.server` is nulled) — can't drop a sibling's still-shared link or
   *  underflow the count. A never-connected adapter (null) also returns false (its server is null anyway). */
  private releaseGattRef(): boolean {
    const id = this.gattRefId
    if (!id) return false
    this.gattRefId = null
    const n = (BleAdapter.gattRefs.get(id) ?? 1) - 1
    if (n <= 0) {
      BleAdapter.gattRefs.delete(id)
      return true
    }
    BleAdapter.gattRefs.set(id, n)
    return false
  }

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
      // Release our hold; only physically drop the radio if we were the last holder (a sibling
      // adapter bound to the same deviceId keeps it alive). releaseGattRef reads the captured
      // gattRefId, so it's correct even though this runs before the async doDisconnect from super.dispose().
      if (this.releaseGattRef() && this.server?.connected) this.server.disconnect()
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
