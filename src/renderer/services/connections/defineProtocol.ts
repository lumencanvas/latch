/**
 * `defineProtocol` — the unified connection-protocol manifest.
 *
 * One declarative unit that *is* the existing `ConnectionTypeDefinition`
 * (metadata + declarative `configControls` + `defaultConfig` + `createAdapter`
 * factory). It exists so a protocol can be authored next to its adapter in a
 * single co-located `protocols/<name>/protocol.ts` and auto-discovered by the
 * `protocolRegistry` glob, instead of being wired up in the 3 separate places it
 * is today (`adapters/index.ts`, the `index.ts` re-export, and `registerBuiltInTypes`)
 * with its icon in a central map (EXTENSIBILITY_ARCHITECTURE §7).
 *
 * **Frozen public contract** (POLICIES §2): like `defineNode`, this is a public
 * authoring surface — additive-only within a major version; retirement goes
 * through a deprecation cycle, never a silent removal. The capability/trust-tier
 * metadata named in SECURITY_MODEL arrives in a later Phase-2 step (it is
 * maintainer-sign-off-gated); being optional, adding it later is non-breaking.
 *
 * Live: all 6 built-in protocols are co-located as `protocols/<name>/protocol.ts` and
 * auto-discovered by the `protocolRegistry` glob, which is authoritative — the manager
 * loops the glob output in `registerBuiltInTypes()`.
 */

import type { BaseConnectionConfig, ConnectionTypeDefinition } from './types'

/**
 * Identity function that brands a `ConnectionTypeDefinition` as the single
 * authored unit for a connection protocol. Exists for inference + a stable
 * authoring surface (so every `protocol.ts` exports the same shape), mirroring
 * `defineNode` (`engine/defineNode.ts`).
 */
export function defineProtocol<TConfig extends BaseConnectionConfig = BaseConnectionConfig>(
  spec: ConnectionTypeDefinition<TConfig>
): ConnectionTypeDefinition<TConfig> {
  return spec
}
