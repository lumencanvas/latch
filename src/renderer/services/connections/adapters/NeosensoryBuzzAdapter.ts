/**
 * NeosensoryBuzzAdapter — BLE haptic wristband (Neosensory Buzz), Thread C.
 *
 * Extends {@link BleAdapter}: reuses the GATT/leak-safe plumbing and adds Buzz specifics —
 * gesture-free connect (the device was granted by the scan panel), Nordic-UART (NUS) transport
 * resolution, the developer auth/init handshake, deduped motor-frame streaming, and best-effort
 * battery/button parsing off the TX notify characteristic. The frame encoding + CLI parsing are
 * the pure {@link module:services/ble/neosensory/buzzProtocol}; this just transports them.
 */

import { BleAdapter, type BleServiceInfo } from './BleAdapter'
import type { BleConnectionConfig } from '../types'
import { normalizeUuid } from '@/services/ble/defineDeviceProfile'
import {
  BUZZ_WRITE_CHAR,
  BUZZ_NOTIFY_CHAR,
  BUZZ_INIT_COMMANDS,
  BUZZ_MOTOR_COUNT,
  BUZZ_DEFAULT_MIN_BYTE,
  BUZZ_DEFAULT_MAX_BYTE,
  encodeMotorFrame,
  motorsVibrateCommand,
  extractJsonObjects,
  readCliEvent,
  ledsSetCommand,
  hexToRgb,
} from '@/services/ble/neosensory/buzzProtocol'

const NUS_WRITE = normalizeUuid(BUZZ_WRITE_CHAR)
const NUS_NOTIFY = normalizeUuid(BUZZ_NOTIFY_CHAR)

export interface BuzzConnectionConfig extends Omit<BleConnectionConfig, 'serviceUUID'> {
  serviceUUID?: string
  /** Stable id of the granted device (resolved gesture-free via getDevices()). */
  deviceId: string
  /** Run the LRAs in closed-loop mode (louder, but can damage them at high intensity). Default off. */
  closedLoop?: boolean
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class NeosensoryBuzzAdapter extends BleAdapter {
  private readonly buzzConfig: BuzzConnectionConfig
  private writeCharUuid: string | null = null
  private lastFrameKey = ''
  /** Rolling text buffer for CLI JSON that spans multiple TX notifications. */
  private cliBuffer = ''
  private battery: number | null = null
  private buttonEvents = 0
  private lastLedKey = ''

  constructor(connectionId: string, config: BuzzConnectionConfig) {
    // No fixed serviceUUID: discover all (allow-list-bounded) so we can resolve the NUS chars.
    super(connectionId, { ...config, serviceUUID: '' })
    this.buzzConfig = config
  }

  /** True once the write characteristic is resolved and the band accepts vibrate commands. */
  get ready(): boolean {
    return this.status === 'connected' && this.writeCharUuid !== null
  }

  /** Last-known battery percentage (0..100), or null before the first `device battery_soc` reply. */
  get batteryPct(): number | null {
    return this.battery
  }

  /** Drain the wristband button presses observed since the last call (edge count). */
  takeButtonEvents(): number {
    const n = this.buttonEvents
    this.buttonEvents = 0
    return n
  }

  protected override async doConnect(): Promise<void> {
    const device = await BleAdapter.getDeviceById(this.buzzConfig.deviceId)
    if (this._disposed) return
    if (!device) {
      throw new Error('Buzz not paired — open "Add Bluetooth Device" and connect it')
    }
    this.setDevice(device)
    await super.doConnect() // GATT connect (no serviceUUID → no auto-discover)
    if (this._disposed) return
    const services = await this.discoverServices() // enumerate all (bounded by optionalServices)
    if (this._disposed) return // node deleted mid-discovery — don't re-populate/subscribe post-dispose
    this.writeCharUuid = this.resolveWriteChar(services)
    if (!this.writeCharUuid) {
      throw new Error('No Nordic-UART write characteristic found on this device')
    }

    // Subscribe to TX notifications for battery + button JSON (optional — some builds gate notify).
    const notify = this.resolveNotifyChar(services)
    if (notify) {
      try {
        await this.subscribeToNotifications(notify, (_v, raw) => this.onNotify(raw), 'raw')
      } catch {
        /* notifications are a nice-to-have; motor control works without them */
      }
    }
    if (this._disposed) return

    // Developer auth/init handshake — paced so the tiny BLE buffer doesn't drop bytes.
    // Bail only on disposal: this runs INSIDE doConnect (before BaseAdapter flips the state
    // machine to 'connected'), so `this.status` is still 'connecting' here — a `status ===
    // 'connected'` guard would skip the ENTIRE handshake and the band would never enable its
    // motors. A physical drop mid-handshake surfaces as a write rejection that propagates.
    for (const cmd of BUZZ_INIT_COMMANDS) {
      if (this._disposed) return
      await this.sendCommand(cmd)
      await sleep(30)
    }
    if (this.buzzConfig.closedLoop) {
      try {
        await this.sendCommand('motors config_lra_mode 1')
      } catch {
        /* optional */
      }
    }
    // Force the first post-connect frame through the dedupe, then ask for battery.
    this.lastFrameKey = ''
    try {
      await this.sendCommand('device battery_soc')
    } catch {
      /* optional */
    }
  }

  /** Prefer the canonical NUS write char; fall back to any writable char (tolerates clones). */
  private resolveWriteChar(services: BleServiceInfo[]): string | null {
    for (const svc of services)
      for (const ch of svc.characteristics)
        if ((ch.properties.write || ch.properties.writeWithoutResponse) && normalizeUuid(ch.uuid) === NUS_WRITE)
          return ch.uuid
    for (const svc of services)
      for (const ch of svc.characteristics)
        if (ch.properties.write || ch.properties.writeWithoutResponse) return ch.uuid
    return null
  }

  /** Prefer the canonical NUS notify char; fall back to any notify/indicate char. */
  private resolveNotifyChar(services: BleServiceInfo[]): string | null {
    for (const svc of services)
      for (const ch of svc.characteristics)
        if ((ch.properties.notify || ch.properties.indicate) && normalizeUuid(ch.uuid) === NUS_NOTIFY) return ch.uuid
    for (const svc of services)
      for (const ch of svc.characteristics) if (ch.properties.notify || ch.properties.indicate) return ch.uuid
    return null
  }

  private onNotify(raw: DataView): void {
    const text = new TextDecoder().decode(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
    this.cliBuffer += text
    // Bound the buffer so a device that never emits a closing brace can't grow it unboundedly.
    if (this.cliBuffer.length > 4096) this.cliBuffer = this.cliBuffer.slice(-2048)
    const { objects, rest } = extractJsonObjects(this.cliBuffer)
    this.cliBuffer = rest
    for (const obj of objects) {
      const ev = readCliEvent(obj)
      if (typeof ev.battery === 'number') this.battery = ev.battery
      if (ev.button) this.buttonEvents++
    }
  }

  /** Write a newline-terminated CLI command to the RX char. Prefers write-without-response (NUS RX),
   *  but falls back to write-with-response if that's all the resolved char supports (tolerates clones). */
  async sendCommand(cmd: string): Promise<void> {
    if (!this.writeCharUuid) throw new Error('Buzz not ready')
    const props = this.getCharacteristicProperties(this.writeCharUuid)
    const withoutResponse = props ? props.writeWithoutResponse : true
    await this.writeCharacteristic(this.writeCharUuid, `${cmd}\n`, 'raw', !withoutResponse)
  }

  /**
   * Stream a per-motor intensity frame (0..1 each). Identical consecutive frames are skipped so a
   * steady signal doesn't flood the BLE link. `minByte`/`maxByte` set the 0..255 range a >0
   * intensity maps into (a 0 intensity is always OFF).
   */
  async vibrate(intensities: number[], minByte = BUZZ_DEFAULT_MIN_BYTE, maxByte = BUZZ_DEFAULT_MAX_BYTE): Promise<void> {
    if (!this.ready) return
    const frame = encodeMotorFrame(intensities, minByte, maxByte, BUZZ_MOTOR_COUNT)
    if (frame.key === this.lastFrameKey) return
    this.lastFrameKey = frame.key
    await this.sendCommand(motorsVibrateCommand(frame.base64))
  }

  /**
   * Graceful disconnect: silence the motors before dropping the link — a haptic wearable shouldn't
   * keep buzzing its last frame after a Stop. Best-effort (a no-op if the link is already gone or
   * the state has left 'connected'); a hard `dispose()` still relies on the band self-stopping on
   * GATT disconnect (standard wearable safety behavior — HW-verify).
   */
  protected override async doDisconnect(): Promise<void> {
    try {
      await this.stopMotors()
    } catch {
      /* ignore — we're tearing down anyway */
    }
    await super.doDisconnect()
  }

  /** Turn all motors off (forces the zero frame through even if the last frame was zero). */
  async stopMotors(): Promise<void> {
    this.lastFrameKey = ''
    if (this.ready) {
      try {
        await this.vibrate([0, 0, 0, 0])
      } catch {
        /* ignore */
      }
    }
  }

  /** EXPERIMENTAL LED control — best-effort; tolerates on-device rejection (see buzzProtocol). */
  async setLed(hex: string): Promise<void> {
    if (!this.ready) return
    const rgb = hexToRgb(hex)
    if (!rgb) return
    const key = rgb.join(',')
    if (key === this.lastLedKey) return
    this.lastLedKey = key
    try {
      await this.sendCommand(ledsSetCommand(rgb, 25))
    } catch {
      /* LED CLI unsupported on this firmware — never let it break motor control */
    }
  }
}
