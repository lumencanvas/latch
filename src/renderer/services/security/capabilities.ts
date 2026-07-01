/**
 * Capability disclosure (SECURITY_MODEL step 6 — the buildable core).
 *
 * Derives the human-readable permission list from a node's declared capabilities
 * (`connections` / `requires` / `models`) — "this node will be able to: use MQTT
 * connections; access your camera; download the object-detection model". The install /
 * import UX shows this BEFORE accepting an untrusted (community) node — the informed
 * consent every burned ecosystem lacked. The manifest (author/version/hash) + the
 * actual install flow layer on top of this later.
 *
 * Typed structurally (not against `NodeDefinition`) so it's dependency-free and works on
 * a raw imported manifest before the node is ever registered.
 */

export interface CapabilityManifestLike {
  readonly connections?: ReadonlyArray<{ protocol: string }>
  readonly requires?: ReadonlyArray<string>
  readonly models?: ReadonlyArray<{ task: string }>
}

export interface CapabilityDisclosure {
  /** Connection protocols the node can use (e.g. `['mqtt', 'http']`). */
  readonly connections: string[]
  /** Hardware/runtime capabilities the node needs (e.g. `['camera', 'serial']`). */
  readonly hardware: string[]
  /** AI model tasks the node downloads + runs (e.g. `['object-detection']`). */
  readonly models: string[]
}

const HARDWARE_LABEL: Record<string, string> = {
  serial: 'access serial (USB) devices',
  midi: 'access MIDI devices',
  bluetooth: 'access Bluetooth devices',
  webgpu: 'use the GPU (WebGPU)',
  camera: 'access your camera',
}

/** Structured capability lists a node declares — the raw material for disclosure. */
export function describeCapabilities(manifest: CapabilityManifestLike): CapabilityDisclosure {
  const uniq = (xs: string[]) => [...new Set(xs)]
  return {
    connections: uniq((manifest.connections ?? []).map((c) => c.protocol)),
    hardware: uniq((manifest.requires ?? []).map(String)),
    models: uniq((manifest.models ?? []).map((m) => m.task)),
  }
}

/** True when the node requests nothing sensitive (no connections / hardware / models). */
export function hasNoCapabilities(d: CapabilityDisclosure): boolean {
  return d.connections.length === 0 && d.hardware.length === 0 && d.models.length === 0
}

/**
 * Human-readable consent lines for a node's declared capabilities — what an install /
 * import dialog renders. Empty when the node requests nothing sensitive.
 */
export function formatCapabilityConsent(manifest: CapabilityManifestLike): string[] {
  const d = describeCapabilities(manifest)
  const lines: string[] = []
  for (const p of d.connections) lines.push(`Use your ${p.toUpperCase()} connections`)
  for (const h of d.hardware) lines.push(capitalize(HARDWARE_LABEL[h] ?? `use ${h}`))
  for (const t of d.models) lines.push(`Download and run the ${t} model`)
  return lines
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
