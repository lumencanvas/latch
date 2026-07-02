import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useRuntimeStore } from '@/stores/runtime'
import type { NodeDefinition, UISchema } from '@/stores/nodes'
import NodeView from '@/components/controls/NodeView.vue'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'

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
})
