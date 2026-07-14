/**
 * `defineDeviceProfile` — the device-level BLE recognition manifest.
 *
 * Where `BleProfileRegistry` describes standard Bluetooth-SIG *services* (heart rate,
 * battery, …) and their characteristic parsers, a `BleDeviceProfile` describes a
 * recognizable *device* (a Muse headband, an ESC/POS thermal printer, a heart-rate
 * monitor): how to recognize it (advertised/discovered service UUIDs, name prefix,
 * manufacturer id), what to ask `requestDevice()` for, and which node(s) to suggest.
 *
 * One declarative unit authored next to nothing — pure data — and auto-discovered by
 * the `deviceProfileRegistry` glob (`deviceProfiles/<id>/profile.ts`), mirroring
 * `defineProtocol` / `protocolRegistry` and `defineModel`. It carries NO code, so a
 * profile can never smuggle behavior (SECURITY_MODEL): matching is UUID/string/number
 * only, and the node suggestion is an id string the UI resolves.
 *
 * This is Thread-B "recognition core" (B1): pure logic, no UI and no Web Bluetooth calls.
 * The scan/select UI (B2) and the vendor adapters/nodes (C1/C2) consume this.
 * See `docs/plans/BLE_DEVICE_MANAGER_2026-07-13.md`.
 */

/** A single `requestDevice()` filter clause (kept DOM-lib-agnostic for pure testability). */
export interface BleRequestFilter {
  services?: (string | number)[]
  namePrefix?: string
  name?: string
}

/** What a profile asks `navigator.bluetooth.requestDevice()` for. `optionalServices`
 *  MUST list every service the node will read — `getPrimaryServices()` is bounded by
 *  `filters.services ∪ optionalServices` (a service you didn't declare is invisible). */
export interface BleDeviceRequest {
  filters?: BleRequestFilter[]
  optionalServices: (string | number)[]
}

/** A device we can recognize and map to node(s). */
export interface BleDeviceProfile {
  id: string
  label: string
  icon: string
  vendor?: string
  description: string
  /** How we recognize it. All fields optional; a profile matches on any positive signal. */
  match: {
    /** Advertised or (post-connect) discovered primary service UUIDs — full, 16/32-bit, or 0x-number. */
    services?: (string | number)[]
    /** Matched case-insensitively against `BluetoothDevice.name` (which is often undefined). */
    namePrefix?: string[]
    /** BLE company identifier (only available via advertisement scanning). */
    manufacturerId?: number
  }
  /** Passed to `requestDevice()` when the user picks this device type. */
  request: BleDeviceRequest
  /** Node(s) to offer when recognized; first / `primary` is the headline suggestion. */
  suggests: { nodeType: string; label: string; primary?: boolean }[]
}

/** What we know about a device at recognition time. `name` is frequently `undefined`. */
export interface RecognitionInput {
  name?: string | null
  /** Advertised or discovered service UUIDs (any form — normalized internally). */
  services?: (string | number)[]
  manufacturerId?: number
}

/** A profile that matched, with why + a score (higher = stronger). */
export interface RankedMatch {
  profile: BleDeviceProfile
  score: number
  reasons: string[]
}

/**
 * Identity function branding a `BleDeviceProfile` as the single authored unit for a
 * recognizable device — for inference + a stable authoring surface, mirroring
 * `defineProtocol` / `defineNode`. Frozen public contract: additive-only.
 */
export function defineDeviceProfile(spec: BleDeviceProfile): BleDeviceProfile {
  return spec
}

const SIG_BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb'

/**
 * Canonicalize a BLE UUID to lowercase 128-bit form so short (`fe8d` / `0xfe8d`),
 * 32-bit, and full-128-bit spellings all compare equal. The SIG base UUID is
 * `0000xxxx-0000-1000-8000-00805f9b34fb`. Non-hex/full strings pass through lowercased.
 */
export function normalizeUuid(u: string | number): string {
  if (typeof u === 'number') {
    // Numeric UUIDs are 16-bit SIG aliases only (0..0xffff); reject out-of-range rather
    // than silently truncating (which would mask an authoring typo as a valid alias).
    if (!Number.isInteger(u) || u < 0 || u > 0xffff) {
      throw new RangeError(`normalizeUuid: numeric UUID must be a 16-bit alias (0..0xffff), got ${u}`)
    }
    return `0000${u.toString(16).padStart(4, '0')}${SIG_BASE_SUFFIX}`
  }
  let s = u.trim().toLowerCase()
  if (s.startsWith('0x')) s = s.slice(2)
  if (/^[0-9a-f]{1,4}$/.test(s)) return `0000${s.padStart(4, '0')}${SIG_BASE_SUFFIX}`
  if (/^[0-9a-f]{8}$/.test(s)) return `${s}${SIG_BASE_SUFFIX}`
  // Otherwise assumed already a full dashed 128-bit UUID (Web Bluetooth always emits the
  // dashed form); returned lowercased. A dash-less 32-hex spelling is not canonicalized.
  return s
}

// Scoring weights: a service-UUID hit is the strongest (device-defining), a name-prefix
// hit is medium, a manufacturer-id hit is weak. Additive so multiple signals reinforce.
const SERVICE_SCORE = 10
const NAME_SCORE = 5
const MANUFACTURER_SCORE = 3

/**
 * Score one profile against one device observation. Pure. Returns `score: 0` (no match)
 * when nothing lines up. Never requires `name` (it is often undefined — esp. on the
 * accept-all-devices path), so a missing name simply skips the name signal.
 */
export function scoreProfile(profile: BleDeviceProfile, input: RecognitionInput): RankedMatch {
  const reasons: string[] = []
  let score = 0

  if (profile.match.services?.length && input.services?.length) {
    const seen = new Set(input.services.map(normalizeUuid))
    for (const svc of profile.match.services) {
      if (seen.has(normalizeUuid(svc))) {
        score += SERVICE_SCORE
        reasons.push(`service:${svc}`)
      }
    }
  }

  if (input.name && profile.match.namePrefix?.length) {
    const name = input.name.toLowerCase()
    const hit = profile.match.namePrefix.find((p) => name.startsWith(p.toLowerCase()))
    if (hit) {
      score += NAME_SCORE
      reasons.push(`name:${hit}`)
    }
  }

  // Manufacturer id is a valid but weak standalone signal (only available via
  // advertisement scanning). A future profile matching purely on a company id would
  // match on it alone by design — keep that in mind when authoring such a profile.
  if (
    input.manufacturerId != null &&
    profile.match.manufacturerId != null &&
    profile.match.manufacturerId === input.manufacturerId
  ) {
    score += MANUFACTURER_SCORE
    reasons.push(`manufacturer:${input.manufacturerId}`)
  }

  return { profile, score, reasons }
}
