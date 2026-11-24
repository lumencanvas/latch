import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { getTheory, getScale } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SCALE_NAMES = [
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  'harmonic minor', 'melodic minor', 'blues', 'major pentatonic', 'minor pentatonic', 'whole tone', 'chromatic',
]

const definition: NodeDefinition = {
  id: 'lsystem-melody',
  name: 'L-System Melody',
  version: '1.0.0',
  category: 'timing',
  description: 'Grows a melody from rewriting rules (a Lindenmayer system), the way plants grow: self-similar phrases in key (bellowsjs)',
  icon: 'git-branch',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'clock', type: 'trigger', label: 'Clock' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'gate', type: 'boolean', label: 'Note On (off on rests)' },
    { id: 'symbol', type: 'string', label: 'Symbol' },
    { id: 'step', type: 'number', label: 'Step' },
    { id: 'length', type: 'number', label: 'Sequence Length' },
    { id: 'sequence', type: 'string', label: 'Grown String' },
  ],
  controls: [
    { id: 'axiom', type: 'text', label: 'Start (axiom)', default: 'A' },
    { id: 'rules', type: 'text', label: 'Rules', default: 'A=AB, B=CA, C=B-', description: 'Each letter is replaced by its right-hand side every generation. Separate rules with commas.' },
    { id: 'generations', type: 'number', label: 'Generations', default: 4, props: { min: 0, max: 8, step: 1 } },
    { id: 'mapping', type: 'text', label: 'Letter → Scale Degree', default: 'A=0, B=2, C=4, -=rest', description: 'Scale degree per letter (0 = root, 7 = an octave up); rest for silence. Letters with no mapping are skipped.' },
    { id: 'root', type: 'select', label: 'Root', default: 'C', props: { options: ROOTS } },
    { id: 'scaleName', type: 'select', label: 'Scale', default: 'minor pentatonic', props: { options: SCALE_NAMES } },
    { id: 'octave', type: 'number', label: 'Octave', default: 4, props: { min: 1, max: 7, step: 1 } },
  ],
  info: {
    overview:
      'An L-system starts from a short string (the axiom) and rewrites every letter with its rule each generation, growing a long, self-similar string, the same mathematics used to model plants and fractals. Here each letter maps to a scale degree, and the grown string plays one symbol per clock step, so you get melodies whose phrases echo and nest inside each other while staying in key.',
    tips: [
      'Small changes to a rule change the whole piece; more Generations make longer, more nested melodies.',
      'Map a letter to rest (e.g. -=rest) to put breathing space in the line; Gate drops on rests.',
      'The Grown String output shows the full sequence it is playing.',
    ],
    pairsWith: ['metronome', 'bellows-instrument', 'bellows-soundfont', 'melody-walk'],
  },
  tags: ['l-system', 'lindenmayer', 'fractal', 'generative', 'melody', 'sequencer', 'bellows'],
}

interface LState {
  sig: string
  degrees: (number | null)[]
  symbols: string[]
  text: string
  step: number
  started: boolean
}
const lState = defineNodeState<LState>({ label: 'lsystem-melody' })

/** "A=AB, B=CA" → { A: 'AB', B: 'CA' } */
export function parseRules(text: string): Record<string, string> {
  const rules: Record<string, string> = {}
  for (const part of text.split(',')) {
    const m = /^\s*(\S)\s*=\s*(.*?)\s*$/.exec(part)
    if (m) rules[m[1]] = m[2]
  }
  return rules
}

/** "A=0, B=2, -=rest" → { A: 0, B: 2, '-': null } */
export function parseMapping(text: string): Record<string, number | null> {
  const map: Record<string, number | null> = {}
  for (const part of text.split(',')) {
    const m = /^\s*(\S)\s*=\s*(\S+)\s*$/.exec(part)
    if (!m) continue
    if (/^rest$/i.test(m[2])) map[m[1]] = null
    else if (Number.isFinite(Number(m[2]))) map[m[1]] = Math.round(Number(m[2]))
  }
  return map
}

/** Longest grown string kept (a rule like A=AA doubles every generation). */
const MAX_LENGTH = 4096

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const st = lState.getOrCreate(ctx.nodeId, () => ({ sig: '', degrees: [], symbols: [], text: '', step: 0, started: false }))
  const theory = getTheory()
  const out = new Map<string, unknown>([['note', 60], ['trigger', 0], ['gate', false], ['symbol', ''], ['step', 0], ['length', 0], ['sequence', '']])
  if (!theory) return out
  const axiom = ctx.str('axiom', 'A')
  const rulesText = ctx.str('rules', '')
  const gens = Math.max(0, Math.min(8, Math.round(ctx.num('generations', 4))))
  const mappingText = ctx.str('mapping', '')
  const sig = `${axiom}|${rulesText}|${gens}|${mappingText}`
  if (st.sig !== sig) {
    const grown = theory.lsystem(axiom, parseRules(rulesText), gens).slice(0, MAX_LENGTH)
    const mapping = parseMapping(mappingText)
    st.symbols = [...grown].filter((c) => c in mapping)
    st.degrees = theory.mapToDegrees(st.symbols.join(''), mapping)
    st.text = grown
    st.sig = sig
    st.step = 0
    st.started = false
  }
  if (ctx.trig('reset')) { st.step = 0; st.started = false }
  const n = st.degrees.length
  let fire = false
  if (ctx.trig('clock') && n > 0) {
    if (!st.started) st.started = true
    else st.step = (st.step + 1) % n
    fire = st.degrees[st.step] != null
  }
  const scale = getScale(theory, ctx.str('root', 'C'), ctx.str('scaleName', 'minor pentatonic'))
  const deg = n > 0 ? st.degrees[st.step] : null
  const octave = Math.max(1, Math.min(7, Math.round(ctx.num('octave', 4))))
  if (deg != null) out.set('note', Math.max(0, Math.min(127, scale.degreeToMidi(deg, octave))))
  out.set('trigger', fire ? 1 : 0)
  out.set('gate', st.started && deg != null)
  out.set('symbol', st.symbols[st.step] ?? '')
  out.set('step', st.step)
  out.set('length', n)
  out.set('sequence', st.text.length > 256 ? st.text.slice(0, 256) + '…' : st.text)
  return out
}

export default defineNode({ definition, executor })
