/**
 * BLE protocol — co-located registration unit (ROADMAP step 6b).
 *
 * Registers the existing `BleAdapter` (adapters/BleAdapter.ts) as a first-class
 * connection type through the `protocolRegistry` glob — closing the "BLE adapter
 * exists but is unregistered" drift (EXTENSIBILITY §0 / AUDIT). Thin re-declaration
 * only; the adapter + config stay in `adapters/` until the full Phase-E co-location.
 */
import { defineProtocol } from '../../defineProtocol'
import { bleConnectionType } from '../../adapters/BleAdapter'

export default defineProtocol(bleConnectionType)
