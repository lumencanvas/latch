/**
 * Shared per-node state + lifecycle for the thermal-printer node.
 *
 * Lives in its own module so the executor (node.ts) and the preview NodeView
 * (PrintPreview.vue) both import it WITHOUT a circular import (node.ts imports the
 * component; the component would otherwise import back into node.ts).
 */

import { defineLifecycle } from '@/engine/nodeState'
import type { EscPosPrinterAdapter, PrinterTransport } from '@/services/connections/adapters/EscPosPrinterAdapter'
import type { DitherMode } from '@/services/ble/escpos/escpos'

export interface PrinterState {
  adapter: EscPosPrinterAdapter | null
  deviceId: string
  transport: PrinterTransport
  lastConnectAt: number
  /** Last source recompose (ms) — GPU readback is throttled off the 60 fps hot path. */
  lastComposeAt: number
  /** The composed source at print width (pre-dither); the preview reads + dithers it. */
  source: ImageData | null
  width: number
  dither: DitherMode
  threshold: number
  printRequested: boolean
  /** Previous frame's print/feed trigger levels — for rising-edge detection (no re-fire while held). */
  lastPrintHigh: boolean
  lastFeedHigh: boolean
  status: string
  error: string | null
}

export const printerState = new Map<string, PrinterState>()

export function disposePrinter(nodeId: string): void {
  const s = printerState.get(nodeId)
  if (s?.adapter) s.adapter.dispose()
  printerState.delete(nodeId)
}

/** Called by the preview's Print button — the executor performs the print next frame. */
export function requestPrint(nodeId: string): void {
  const s = printerState.get(nodeId)
  if (s) s.printRequested = true
}

defineLifecycle({
  label: 'thermal-printer',
  gc: (valid: Set<string>) => { for (const id of printerState.keys()) if (!valid.has(id)) disposePrinter(id) },
  disposeAll: () => { for (const id of Array.from(printerState.keys())) disposePrinter(id) },
})
