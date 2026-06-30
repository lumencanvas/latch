/**
 * CLASP protocol — co-located registration unit (ROADMAP step 6b).
 *
 * Thin unit that re-declares the existing `claspConnectionType` through
 * `defineProtocol` so the `protocolRegistry` glob is the single authority for
 * registration. The adapter class + config still live in
 * `adapters/ClaspAdapter.ts` (physical co-location of adapter/config into this
 * folder is deferred to the full Phase-E move).
 *
 * Note: CLASP is exempt from the `ctx.connection()` helper (it keeps its own
 * `ClaspConnection` layer) — but it is still a registered connection *type*, so
 * it is co-located here like the others.
 */
import { defineProtocol } from '../../defineProtocol'
import { claspConnectionType } from '../../adapters/ClaspAdapter'

export default defineProtocol(claspConnectionType)
