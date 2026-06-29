import {
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextData,
} from '@/engine/ExecutionEngine'
import type { NodeDefinition } from '@/stores/nodes'

/**
 * Build an ExecutionContext for executor unit tests with the typed accessors
 * (ctx.num/bool/str/trig/level) wired up via the production factory. Prefer this
 * over hand-rolled context literals so tests of executors that use the accessors
 * behave exactly like production. Existing per-file `createContext` helpers stay
 * valid; migrate them to this when their executor starts using the accessors.
 */
export function makeContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  overrides: Partial<ExecutionContextData> = {},
): ExecutionContext {
  return createExecutionContext({
    nodeId: 'test-node',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: {} as NodeDefinition,
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
    ...overrides,
  })
}
