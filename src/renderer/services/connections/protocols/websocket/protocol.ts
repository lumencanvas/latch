/**
 * WebSocket protocol — co-located registration unit (ROADMAP step 6b).
 *
 * Thin unit re-declaring the existing `websocketConnectionType` through
 * `defineProtocol` so the `protocolRegistry` glob owns registration. The adapter
 * class + config still live in `adapters/WebSocketAdapter.ts` (physical move
 * deferred to the full Phase-E co-location).
 */
import { defineProtocol } from '../../defineProtocol'
import { websocketConnectionType } from '../../adapters/WebSocketAdapter'

export default defineProtocol(websocketConnectionType)
