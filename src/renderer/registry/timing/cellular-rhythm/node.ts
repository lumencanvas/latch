import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import type { ElementaryCA } from 'bellowsjs'
import { defineNodeState } from '@/engine/nodeState'
import { getTheory } from '@/services/audio/bellowsTheory'

const definition: NodeDefinition = {
  id: 'cellular-rhythm',
  name: 'Cellular Rhythm',
  version: '1.0.0',
  category: 'timing',
  description: 'Rhythms that evolve by themselves: an elementary cellular automaton (Rule 30, 90, 110…) read as a step sequence (bellowsjs)',
  icon: 'grid',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'clock', type: 'trigger', label: 'Clock' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
    { id: 'rule', type: 'number', label: 'Rule' },
  ],
  outputs: [
    { id: 'trigger', type: 'trigger', label: 'Hit' },
    { id: 'gate', type: 'boolean', label: 'Cell On' },
    { id: 'step', type: 'number', label: 'Step' },
    { id: 'generation', type: 'number', label: 'Generation' },
    { id: 'row', type: 'array', label: 'Row (0/1)' },
  ],
  controls: [
    { id: 'rule', type: 'number', label: 'Rule (0–255)', default: 110, props: { min: 0, max: 255, step: 1 } },
    { id: 'width', type: 'number', label: 'Steps', default: 16, props: { min: 4, max: 64, step: 1 } },
    {
      id: 'start', type: 'select', label: 'Start From', default: 'single',
      props: { options: [{ value: 'single', label: 'One live cell' }, { value: 'random', label: 'Random (per Seed)' }] },
    },
    { id: 'seed', type: 'number', label: 'Seed', default: 0, props: { min: 0, max: 9999, step: 1 } },
  ],
  info: {
    overview:
      'A one-dimensional cellular automaton is a row of cells that are on or off; a Rule number (0–255) decides each cell’s next state from itself and its two neighbours. Read as a drum pattern, the row plays across one bar per clock steps, then evolves into the next generation, so the rhythm keeps changing in a structured way. Rule 110 and Rule 30 give complex, never-quite-repeating grooves; Rule 90 draws fractal Sierpinski patterns.',
    tips: [
      'Clock it at sixteenths from a Metronome and wire Hit into a Bellows Instrument on a drum preset or engine.',
      'Use two of these with different rules (or seeds) for kick and hat lines that interlock.',
      'Row outputs the whole current pattern, ready for a Step Sequencer or visuals.',
    ],
    pairsWith: ['metronome', 'bellows-instrument', 'step-sequencer', 'euclidean'],
  },
  tags: ['cellular automaton', 'rule 110', 'rule 30', 'generative', 'rhythm', 'drums', 'sequencer', 'bellows'],
}

interface CaState {
  ca: ElementaryCA | null
  sig: string
  step: number
  started: boolean
}
const caState = defineNodeState<CaState>({ label: 'cellular-rhythm' })
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const rule = clamp(Math.round(ctx.num('rule', 110)), 0, 255)
  const width = clamp(Math.round(ctx.num('width', 16)), 4, 64)
  const start = ctx.str('start', 'single')
  const seed = Math.round(ctx.num('seed', 0))
  const st = caState.getOrCreate(ctx.nodeId, () => ({ ca: null, sig: '', step: 0, started: false }))
  const theory = getTheory()
  const out = new Map<string, unknown>([['trigger', 0], ['gate', false], ['step', st.step], ['generation', 0], ['row', []]])
  if (!theory) return out

  const sig = `${rule}|${width}|${start}|${seed}`
  const build = () => {
    const init = start === 'random'
      ? theory.rng(`${ctx.nodeId}:ca:${seed}`)
      : Array.from({ length: width }, (_, i) => (i === Math.floor(width / 2) ? 1 : 0))
    st.ca = new theory.ElementaryCA(rule, width, init)
    st.step = 0
    st.started = false
  }
  if (st.sig !== sig || ctx.trig('reset')) {
    build()
    st.sig = sig
  }
  const ca = st.ca!
  let hit = false
  if (ctx.trig('clock')) {
    if (!st.started) st.started = true // the first edge plays step 0 of generation 0
    else if (++st.step >= width) {
      st.step = 0
      ca.step()
    }
    hit = ca.row[st.step] === 1
  }
  out.set('trigger', hit ? 1 : 0)
  out.set('gate', st.started && ca.row[st.step] === 1)
  out.set('step', st.step)
  out.set('generation', ca.generation)
  out.set('row', Array.from(ca.row))
  return out
}

export default defineNode({ definition, executor })
