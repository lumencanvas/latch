/**
 * HTTP protocol — co-located registration unit (ROADMAP step 6b).
 *
 * Thin unit re-declaring the existing `httpConnectionType` through
 * `defineProtocol` so the `protocolRegistry` glob owns registration. The adapter
 * class + config still live in `adapters/HttpAdapter.ts` (physical move deferred
 * to the full Phase-E co-location).
 */
import { defineProtocol } from '../../defineProtocol'
import { httpConnectionType } from '../../adapters/HttpAdapter'

export default defineProtocol(httpConnectionType)
