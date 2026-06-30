/**
 * Auto-discovery registry — collects every co-located connection protocol from a glob.
 *
 * The end state (ROADMAP Phase 2 step 6) is that adding a connection protocol
 * means dropping a single `protocols/<name>/protocol.ts` exporting
 * `defineProtocol({...})` (+ its adapter/config in the same folder) — no central
 * edits, and the BLE/Serial/MIDI registration drift becomes structurally
 * impossible. This module is that collector, added NOW (step 6a) alongside the
 * hand-wired `registerBuiltInTypes()` list so the count guard exists from the
 * first commit (EXTENSIBILITY_ARCHITECTURE §7, POLICIES §1).
 *
 * Today the glob matches ZERO files (protocols still live as `adapters/<Name>Adapter.ts`
 * exporting a `*ConnectionType` object), so this is inert — the manager continues
 * to use the hand-wired list. The collector becomes authoritative only once step
 * 6b co-locates protocols into `protocols/<name>/protocol.ts` folders and
 * `registerBuiltInTypes()` collapses to a loop over `colocatedProtocolTypes`.
 *
 * Mirrors `registry/nodeRegistry.ts`; lives under `src/renderer` so Vite's
 * `import.meta.glob` and `vite/client` types resolve and the relative glob is correct.
 */

import type { ConnectionTypeDefinition } from './types'

// Eager so the registry is ready synchronously at import; `import: 'default'`
// pulls each file's `export default defineProtocol(...)`. A file with only named
// exports yields `undefined` here and is flagged below (the default-export guard).
const modules = import.meta.glob<ConnectionTypeDefinition>('./protocols/**/protocol.ts', {
  eager: true,
  import: 'default',
})

const specsById: Record<string, ConnectionTypeDefinition> = {}
const duplicateIds: string[] = []
const missingDefault: string[] = []

// Deterministic order so any error message / iteration is stable.
for (const path of Object.keys(modules).sort()) {
  const spec = modules[path] as ConnectionTypeDefinition | undefined
  if (!spec || typeof spec !== 'object' || !spec.id || typeof spec.createAdapter !== 'function') {
    missingDefault.push(path)
    continue
  }
  if (spec.id in specsById) duplicateIds.push(spec.id)
  else specsById[spec.id] = spec
}

// Fail loudly at import (CI-caught) rather than silently dropping a protocol.
if (missingDefault.length > 0) {
  throw new Error(
    `[protocolRegistry] protocol.ts without a default defineProtocol() export: ${missingDefault.join(', ')}`
  )
}
if (duplicateIds.length > 0) {
  throw new Error(
    `[protocolRegistry] duplicate protocol id(s) across protocol.ts files: ${duplicateIds.join(', ')}`
  )
}

/** Every co-located protocol spec, keyed by its protocol id. */
export const protocolSpecs: Readonly<Record<string, ConnectionTypeDefinition>> = specsById

/** The co-located protocol ids (a subset of the built-in set until step 6b completes). */
export const colocatedProtocolIds: readonly string[] = Object.keys(specsById)

/**
 * Co-located protocol type definitions — what `registerBuiltInTypes()` will loop
 * over once step 6b co-locates the built-in protocols.
 */
export const colocatedProtocolTypes: ConnectionTypeDefinition[] = Object.values(specsById)
