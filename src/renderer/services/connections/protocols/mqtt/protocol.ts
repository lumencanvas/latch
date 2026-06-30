/**
 * MQTT protocol — co-located registration unit (ROADMAP step 6b).
 *
 * Thin unit re-declaring the existing `mqttConnectionType` through
 * `defineProtocol` so the `protocolRegistry` glob owns registration. The adapter
 * class + config still live in `adapters/MqttAdapter.ts` (physical move deferred
 * to the full Phase-E co-location).
 */
import { defineProtocol } from '../../defineProtocol'
import { mqttConnectionType } from '../../adapters/MqttAdapter'

export default defineProtocol(mqttConnectionType)
