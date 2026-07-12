import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import wavetableSpec from '@/registry/audio/wavetable/node'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'

const wavetableNode = wavetableSpec.definition
import NodeView from '@/components/controls/NodeView.vue'
import WaveformEditor from '@/components/controls/WaveformEditor.vue'
import type { ControlDefinition } from '@/stores/nodes'

/**
 * Phase 3 bullet 2 — fourth bespoke→`ui` migration. wavetable needed a small infra addition: its drawn
 * samples lived in a bare `node.data.waveform` key with NO declared control, which the wave aggregate
 * (reads via BaseNode.controlValues, declared-controls-only) couldn't see. Fix: add a data-only
 * `waveform` control whose default is the 64-sample sine table. Runtime-safe — the executor uses those
 * samples only when preset === 'custom'. These pin the wave aggregate + the new control + the routing.
 */
const STUBS = { RotaryKnob: true, AssetPickerControl: true, ConnectionSelect: true, WaveformEditor: true }
const control = (id: string): ControlDefinition => {
  const c = wavetableNode.controls.find((x) => x.id === id)
  if (!c) throw new Error(`no control ${id}`)
  return c
}

describe('wavetable migrated to declarative `ui`', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('declares a wave aggregate on [waveform, preset] + frequency + volume rows', () => {
    expect(wavetableNode.ui).toEqual({
      rows: [
        { widgets: [{ type: 'wave', bind: '', props: { fields: ['waveform', 'preset'] } }] },
        { widgets: [{ type: 'number', bind: 'frequency', label: 'Freq' }] },
        { widgets: [{ type: 'slider', bind: 'volume', label: 'Vol' }] },
      ],
    })
  })

  it('adds a data-only `waveform` control defaulting to the 64-sample sine table', () => {
    const wf = control('waveform')
    expect(wf.type).toBe('data')
    const def = wf.default as number[]
    expect(Array.isArray(def)).toBe(true)
    expect(def).toHaveLength(64)
    expect(def[0]).toBeCloseTo(0) // sin(0)
    expect(def[16]).toBeCloseTo(1) // sin(π/2)
    expect(def[32]).toBeCloseTo(0) // sin(π)
  })

  it('no longer routes through a bespoke SFC (falls back to BaseNode + NodeView)', () => {
    expect(CUSTOM_NODE_TYPE_IDS).not.toContain('wavetable')
  })

  it('assembles WaveformData from waveform+preset and disperses edits back to those controls', () => {
    const w = mount(NodeView, {
      props: {
        nodeId: 'n1',
        definition: wavetableNode,
        values: { waveform: [0, 0.5, 1, 0.5], preset: 'custom', frequency: 440, volume: 0.5 },
        surface: 'node',
      },
      global: { stubs: STUBS },
    })
    const wave = w.findComponent(WaveformEditor)
    expect(wave.props('modelValue')).toEqual({ samples: [0, 0.5, 1, 0.5], preset: 'custom' })
    wave.vm.$emit('update:modelValue', { samples: [1, 1, 1, 1], preset: 'square' })
    expect(w.emitted('update')).toEqual([['waveform', [1, 1, 1, 1]], ['preset', 'square']])
  })

  it('a fresh node (no drawn samples) shows the sine default in the editor', () => {
    const w = mount(NodeView, {
      props: { nodeId: 'n1', definition: wavetableNode, values: { preset: 'sine' }, surface: 'node' },
      global: { stubs: STUBS },
    })
    const mv = w.findComponent(WaveformEditor).props('modelValue') as { samples: number[]; preset: string }
    expect(mv.samples).toHaveLength(64) // control default, not []
    expect(mv.samples[16]).toBeCloseTo(1)
    expect(mv.preset).toBe('sine')
  })
})
