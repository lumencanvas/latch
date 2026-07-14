/**
 * Scan/select support for the "Add Bluetooth Device" panel (Thread B2).
 *
 * Pure, store-free glue between the B1 recognition core and the panel: the
 * "scan all" optional-services union, name-based recognition of a granted
 * device, and the node scaffold to drop for a (possibly recognized) device.
 * Kept side-effect-free so it's fully unit-testable without Web Bluetooth or
 * the flows store; the panel owns the actual `requestDevice`/`addNode` calls.
 */

import { deviceProfiles, recognizeBest } from './deviceProfileRegistry'
import { normalizeUuid, type BleDeviceProfile } from './defineDeviceProfile'

/**
 * The union of every recognizable profile's `optionalServices`, de-duplicated by
 * canonical UUID. Passed to `requestDevice({ acceptAllDevices, optionalServices })`
 * on the "scan all" path so that, post-connect, `getPrimaryServices()` can reach any
 * known vendor's service (Web Bluetooth only surfaces pre-declared services). Original
 * (short/long) forms are preserved — the Web Bluetooth API accepts both.
 */
export function scanAllOptionalServices(): BluetoothServiceUUID[] {
  const seen = new Set<string>()
  const out: BluetoothServiceUUID[] = []
  for (const profile of deviceProfiles) {
    for (const svc of profile.request.optionalServices) {
      const key = normalizeUuid(svc)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(svc as BluetoothServiceUUID)
      }
    }
  }
  return out
}

/** Recognize a granted device by (optional) name — the always-available Tier-1 signal. */
export function recognizeByName(name?: string | null): BleDeviceProfile | null {
  return recognizeBest({ name })?.profile ?? null
}

export interface ScaffoldNode {
  /** Stable within-spec key used to declare wiring (remapped to a real node id on drop). */
  key: string
  nodeType: string
  /** Control values, keyed by control id — merged into `node.data` on `addNode`. */
  data: Record<string, unknown>
}

export interface ScaffoldEdge {
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface NodeChainSpec {
  nodes: ScaffoldNode[]
  edges: ScaffoldEdge[]
  /** True when a recognized profile's dedicated vendor node was used (vs. the generic chain). */
  usedVendorNode: boolean
}

/**
 * Build the node scaffold to drop for a device.
 *
 * A recognized profile whose primary suggested node is INSTALLED (a dedicated
 * vendor node such as `muse-eeg` — never the generic `ble-*` set) is dropped as a
 * single node pre-bound by `deviceId`. Otherwise — unrecognized, or the vendor
 * node hasn't shipped yet — we drop the generic pair `ble-scanner` → `ble-device`:
 * the scanner is bound to the granted device (no second chooser) and the device
 * node auto-connects and enumerates the device's services/characteristics, so the
 * user can see exactly which characteristic UUIDs to wire a `ble-characteristic`
 * to next. The recognized service UUID is pre-filled where known.
 *
 * The generic pair deliberately stops at `ble-device` (one GATT consumer): a
 * `ble-characteristic` needs a characteristic UUID that a `BleDeviceProfile` can't
 * carry, and dropping a second adapter over the same physical GATT link lets one
 * node's disconnect tear down the other. The device node's enumerated output is
 * the honest bridge to the user's own characteristic nodes.
 *
 * @param hasNode reports whether a node type is registered (so a suggestion for a
 *   not-yet-shipped vendor node degrades to the generic pair).
 */
export function buildDeviceNodeChain(
  profile: BleDeviceProfile | null,
  deviceId: string,
  hasNode: (type: string) => boolean
): NodeChainSpec {
  const primary = profile?.suggests.find((s) => s.primary) ?? profile?.suggests[0]

  // A dedicated vendor node (not the generic ble-* fallback) that's actually installed.
  if (primary && !primary.nodeType.startsWith('ble-') && hasNode(primary.nodeType)) {
    return {
      nodes: [{ key: 'device', nodeType: primary.nodeType, data: { deviceId } }],
      edges: [],
      usedVendorNode: true,
    }
  }

  const service = profile?.match.services?.[0]
  const serviceUUID = service !== undefined ? normalizeUuid(service) : ''
  const namePrefix = profile?.match.namePrefix?.[0] ?? ''

  return {
    nodes: [
      {
        key: 'scanner',
        nodeType: 'ble-scanner',
        data: {
          deviceId,
          serviceFilter: serviceUUID ? 'custom' : 'any',
          customServiceUUID: serviceUUID,
          nameFilter: namePrefix,
        },
      },
      // Auto-connects gesture-free (the scanner already resolved the granted device) and
      // enumerates ALL the device's services/characteristics. Deliberately no serviceUUID:
      // a set serviceUUID makes discoverServices fetch only that one service, contradicting
      // the "lists this device's services" promise — the scanner keeps the filter instead.
      { key: 'ble-device', nodeType: 'ble-device', data: { autoConnect: true } },
    ],
    edges: [
      { from: 'scanner', fromPort: 'device', to: 'ble-device', toPort: 'device' },
    ],
    usedVendorNode: false,
  }
}
