import { describe, it, expect } from 'vitest'
import {
  runFlow,
  mkNode,
  mkEdge,
  pureStaticFlow,
  timeDrivenFlow,
  lfoFlow,
  diamondFlow,
  type FlowDef,
} from './flowHarness'

/**
 * Golden snapshots of the CURRENT execution engine over several frames.
 *
 * These freeze observable per-node output behavior for representative flows. The
 * Phase 2 change-driven (dirty-flag) rewrite must reproduce these exactly — any
 * divergence fails here. Time is mocked deterministically by the harness, so
 * time/LFO-driven flows are stable across runs.
 *
 * If a snapshot legitimately needs to change, regenerate with `-u` and review
 * the diff carefully — an unexpected change is a regression.
 */

const FRAMES = 6

// Smooth holds per-node state (`smoothState`) and eases toward its target; fed a
// constant it settles on that value and emits only `result` (the old `_prev`
// pass-through bug is fixed — see docs/AUDIT_2026-06-14.md). Convergence math is
// covered in tests/unit/executors/smooth.test.ts.
function smoothFlow(): FlowDef {
  return {
    nodes: [
      mkNode('k', 'constant', { value: 10 }),
      mkNode('sm', 'smooth', { factor: 0.3 }),
    ],
    edges: [mkEdge('k', 'value', 'sm', 'value')],
  }
}

describe('golden flows (current engine behavior)', () => {
  it('pure static arithmetic is stable across frames', async () => {
    expect(await runFlow(pureStaticFlow(), { frames: FRAMES })).toMatchSnapshot()
  })

  it('time-driven flow advances deterministically', async () => {
    expect(await runFlow(timeDrivenFlow(), { frames: FRAMES })).toMatchSnapshot()
  })

  it('lfo-driven flow oscillates deterministically', async () => {
    expect(await runFlow(lfoFlow(), { frames: FRAMES })).toMatchSnapshot()
  })

  it('diamond reconvergence', async () => {
    expect(await runFlow(diamondFlow(), { frames: FRAMES })).toMatchSnapshot()
  })

  it('stateful smooth settles on a constant source and emits only result', async () => {
    expect(await runFlow(smoothFlow(), { frames: FRAMES })).toMatchSnapshot()
  })
})
