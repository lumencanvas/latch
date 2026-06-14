import { describe, it, expect } from 'vitest'
import { runFlow, mkNode, mkEdge, type FlowDef } from './flowHarness'

/**
 * Golden snapshots of the CURRENT execution engine over several frames.
 *
 * These freeze observable per-node output behavior for a set of representative
 * flows. The Phase 2 change-driven (dirty-flag) rewrite must reproduce these
 * exactly — any divergence fails here. Time is mocked deterministically by the
 * harness, so time/LFO-driven flows are stable across runs.
 *
 * If a snapshot legitimately needs to change, regenerate with `-u` and review
 * the diff carefully — an unexpected change is a regression.
 */

const FRAMES = 6

// 1. Pure arithmetic — outputs are constant across frames (no time/state).
function pureStaticFlow(): FlowDef {
  return {
    nodes: [
      mkNode('c1', 'constant', { value: 5 }),
      mkNode('c2', 'constant', { value: 3 }),
      mkNode('sum', 'add'),
      mkNode('cl', 'clamp', { min: 0, max: 10 }),
    ],
    edges: [
      mkEdge('c1', 'value', 'sum', 'a'),
      mkEdge('c2', 'value', 'sum', 'b'),
      mkEdge('sum', 'result', 'cl', 'value'),
    ],
  }
}

// 2. Time-driven — the Time node changes every frame and propagates downstream.
function timeDrivenFlow(): FlowDef {
  return {
    nodes: [
      mkNode('t', 'time'),
      mkNode('mr', 'map-range', { inMin: 0, inMax: 1, outMin: 0, outMax: 100 }),
      mkNode('cl', 'clamp', { min: 0, max: 50 }),
    ],
    edges: [
      mkEdge('t', 'time', 'mr', 'value'),
      mkEdge('mr', 'result', 'cl', 'value'),
    ],
  }
}

// 3. LFO-driven — continuous oscillator multiplied by a constant.
function lfoFlow(): FlowDef {
  return {
    nodes: [
      mkNode('lfo', 'lfo', { frequency: 2, amplitude: 10, offset: 0, waveform: 'sine' }),
      mkNode('k', 'constant', { value: 2 }),
      mkNode('mul', 'multiply'),
    ],
    edges: [
      mkEdge('lfo', 'value', 'mul', 'a'),
      mkEdge('k', 'value', 'mul', 'b'),
    ],
  }
}

// 4. Diamond — one source fans out to two ops that reconverge at a comparison.
function diamondFlow(): FlowDef {
  return {
    nodes: [
      mkNode('a', 'constant', { value: 5 }),
      mkNode('b', 'constant', { value: 2 }),
      mkNode('sum', 'add'),
      mkNode('prod', 'multiply'),
      mkNode('cmp', 'compare', { operator: '<' }),
    ],
    edges: [
      mkEdge('a', 'value', 'sum', 'a'),
      mkEdge('b', 'value', 'sum', 'b'),
      mkEdge('a', 'value', 'prod', 'a'),
      mkEdge('b', 'value', 'prod', 'b'),
      mkEdge('sum', 'result', 'cmp', 'a'),
      mkEdge('prod', 'result', 'cmp', 'b'),
    ],
  }
}

// 5. Stateful — Smooth carries state between frames, converging toward its input.
function statefulSmoothFlow(): FlowDef {
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

  it('stateful smoothing converges over frames', async () => {
    expect(await runFlow(statefulSmoothFlow(), { frames: FRAMES })).toMatchSnapshot()
  })
})
