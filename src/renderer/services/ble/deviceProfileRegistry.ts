/**
 * Auto-discovery registry for BLE device-recognition profiles.
 *
 * Combines two sources into one recognizable-device list:
 *  1. Vendor profiles co-located as `deviceProfiles/<id>/profile.ts` (each a default
 *     `defineDeviceProfile({...})`), auto-discovered by a Vite glob — mirrors
 *     `protocolRegistry` / `nodeRegistry`. Drop a folder in, no central edits.
 *  2. Standard Bluetooth-SIG service profiles, DERIVED from the existing
 *     `BleProfileRegistry` (heart-rate, battery, environmental, …) so the SIG catalog
 *     lives under the device layer without being duplicated. Each suggests the generic
 *     `ble-characteristic` node pre-scoped to its service.
 *
 * `recognizeDevice()` scores the whole list against a device observation and returns
 * ranked matches (empty → the caller falls back to the generic BLE nodes). Pure logic
 * (B1) — no Web Bluetooth calls. See `docs/plans/BLE_DEVICE_MANAGER_2026-07-13.md`.
 */

import type { BleDeviceProfile, RankedMatch, RecognitionInput } from './defineDeviceProfile'
import { scoreProfile } from './defineDeviceProfile'
import { getAllProfiles } from './BleProfileRegistry'

// Eager glob so the registry is ready synchronously at import; `import: 'default'`
// pulls each file's `export default defineDeviceProfile(...)`. A file with only named
// exports yields `undefined` and is flagged below (matches protocolRegistry's guard).
const modules = import.meta.glob<BleDeviceProfile>('./deviceProfiles/**/profile.ts', {
  eager: true,
  import: 'default',
})

const vendorById: Record<string, BleDeviceProfile> = {}
const duplicateIds: string[] = []
const missingDefault: string[] = []

for (const path of Object.keys(modules).sort()) {
  const spec = modules[path] as BleDeviceProfile | undefined
  if (
    !spec ||
    typeof spec !== 'object' ||
    !spec.id ||
    !spec.match ||
    !spec.request ||
    !Array.isArray(spec.suggests) ||
    spec.suggests.length === 0
  ) {
    missingDefault.push(path)
    continue
  }
  if (spec.id in vendorById) duplicateIds.push(spec.id)
  else vendorById[spec.id] = spec
}

if (missingDefault.length > 0) {
  throw new Error(
    `[deviceProfileRegistry] profile.ts without a default defineDeviceProfile() export: ${missingDefault.join(', ')}`
  )
}
if (duplicateIds.length > 0) {
  throw new Error(
    `[deviceProfileRegistry] duplicate device-profile id(s) across profile.ts files: ${duplicateIds.join(', ')}`
  )
}

/** SIG service profiles surfaced as device profiles (no duplication — derived from source). */
const sigProfiles: BleDeviceProfile[] = getAllProfiles().map((p) => ({
  id: `sig-${p.shortUuid}`,
  label: p.name,
  icon: p.icon,
  description: p.description,
  match: { services: [p.uuid] },
  // Full 128-bit UUID, NOT the bare 4-hex `shortUuid` string: requestDevice() only
  // accepts a full-UUID string or a numeric 16/32-bit alias, so `'180d'` throws
  // ("... not a valid UUID") and breaks the scan/standard-service cards.
  request: { filters: [{ services: [p.uuid] }], optionalServices: [p.uuid] },
  suggests: [{ nodeType: 'ble-characteristic', label: `${p.name} (generic)`, primary: true }],
}))

// Guard cross-set id collisions: the per-source guards above only dedupe WITHIN the
// vendor glob and within SIG. A vendor profile authored as `sig-180d` would collide with
// a derived id — the array would keep both while the map silently dropped one. Fail loudly.
const mergedProfiles = [...Object.values(vendorById), ...sigProfiles]
const seenIds = new Set<string>()
const crossCollisions: string[] = []
for (const p of mergedProfiles) {
  if (seenIds.has(p.id)) crossCollisions.push(p.id)
  else seenIds.add(p.id)
}
if (crossCollisions.length > 0) {
  throw new Error(
    `[deviceProfileRegistry] device-profile id collision(s) across vendor + SIG: ${crossCollisions.join(', ')} ` +
      `(vendor profile ids must not use the reserved 'sig-' prefix)`
  )
}

/** Every recognizable device profile: co-located vendor profiles first, then derived SIG. */
export const deviceProfiles: readonly BleDeviceProfile[] = mergedProfiles

/** Device profiles keyed by id (vendor `<id>` + `sig-<shortUuid>`). */
export const deviceProfilesById: Readonly<Record<string, BleDeviceProfile>> = Object.fromEntries(
  deviceProfiles.map((p) => [p.id, p])
)

/** The co-located vendor profile ids (excludes the derived SIG set). */
export const vendorDeviceProfileIds: readonly string[] = Object.keys(vendorById)

/**
 * Recognize a scanned/connected device. Scores every profile against the observation and
 * returns matches (score > 0) ranked strongest-first; ties break by profile id for
 * determinism. Empty result → unrecognized (use the generic BLE nodes). `name` may be
 * undefined; service UUIDs may be short, 32-bit, `0x`-number, or full 128-bit.
 */
export function recognizeDevice(input: RecognitionInput): RankedMatch[] {
  return deviceProfiles
    .map((profile) => scoreProfile(profile, input))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id))
}

/** The single best match, or `null` if unrecognized. */
export function recognizeBest(input: RecognitionInput): RankedMatch | null {
  return recognizeDevice(input)[0] ?? null
}

/**
 * The profile that suggests a given node type (e.g. `muse-eeg` → the Muse profile), or `null`.
 * Lets "pair from a node" pre-focus the right device card. A profile's own `suggests` list is
 * the source of truth, so a drop-in vendor profile wires this up for free.
 */
export function profileForNodeType(nodeType: string): BleDeviceProfile | null {
  for (const profile of deviceProfiles) {
    if (profile.suggests.some((s) => s.nodeType === nodeType)) return profile
  }
  return null
}
