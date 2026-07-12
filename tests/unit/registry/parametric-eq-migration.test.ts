import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import parametricEqSpec from '@/registry/audio/parametric-eq/node'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'

const parametricEqNode = parametricEqSpec.definition
import NodeView from '@/components/controls/NodeView.vue'
import EQEditor from '@/components/controls/EQEditor.vue'

/**
 * Phase 3 bullet 2 — second bespoke→`ui` migration. `parametric-eq`'s entire body was an EQEditor bound
 * to 9 flat band controls, so it moved to the built-in `eq` Tier-B aggregate and off `components.ts`.
 * Pins behavioral parity with the old `eqData` getter/setter (band b ← freq_(b+1)/gain_(b+1)/q_(b+1),
 * same defaults) plus the routing change (bespoke SFC → BaseNode + NodeView). Behavioral, not pixel (Q3).
 */
const STUBS = { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, EQEditor: true }
const FIELDS = ['freq1', 'gain1', 'q1', 'freq2', 'gain2', 'q2', 'freq3', 'gain3', 'q3']

describe('parametric-eq migrated to declarative `ui`', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('declares an eq aggregate binding the 9 band controls in positional order', () => {
    expect(parametricEqNode.ui).toEqual({
      rows: [{ widgets: [{ type: 'eq', bind: '', props: { fields: FIELDS } }] }],
    })
  })

  it('no longer routes through a bespoke SFC (falls back to BaseNode + NodeView)', () => {
    expect(CUSTOM_NODE_TYPE_IDS).not.toContain('parametric-eq')
  })

  it('assembles 3 bands from the 9 controls and disperses edits back (parity with the old getter/setter)', () => {
    const w = mount(NodeView, {
      props: {
        nodeId: 'n1',
        definition: parametricEqNode,
        values: { freq1: 200, gain1: 1, q1: 0.5, freq2: 1000, gain2: 2, q2: 1, freq3: 5000, gain3: 3, q3: 2 },
        surface: 'node',
      },
      global: { stubs: STUBS },
    })
    const eq = w.findComponent(EQEditor)
    expect(eq.props('modelValue')).toEqual({
      bands: [
        { frequency: 200, gain: 1, q: 0.5 },
        { frequency: 1000, gain: 2, q: 1 },
        { frequency: 5000, gain: 3, q: 2 },
      ],
    })
    eq.vm.$emit('update:modelValue', {
      bands: [
        { frequency: 250, gain: 1, q: 0.5 },
        { frequency: 1000, gain: 2, q: 1 },
        { frequency: 5000, gain: 3, q: 4 },
      ],
    })
    // exact ordered 9-tuple fan-out — mirrors the bespoke single updateNodeData over all 9 keys
    expect(w.emitted('update')).toEqual([
      ['freq1', 250], ['gain1', 1], ['q1', 0.5],
      ['freq2', 1000], ['gain2', 2], ['q2', 1],
      ['freq3', 5000], ['gain3', 3], ['q3', 4],
    ])
  })

  it('falls back to the control defaults when values are absent (parity with the bespoke `?? default`)', () => {
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: parametricEqNode, values: {}, surface: 'node' },
      global: { stubs: STUBS },
    })
    // definition defaults: freq 200/1000/5000, gain 0, q 1 (matches ParametricEqNode.vue getter)
    expect(w.findComponent(EQEditor).props('modelValue')).toEqual({
      bands: [
        { frequency: 200, gain: 0, q: 1 },
        { frequency: 1000, gain: 0, q: 1 },
        { frequency: 5000, gain: 0, q: 1 },
      ],
    })
  })
})
