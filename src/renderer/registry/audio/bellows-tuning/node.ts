import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import type { Tuning } from 'bellowsjs'
import { defineNodeState } from '@/engine/nodeState'
import { getTheory } from '@/services/audio/bellowsTheory'
import { currentBellows, kernelGeneration } from '../bellows-instrument/bellowsManager'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
/** 5-limit just intonation, 12 notes per octave from the root (so a keyboard still maps). */
const JI_12 = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]

const definition: NodeDefinition = {
  id: 'bellows-tuning',
  name: 'Bellows Tuning',
  version: '1.0.0',
  category: 'audio',
  description: 'Retunes every bellows instrument: any equal division of the octave (19-EDO, 24-EDO quarter tones…), just intonation, or a Scala .scl tuning',
  icon: 'sliders',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'note', type: 'number', label: 'Note' }],
  outputs: [
    { id: 'hz', type: 'number', label: 'Note → Hz' },
    { id: 'cents', type: 'number', label: 'Cents from 12-TET' },
    { id: 'name', type: 'string', label: 'Tuning' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'mode', type: 'select', label: 'Tuning', default: 'edo',
      props: { options: [
        { value: '12', label: 'Standard (12-TET)' },
        { value: 'edo', label: 'Equal Division (N-EDO)' },
        { value: 'ji', label: 'Just Intonation (5-limit, 12 notes)' },
        { value: 'scala', label: 'Scala file (.scl text)' },
      ] },
    },
    { id: 'edo', type: 'number', label: 'Notes per Octave', default: 19, when: { mode: 'edo' }, props: { min: 5, max: 72, step: 1 } },
    { id: 'root', type: 'select', label: 'Root (1/1)', default: 'C', when: { mode: { ne: 'edo' } }, props: { options: ROOTS } },
    {
      id: 'scl', type: 'text', label: 'Scala .scl', default: '', when: { mode: 'scala' },
      description: 'Paste the contents of a .scl file (thousands are free in the Scala archive).',
      props: { placeholder: '! my.scl\nDescription\n 5\n!\n 9/8\n 5/4\n 3/2\n 5/3\n 2/1' },
    },
    { id: 'reference', type: 'number', label: 'A4 Reference (Hz)', default: 440, props: { min: 380, max: 480, step: 0.1 } },
  ],
  info: {
    overview:
      'Changes the tuning system of every bellows sound in the flow (Bellows Instrument, Chord, SoundFont, Granular, Singer, Voice Keys). Equal Division splits the octave into any number of equal steps: 19-EDO for sweeter thirds, 24 for quarter tones, 31 for meantone-like harmony. Just Intonation tunes the twelve keys to pure whole-number ratios from the root. Scala loads any of the thousands of historical and experimental tunings in the .scl format. In EDO tunings each MIDI note number is one step, so a keyboard plays the new scale step by step.',
    tips: [
      'Use one Tuning node per flow; deleting it returns bellows to standard tuning.',
      'Note → Hz converts a note through the current tuning, so you can feed a Tone.js Oscillator the same pitches.',
      'In 19-EDO the octave is 19 keys wide on the keyboard: play upward from MIDI 60 to hear the scale.',
    ],
    pairsWith: ['bellows-instrument', 'bellows-soundfont', 'keyboard', 'midi-input', 'oscillator'],
  },
  tags: ['tuning', 'microtonal', 'edo', 'just intonation', 'scala', 'xenharmonic', 'temperament', 'bellows'],
}

interface TuningState {
  sig: string
  tuning: Tuning | null
  name: string
  error: string
  /** Kernel generation the tuning was last applied to (-1 = not applied). */
  appliedGen: number
}

const midiHz = (m: number, ref: number) => ref * Math.pow(2, (m - 69) / 12)

const tuningState = defineNodeState<TuningState>({
  label: 'bellows-tuning',
  // Removing the node (or stopping) returns the shared kernel to standard tuning.
  dispose: (st) => {
    const b = currentBellows()
    const theory = getTheory()
    if (st.appliedGen >= 0 && b && theory) { try { b.tuning = theory.Tuning.default12 } catch { /* ignore */ } }
  },
})

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const st = tuningState.getOrCreate(ctx.nodeId, () => ({ sig: '', tuning: null, name: '', error: '', appliedGen: -1 }))
  const theory = getTheory()
  const out = new Map<string, unknown>([['hz', 0], ['cents', 0], ['name', st.name], ['error', st.error]])
  if (!theory) return out
  const mode = ctx.str('mode', 'edo')
  const ref = Math.max(380, Math.min(480, ctx.num('reference', 440)))
  const edo = Math.max(5, Math.min(72, Math.round(ctx.num('edo', 19))))
  const rootPc = Math.max(0, ROOTS.indexOf(ctx.str('root', 'C')))
  const scl = ctx.str('scl', '')
  const sig = `${mode}|${ref}|${edo}|${rootPc}|${mode === 'scala' ? scl : ''}`
  if (st.sig !== sig) {
    st.sig = sig
    st.error = ''
    st.appliedGen = -1
    const baseIndex = 60 + rootPc
    try {
      if (mode === '12') {
        st.tuning = theory.Tuning.edo(12, ref, 69)
        st.name = '12-TET'
      } else if (mode === 'ji') {
        st.tuning = theory.Tuning.ji(JI_12, midiHz(baseIndex, ref), baseIndex, 2)
        st.name = `Just intonation on ${ROOTS[rootPc]}`
      } else if (mode === 'scala') {
        if (!scl.trim()) throw new Error('Paste a .scl file to use a Scala tuning')
        const file = theory.parseScl(scl)
        // Map the scale's 1/1 to the root key at its 12-TET pitch.
        const kbm = theory.parseKbm(`0\n0\n127\n${baseIndex}\n${baseIndex}\n${midiHz(baseIndex, ref)}\n0\n`)
        st.tuning = theory.tuningFromScala(file, kbm)
        st.name = file.description || 'Scala tuning'
      } else {
        st.tuning = theory.Tuning.edo(edo, ref, 69)
        st.name = `${edo}-EDO`
      }
    } catch (e) {
      st.tuning = null
      st.error = String((e as { message?: string })?.message ?? e)
    }
  }
  const b = currentBellows()
  const gen = kernelGeneration()
  if (b && st.tuning && st.appliedGen !== gen) {
    try {
      b.tuning = st.tuning
      st.appliedGen = gen
    } catch (e) {
      st.error = String((e as { message?: string })?.message ?? e)
    }
  }
  if (st.tuning) {
    const note = ctx.num('note', 69)
    const hz = st.tuning.freqOf(note)
    out.set('hz', hz)
    out.set('cents', Number.isFinite(hz) && hz > 0 ? 1200 * Math.log2(hz / midiHz(note, ref)) : 0)
  }
  out.set('name', st.name)
  out.set('error', st.error)
  return out
}

export default defineNode({ definition, executor })
