/**
 * EscPosPrinterAdapter — BLE thermal receipt/label printers (ESC/POS), Thread C2.
 *
 * Extends {@link BleAdapter}: reuses the GATT/leak-safe plumbing and adds printer specifics —
 * gesture-free connect (the device was granted by the scan panel), transport resolution
 * (Phomemo `FF00`/write `FF02` vs. Nordic-UART `6e400001`/write `6e400002`), and chunked,
 * paced writes (a BLE printer drops bytes if you fire a whole receipt at once). The raster
 * encoding + dithering are the pure `services/ble/escpos/escpos.ts`; this just transports it.
 */

import { BleAdapter } from './BleAdapter'
import type { BleConnectionConfig } from '../types'
import { normalizeUuid } from '@/services/ble/defineDeviceProfile'
import { feedCommand } from '@/services/ble/escpos/escpos'

export type PrinterTransport = 'auto' | 'nus' | 'phomemo'

const NUS_WRITE = normalizeUuid('6e400002-b5a3-f393-e0a9-e50e24dcca9e')
const PHOMEMO_WRITE = normalizeUuid(0xff02)

const CHUNK = 100 // BLE write chunk (bytes)
const PACE_MS = 28 // delay between chunks

export interface PrinterConnectionConfig extends Omit<BleConnectionConfig, 'serviceUUID'> {
  serviceUUID?: string
  /** Stable id of the granted device (resolved gesture-free via getDevices()). */
  deviceId: string
  /** Which write characteristic to use; 'auto' prefers Phomemo, then Nordic-UART. */
  transport?: PrinterTransport
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class EscPosPrinterAdapter extends BleAdapter {
  private readonly printerConfig: PrinterConnectionConfig
  private writeCharUuid: string | null = null
  private printing = false

  constructor(connectionId: string, config: PrinterConnectionConfig) {
    // No fixed serviceUUID: discover all (allow-list-bounded) so 'auto' can pick a transport.
    super(connectionId, { ...config, serviceUUID: '' })
    this.printerConfig = config
  }

  /** True once a printable write characteristic has been resolved. */
  get ready(): boolean {
    return this.status === 'connected' && this.writeCharUuid !== null
  }

  /** True while a print job is streaming (chunked writes in flight). */
  get isPrinting(): boolean {
    return this.printing
  }

  protected override async doConnect(): Promise<void> {
    const device = await BleAdapter.getDeviceById(this.printerConfig.deviceId)
    if (this._disposed) return
    if (!device) {
      throw new Error('Printer not paired — open "Add Bluetooth Device" and connect it')
    }
    this.setDevice(device)
    await super.doConnect() // GATT connect (no serviceUUID → no auto-discover)
    if (this._disposed) return
    const services = await this.discoverServices() // enumerate all (bounded by optionalServices)
    this.writeCharUuid = this.resolveWriteChar(services)
    if (!this.writeCharUuid) {
      throw new Error('No ESC/POS write characteristic found (need Phomemo FF02 or Nordic-UART)')
    }
  }

  /** Pick the write characteristic for the configured transport ('auto' → Phomemo, then NUS). */
  private resolveWriteChar(services: { characteristics: { uuid: string; properties: { write: boolean; writeWithoutResponse: boolean } }[] }[]): string | null {
    const writable = new Map<string, string>() // normalized → actual uuid
    for (const svc of services) {
      for (const ch of svc.characteristics) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) writable.set(normalizeUuid(ch.uuid), ch.uuid)
      }
    }
    const pref = this.printerConfig.transport ?? 'auto'
    const order = pref === 'nus' ? [NUS_WRITE] : pref === 'phomemo' ? [PHOMEMO_WRITE] : [PHOMEMO_WRITE, NUS_WRITE]
    for (const want of order) {
      const hit = writable.get(want)
      if (hit) return hit
    }
    return null
  }

  /**
   * Print an already-encoded ESC/POS byte stream (raster + feed). Writes are chunked and
   * paced so the printer's small BLE buffer doesn't overflow (dropped bytes = torn images).
   * Concurrent calls are rejected; a disconnect mid-print aborts cleanly.
   */
  async print(bytes: Uint8Array): Promise<void> {
    if (!this.ready) throw new Error('Printer not ready')
    if (this.printing) throw new Error('A print is already in progress')
    this.printing = true
    try {
      for (let i = 0; i < bytes.length; i += CHUNK) {
        if (this._disposed || this.status !== 'connected') throw new Error('Printer disconnected mid-print')
        await this.writeCharacteristic(this.writeCharUuid!, bytes.subarray(i, i + CHUNK), 'raw')
        await sleep(PACE_MS)
      }
    } finally {
      this.printing = false
    }
  }

  /** Advance the paper by `lines` blank lines. Rejected mid-print — a feed queued between two
   *  paced raster chunks would shift every following byte and tear the image. */
  async feed(lines: number): Promise<void> {
    if (!this.ready) throw new Error('Printer not ready')
    if (this.printing) throw new Error('A print is already in progress')
    await this.writeCharacteristic(this.writeCharUuid!, feedCommand(lines), 'raw')
  }
}
