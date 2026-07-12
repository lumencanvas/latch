import { describe, it, expect } from 'vitest'
import counterSpec from '@/registry/code/counter/node'
import sampleHoldSpec from '@/registry/logic/sample-hold/node'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

/**
 * Dual-id resolution guard (Phase 6 co-location).
 *
 * `counter` (historically defined in BOTH data + code) and `sample-hold` (logic + code) each
 * shipped TWO executor implementations. The registry deduped by id (later import wins), so the
 * surviving DEFINITION could get paired with the WRONG executor — this really happened: the live
 * sample-hold def once declared output `output` while its executor wrote `result`, leaving the
 * node broken. Co-location eliminates the hazard structurally: each id now lives in exactly one
 * `node.ts` pairing one definition with one executor, and the rival implementations were deleted
 * (utility.ts's poorer counter, code.ts's `output`-writing sample-hold).
 *
 * This test pins the surviving pairing BEHAVIOURALLY — the executor's outputs must match the
 * definition's declared ports, so a future swap to the wrong executor fails here.
 */
function ctx(inputs: Record<string, unknown>, controls: Record<string, unknown>, nodeId: string): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount: 0,
  }
}

describe('dual-id resolution (counter / sample-hold)', () => {
  it('counter is served by the RICH code executor (count/normalized/atMin/atMax match the def)', () => {
    // The def declares four outputs; the utility rival only emitted `count`.
    expect(counterSpec.definition.outputs.map((o) => o.id)).toEqual(['count', 'normalized', 'atMin', 'atMax'])
    const out = counterSpec.executor(ctx({ increment: true }, { min: 0, max: 100, step: 1 }, 'ri-counter')) as Map<string, unknown>
    expect(out.get('count')).toBe(1) // incremented from min on the rising edge
    expect(out.get('normalized')).toBeCloseTo(0.01) // the RICH executor — the rival had no `normalized`
    expect(out.get('atMin')).toBe(false)
    expect(out.get('atMax')).toBe(false)
  })

  it('sample-hold is served by the utility executor (holds on trigger, outputs `result`)', () => {
    // The def declares a single `result` output; the code rival wrote `output` (the crossed bug).
    expect(sampleHoldSpec.definition.outputs.map((o) => o.id)).toEqual(['result'])
    const id = 'ri-sample-hold'
    expect((sampleHoldSpec.executor(ctx({ value: 'a', trigger: true }, {}, id)) as Map<string, unknown>).get('result')).toBe('a')
    // No new trigger → holds the previously captured value.
    expect((sampleHoldSpec.executor(ctx({ value: 'b', trigger: false }, {}, id)) as Map<string, unknown>).get('result')).toBe('a')
  })
})
