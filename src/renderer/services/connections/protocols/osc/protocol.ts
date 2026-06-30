/**
 * OSC protocol — co-located registration unit (ROADMAP step 6b).
 *
 * Thin unit re-declaring the existing `oscConnectionType` through
 * `defineProtocol` so the `protocolRegistry` glob owns registration. The adapter
 * class + config still live in `adapters/OscAdapter.ts` (physical move deferred
 * to the full Phase-E co-location).
 */
import { defineProtocol } from '../../defineProtocol'
import { oscConnectionType } from '../../adapters/OscAdapter'

export default defineProtocol(oscConnectionType)
