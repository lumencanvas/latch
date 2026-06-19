import { describe, it, expect } from 'vitest'
import { codeExecutors } from '@/engine/executors/code'
import { utilityExecutors } from '@/engine/executors/utility'

/**
 * Registry / executor integrity guards.
 *
 * The registry registers definitions into a Map keyed by `id`, so two nodes
 * sharing an id silently overwrite each other (the later import wins) and the
 * loser's ports/controls become unreachable. This previously happened with
 * `counter` (data + code) and `sample-hold` (logic + code) — and worse, the
 * winning *definition* and winning *executor* were crossed (e.g. the live
 * sample-hold def declared output `output` while its executor wrote `result`),
 * leaving both nodes broken.
 *
 * Each node id must be served by exactly one executor, and it must be the one
 * whose I/O matches the surviving definition. (Runtime duplicate-id detection is
 * additionally guarded by a DEV warning in the nodes store `register()`.)
 */
describe('executor integrity for deduped nodes', () => {
  it('serves counter from the code executor (matches its normalized/atMin/atMax outputs)', () => {
    expect(codeExecutors['counter']).toBeDefined()
    expect(utilityExecutors['counter']).toBeUndefined()
  })

  it('serves sample-hold from the utility executor (its latch/changed family + wired gc)', () => {
    expect(utilityExecutors['sample-hold']).toBeDefined()
    expect(codeExecutors['sample-hold']).toBeUndefined()
  })
})
