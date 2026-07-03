import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useRuntimeStore } from '@/stores/runtime'
import type { NodeDefinition, UISchema } from '@/stores/nodes'
import NodeView from '@/components/controls/NodeView.vue'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'
import EnvelopeEditor from '@/components/controls/EnvelopeEditor.vue'
import EQEditor from '@/components/controls/EQEditor.vue'
import WaveformEditor from '@/components/controls/WaveformEditor.vue'
import XYPad from '@/components/controls/XYPad.vue'

/**
 * NodeView is the single interpreter for the declarative `ui` schema (Phase 3 bullet 2, Tier A).
 * These pin the seam: primitives delegate to <ControlRenderer>, rich widgets dispatch, `when`
 * filters rows/widgets via the same evaluator, `surfaces` gates, and `source:'output'` readouts
 * pull from runtime metrics.
 */
function def(ui: UISchema): NodeDefinition {
  return {
    id: 't',
    name: 'T',
    version: '1.0.0',
    category: 'data',
    description: '',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [],
    controls: [
      { id: 'amount', type: 'slider', label: 'Amount', default: 0, props: { min: 0, max: 10, step: 1 } },
      { id: 'gain', type: 'number', label: 'Gain', default: 0, props: { min: 0, max: 100 } },
    ],
    ui,
  }
}

const mountView = (ui: UISchema, values: Record<string, unknown>, surface: 'node' | 'panel' = 'panel') =>
  mount(NodeView, {
    props: { nodeId: 'n1', definition: def(ui), values, surface },
    global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true } },
  })

describe('NodeView (Tier A interpreter)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('delegates a primitive widget to <ControlRenderer> and re-emits update(controlId, value)', async () => {
    const w = mountView({ rows: [{ widgets: [{ type: 'slider', bind: 'amount' }] }] }, { amount: 3 })
    const range = w.get('input[type="range"]')
    expect((range.element as HTMLInputElement).value).toBe('3')
    await range.setValue('4')
    expect(w.emitted('update')?.at(-1)).toEqual(['amount', 4])
  })

  it('dispatches a knob widget and maps its update to update(controlId, value)', async () => {
    const w = mountView({ rows: [{ widgets: [{ type: 'knob', bind: 'gain' }] }] }, { gain: 5 })
    const knob = w.findComponent(RotaryKnob)
    expect(knob.exists()).toBe(true)
    expect(knob.props('modelValue')).toBe(5)
    knob.vm.$emit('update:modelValue', 7)
    expect(w.emitted('update')?.at(-1)).toEqual(['gain', 7])
  })

  it('filters widgets by `when` using the shared evaluator (with operators)', () => {
    const ui: UISchema = {
      rows: [{ widgets: [
        { type: 'number', bind: 'gain', when: { amount: { gt: 5 } } },
        { type: 'slider', bind: 'amount' },
      ] }],
    }
    const hidden = mountView(ui, { amount: 3 })
    expect(hidden.find('input[type="number"]').exists()).toBe(false)
    expect(hidden.find('input[type="range"]').exists()).toBe(true)
    const shown = mountView(ui, { amount: 9 })
    expect(shown.find('input[type="number"]').exists()).toBe(true)
  })

  it('gates whole rows by row-level `when`', () => {
    const ui: UISchema = { rows: [{ when: { amount: 1 }, widgets: [{ type: 'slider', bind: 'amount' }] }] }
    expect(mountView(ui, { amount: 0 }).find('input').exists()).toBe(false)
    expect(mountView(ui, { amount: 1 }).find('input').exists()).toBe(true)
  })

  it('respects the schema-level `surfaces` gate', () => {
    const ui: UISchema = { rows: [{ widgets: [{ type: 'slider', bind: 'amount' }] }], surfaces: ['node'] }
    expect(mountView(ui, { amount: 3 }, 'panel').find('input').exists()).toBe(false)
    expect(mountView(ui, { amount: 3 }, 'node').find('input').exists()).toBe(true)
  })

  it('renders a readout from runtime output values (source: output)', () => {
    useRuntimeStore().updateNodeMetrics('n1', { outputValues: { out: 42 } })
    const w = mountView({ rows: [{ widgets: [{ type: 'readout', bind: 'out', source: 'output' }] }] }, {})
    expect(w.get('.nv-readout').text()).toBe('42')
  })

  it('stops mousedown propagation on widgets (so canvas node-drag does not hijack an editor drag)', () => {
    const onDoc = vi.fn()
    document.addEventListener('mousedown', onDoc)
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: def({ rows: [{ widgets: [{ type: 'slider', bind: 'amount' }] }] }), values: { amount: 3 }, surface: 'node' },
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true } },
      attachTo: document.body,
    })
    w.get('.nv-widget').trigger('mousedown') // bubbles; @mousedown.stop must halt it before document
    expect(onDoc).not.toHaveBeenCalled()
    document.removeEventListener('mousedown', onDoc)
    w.unmount()
  })

  it('aggregate (env): assembles EnvelopeData from 4 flat controls and fans updates back out', () => {
    const ui = { rows: [{ widgets: [{ type: 'env', bind: '', props: { fields: ['a', 'd', 's', 'r'] } }] }] }
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: def(ui), values: { a: 0.1, d: 0.2, s: 0.5, r: 0.3 }, surface: 'panel' },
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, EnvelopeEditor: true } },
    })
    const env = w.findComponent(EnvelopeEditor)
    // assemble: structured keys ← positional control fields
    expect(env.props('modelValue')).toEqual({ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 })
    // disperse: an edit fans out one update(controlId, value) per field
    env.vm.$emit('update:modelValue', { attack: 0.9, decay: 0.2, sustain: 0.5, release: 0.3 })
    const updates = w.emitted('update') as unknown[][]
    // exact ordered fan-out — a middle-field transposition (e.g. decay/sustain swap) must not survive
    expect(updates).toEqual([['a', 0.9], ['d', 0.2], ['s', 0.5], ['r', 0.3]])
  })

  it('aggregate (env): missing fields fall back to the control default, then 0', () => {
    const definition = def({ rows: [{ widgets: [{ type: 'env', bind: '', props: { fields: ['a', 'd', 's', 'r'] } }] }] })
    definition.controls = [
      { id: 'a', type: 'number', label: 'A', default: 0.01 },
      { id: 'd', type: 'number', label: 'D', default: 0.1 },
      { id: 's', type: 'number', label: 'S', default: 0.5 },
      { id: 'r', type: 'number', label: 'R' }, // no default → final 0 fallback
    ]
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition, values: { d: 0.2 }, surface: 'panel' }, // 'a','s','r' absent
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, EnvelopeEditor: true } },
    })
    expect(w.findComponent(EnvelopeEditor).props('modelValue')).toEqual({
      attack: 0.01, // control default (not 0)
      decay: 0.2, // present in values, overrides default
      sustain: 0.5, // control default
      release: 0, // absent value + no default → 0
    })
  })

  it('aggregate (eq): assembles 3 bands from 9 flat controls (chunked by 3) and fans updates back out', () => {
    const fields = ['freq1', 'gain1', 'q1', 'freq2', 'gain2', 'q2', 'freq3', 'gain3', 'q3']
    const ui = { rows: [{ widgets: [{ type: 'eq', bind: '', props: { fields } }] }] }
    const values = {
      freq1: 200, gain1: 1, q1: 0.5,
      freq2: 1000, gain2: 2, q2: 1,
      freq3: 5000, gain3: 3, q3: 2,
    }
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: def(ui), values, surface: 'panel' },
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, EQEditor: true } },
    })
    const eq = w.findComponent(EQEditor)
    // assemble: positional fields → { bands: [{frequency,gain,q}×3] } (mirrors bespoke _parametric-eq)
    expect(eq.props('modelValue')).toEqual({
      bands: [
        { frequency: 200, gain: 1, q: 0.5 },
        { frequency: 1000, gain: 2, q: 1 },
        { frequency: 5000, gain: 3, q: 2 },
      ],
    })
    // disperse: an edit fans out one update(controlId, value) per field — 9 total, positionally
    eq.vm.$emit('update:modelValue', {
      bands: [
        { frequency: 250, gain: 1, q: 0.5 },
        { frequency: 1000, gain: 2, q: 1 },
        { frequency: 5000, gain: 3, q: 4 },
      ],
    })
    const updates = w.emitted('update') as unknown[][]
    // exact ordered 9-tuple — catches any band/key axis transposition, not just the two corners
    expect(updates).toEqual([
      ['freq1', 250], ['gain1', 1], ['q1', 0.5],
      ['freq2', 1000], ['gain2', 2], ['q2', 1],
      ['freq3', 5000], ['gain3', 3], ['q3', 4],
    ])
  })

  it('aggregate (eq): missing fields fall back to the control default, then 0', () => {
    const fields = ['freq1', 'gain1', 'q1', 'freq2', 'gain2', 'q2', 'freq3', 'gain3', 'q3']
    const definition = def({ rows: [{ widgets: [{ type: 'eq', bind: '', props: { fields } }] }] })
    definition.controls = fields.map((id) =>
      id === 'freq2'
        ? { id, type: 'number', label: id } // no default → final 0 fallback
        : { id, type: 'number', label: id, default: id.startsWith('freq') ? 1000 : 1 }
    )
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition, values: { gain1: 7 }, surface: 'panel' }, // only gain1 present
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, EQEditor: true } },
    })
    expect(w.findComponent(EQEditor).props('modelValue')).toEqual({
      bands: [
        { frequency: 1000, gain: 7, q: 1 }, // freq1 default, gain1 present, q1 default
        { frequency: 0, gain: 1, q: 1 },    // freq2 no default → 0
        { frequency: 1000, gain: 1, q: 1 },
      ],
    })
  })

  it('aggregate (wave): assembles WaveformData from a samples field + a preset field, fans both out', () => {
    const ui = { rows: [{ widgets: [{ type: 'wave', bind: '', props: { fields: ['waveform', 'preset'] } }] }] }
    const w = mount(NodeView, {
      props: {
        nodeId: 'n1',
        definition: def(ui),
        values: { waveform: [0, 0.5, 1, 0.5], preset: 'custom' },
        surface: 'panel',
      },
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, WaveformEditor: true } },
    })
    const wave = w.findComponent(WaveformEditor)
    // assemble: samples ← field[0] (array), preset ← field[1] (string) — mirrors bespoke _wavetable
    expect(wave.props('modelValue')).toEqual({ samples: [0, 0.5, 1, 0.5], preset: 'custom' })
    // disperse: an edit fans out samples then preset — 2 updates
    wave.vm.$emit('update:modelValue', { samples: [1, 1, 1, 1], preset: 'square' })
    const updates = w.emitted('update') as unknown[][]
    expect(updates).toEqual([['waveform', [1, 1, 1, 1]], ['preset', 'square']])
  })

  it('aggregate (wave): missing fields fall back to control defaults, then []/sine', () => {
    const definition = def({ rows: [{ widgets: [{ type: 'wave', bind: '', props: { fields: ['waveform', 'preset'] } }] }] })
    definition.controls = [
      { id: 'waveform', type: 'number', label: 'W' }, // no default → [] fallback
      { id: 'preset', type: 'select', label: 'P', default: 'triangle' },
    ]
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition, values: {}, surface: 'panel' }, // both absent
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, WaveformEditor: true } },
    })
    expect(w.findComponent(WaveformEditor).props('modelValue')).toEqual({
      samples: [], // absent + no array default → []
      preset: 'triangle', // control default
    })
  })

  it('aggregate (xy): assembles {x,y} from 2 flat controls and fans updates back out', () => {
    const ui = { rows: [{ widgets: [{ type: 'xy', bind: '', props: { fields: ['normalizedX', 'normalizedY'] } }] }] }
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: def(ui), values: { normalizedX: 0.25, normalizedY: 0.75 }, surface: 'panel' },
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, XYPad: true } },
    })
    const xy = w.findComponent(XYPad)
    // assemble: {x,y} ← positional control fields (mirrors bespoke xy-pad normalizedX/normalizedY)
    expect(xy.props('modelValue')).toEqual({ x: 0.25, y: 0.75 })
    // disperse: an edit fans out one update(controlId, value) per axis
    xy.vm.$emit('update:modelValue', { x: 0.1, y: 0.9 })
    const updates = w.emitted('update') as unknown[][]
    expect(updates).toEqual([['normalizedX', 0.1], ['normalizedY', 0.9]])
  })

  it('aggregate (xy): missing fields fall back to the control default (0.5), then 0', () => {
    const definition = def({ rows: [{ widgets: [{ type: 'xy', bind: '', props: { fields: ['normalizedX', 'normalizedY'] } }] }] })
    definition.controls = [
      // non-round default so the assertion can only pass by READING the control default, not a hardcoded 0.5
      { id: 'normalizedX', type: 'number', label: 'X', default: 0.42 },
      { id: 'normalizedY', type: 'number', label: 'Y' }, // no default → final 0 fallback
    ]
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition, values: {}, surface: 'panel' }, // both absent
      global: { stubs: { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, XYPad: true } },
    })
    expect(w.findComponent(XYPad).props('modelValue')).toEqual({ x: 0.42, y: 0 })
  })
})
