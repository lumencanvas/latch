import { describe, it, expect, beforeEach } from 'vitest'
import smoothSpec from './node'
import { runNode, runFrames, resetNodeState } from '../../../../../tests/helpers/testNode'

/**
 * Example co-located node test (authoring DX). Lives next to `node.ts`; vitest discovers it
 * via the `src/renderer/registry/**` include. `smooth` is stateful, so reset between cases.
 * This is the copy-me shape a hand-authored node's `node.test.ts` should follow.
 */
beforeEach(resetNodeState)

describe('smooth (co-located node.test.ts example)', () => {
  it('initializes to the first target', async () => {
    const out = await runNode(smoothSpec, { inputs: { value: 0 }, controls: { factor: 0.3 } })
    expect(out.get('result')).toBe(0)
  })

  it('eases toward a changed target instead of jumping to it', async () => {
    const [, second] = await runFrames(smoothSpec, [
      { inputs: { value: 0 }, controls: { factor: 0.3 } },
      { inputs: { value: 1 }, controls: { factor: 0.3 } },
    ])
    const r = second.get('result') as number
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })
})
