/**
 * Shared per-node state + lifecycle for the neosensory-buzz node.
 *
 * Lives in its own module so the executor (node.ts) and the panel NodeView (BuzzPanel.vue)
 * both import it WITHOUT a circular import (node.ts imports the component; the component would
 * otherwise import back into node.ts). Mirrors thermal-printer/printerState.ts.
 */

import { defineLifecycle } from '@/engine/nodeState'
import type { NeosensoryBuzzAdapter } from '@/services/connections/adapters/NeosensoryBuzzAdapter'

export interface BuzzState {
  adapter: NeosensoryBuzzAdapter | null
  deviceId: string
  closedLoop: boolean
  /** Last connect() attempt (ms) — throttles retries so a dropped link re-dials, not per-frame. */
  lastConnectAt: number
  /** Last motor frame actually sent (ms) — paces the live BLE stream off the 60 fps hot path. */
  lastSendAt: number
  /** Current per-motor intensities the panel animates (0..1). */
  motors: number[]
  battery: number | null
  /** Previous frame's `pulse` trigger level — for rising-edge detection (no re-fire while held). */
  lastPulseHigh: boolean
  /** ms until which a pulse/test buzz holds all motors at full (a perceptible tap). */
  pulseUntil: number
  /** Last LED hex written — so the experimental LED command only fires on change. */
  lastLed: string
  status: string
  error: string | null
}

export const buzzState = new Map<string, BuzzState>()

export function newBuzzState(closedLoop: boolean, status: string, error: string | null): BuzzState {
  return {
    adapter: null,
    deviceId: '',
    closedLoop,
    lastConnectAt: 0,
    lastSendAt: 0,
    motors: [0, 0, 0, 0],
    battery: null,
    lastPulseHigh: false,
    pulseUntil: 0,
    lastLed: '',
    status,
    error,
  }
}

export function disposeBuzz(nodeId: string): void {
  const s = buzzState.get(nodeId)
  if (s?.adapter) {
    // Best-effort: silence the motors before teardown (see NeosensoryBuzzAdapter.doDisconnect). On a
    // hard dispose the synchronous GATT disconnect may race this write; the band also self-stops on
    // disconnect. When another node shares this device's link, the link stays up so this DOES land.
    s.adapter.stopMotors().catch(() => {})
    s.adapter.dispose()
  }
  buzzState.delete(nodeId)
}

/** Called by the panel's "Test buzz" button — the executor fires a short pulse next frame. */
export function requestTestBuzz(nodeId: string): void {
  const s = buzzState.get(nodeId)
  if (s) s.pulseUntil = Math.max(s.pulseUntil, Date.now() + 180)
}

defineLifecycle({
  label: 'neosensory-buzz',
  gc: (valid: Set<string>) => {
    for (const id of buzzState.keys()) if (!valid.has(id)) disposeBuzz(id)
  },
  disposeAll: () => {
    for (const id of Array.from(buzzState.keys())) disposeBuzz(id)
  },
})
