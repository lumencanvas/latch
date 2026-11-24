/**
 * Lightweight, eagerly-loaded facade for the CLASP executor module.
 *
 * `executors/clasp.ts` pulls in `@clasp-to/core`, the video chunker and the connections
 * store. Every `registry/clasp/<id>/node.ts` lazy-imports it so it stays out of the main
 * bundle — but the executor barrel (`executors/index.ts`) used to import it STATICALLY for
 * the three re-exported cleanup helpers, defeating those dynamic imports (Vite warned).
 *
 * This facade owns the barrel exports + the engine lifecycle registration instead. When
 * clasp.ts first loads it hands its real functions over via `_setClaspModule`; until then
 * there is no CLASP state to clean up, so every call is a no-op (and status is empty).
 */

import { defineLifecycle } from '../nodeState'

interface ClaspModuleApi {
  disposeClaspNode: (nodeId: string) => void
  disposeAllClaspConnections: () => void
  gcClaspState: (validNodeIds: Set<string>) => void
  getClaspConnectionStatus: () => Map<string, { status: string; session: string | null; subscribers: number }>
}

let claspModule: ClaspModuleApi | null = null

/** Called once by executors/clasp.ts when it loads. */
export function _setClaspModule(api: ClaspModuleApi): void {
  claspModule = api
}

export function disposeClaspNode(nodeId: string): void {
  claspModule?.disposeClaspNode(nodeId)
}

export function disposeAllClaspConnections(): void {
  claspModule?.disposeAllClaspConnections()
}

export function getClaspConnectionStatus(): Map<string, { status: string; session: string | null; subscribers: number }> {
  return claspModule?.getClaspConnectionStatus() ?? new Map()
}

// CLASP state cleanup self-registers with the engine's generic lifecycle loop. Registered
// here (eager) rather than in clasp.ts (lazy) so the hook exists from engine start; it
// delegates to the real module once loaded.
defineLifecycle({
  label: 'clasp',
  gc: (validNodeIds) => claspModule?.gcClaspState(validNodeIds),
  disposeAll: () => claspModule?.disposeAllClaspConnections(),
})
