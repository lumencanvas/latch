import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import envelopeVisualSpec from '@/registry/audio/envelope-visual/node'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'

const envelopeVisualNode = envelopeVisualSpec.definition
import NodeView from '@/components/controls/NodeView.vue'
import EnvelopeEditor from '@/components/controls/EnvelopeEditor.vue'

/**
 * Phase 3 bullet 2 — first real bespoke→`ui` migration. `envelope-visual`'s entire body was an
 * EnvelopeEditor bound to 4 ADSR controls, so it moved to the built-in `env` Tier-B aggregate and off
 * `registry/components.ts`. These pin behavioral parity with the old EnvelopeVisualNode.vue (the
 * `envelopeData` getter/setter read/write the same node.data keys with the same defaults) plus the
 * routing change (bespoke SFC → BaseNode + NodeView). Behavioral parity, not pixel parity (design Q3).
 */
const STUBS = { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, EnvelopeEditor: true }

describe('envelope-visual migrated to declarative `ui`', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('declares an env aggregate binding the 4 ADSR controls in ENV_ORDER', () => {
    expect(envelopeVisualNode.ui).toEqual({
      rows: [{ widgets: [{ type: 'env', bind: '', props: { fields: ['attack', 'decay', 'sustain', 'release'] } }] }],
    })
  })

  it('no longer routes through a bespoke SFC (falls back to BaseNode + NodeView)', () => {
    expect(CUSTOM_NODE_TYPE_IDS).not.toContain('envelope-visual')
  })

  it('assembles EnvelopeData from the 4 controls and disperses edits back (parity with the old getter/setter)', () => {
    const w = mount(NodeView, {
      props: {
        nodeId: 'n1',
        definition: envelopeVisualNode,
        values: { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.4 },
        surface: 'node',
      },
      global: { stubs: STUBS },
    })
    const env = w.findComponent(EnvelopeEditor)
    expect(env.props('modelValue')).toEqual({ attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.4 })
    env.vm.$emit('update:modelValue', { attack: 0.9, decay: 0.15, sustain: 0.6, release: 0.4 })
    expect(w.emitted('update')).toEqual([['attack', 0.9], ['decay', 0.15], ['sustain', 0.6], ['release', 0.4]])
  })

  it('falls back to the control defaults when values are absent (parity with the bespoke `?? default`)', () => {
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: envelopeVisualNode, values: {}, surface: 'node' },
      global: { stubs: STUBS },
    })
    // definition defaults: attack 0.01, decay 0.1, sustain 0.5, release 0.3 (matches EnvelopeVisualNode.vue)
    expect(w.findComponent(EnvelopeEditor).props('modelValue')).toEqual({
      attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3,
    })
  })
})
