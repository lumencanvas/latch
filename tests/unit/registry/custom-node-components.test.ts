import { describe, it, expect } from 'vitest'
import { nodeTypes, CUSTOM_NODE_TYPE_IDS } from '@/registry/components'
import { allNodes } from '@/registry/allNodes'

/**
 * Increment 5 — `component` is the single source of truth for bespoke-SFC routing.
 *
 * `registry/components.ts` no longer hand-maintains the node-type → component map; it DERIVES both
 * `nodeTypes` and `CUSTOM_NODE_TYPE_IDS` from the node definitions that carry a `component` field
 * (`allNodes.filter(d => d.component)`). These tests pin that:
 *   1. the derived custom-type set is byte-for-byte the historical hand-maintained set (no drift), and
 *   2. every custom id is backed by exactly one definition carrying a `component` (the single source).
 * A migrated-to-`ui` node (envelope-visual/parametric-eq/wavetable/xy-pad) must carry NEITHER a
 * `component` NOR appear here — it renders via BaseNode + NodeView.
 */

// The frozen historical set (was the hand-maintained `nodeTypes` map keys, minus default/custom).
const EXPECTED_CUSTOM_TYPES = [
  'dispatch', 'emulator', 'equalizer', 'function', 'gamepad-visual', 'graph',
  'keyboard', 'knob', 'main-output', 'mediapipe-audio', 'mediapipe-face',
  'mediapipe-gesture', 'mediapipe-hand', 'mediapipe-object', 'mediapipe-pose',
  'mediapipe-segmentation', 'monitor', 'muse-eeg', 'oscilloscope', 'step-sequencer',
  'synth', 'textbox', 'trigger',
].sort()

const MIGRATED_TO_UI = ['envelope-visual', 'parametric-eq', 'wavetable', 'xy-pad']

// The exact SFC each id must resolve to (Vue sets `__name` to the component's filename). Pins that a
// definition imports its OWN `.vue` — catches a single wrong import that the distinctness check misses.
const EXPECTED_COMPONENT_NAME: Record<string, string> = {
  trigger: 'TriggerNode', textbox: 'TextboxNode', knob: 'KnobNode', keyboard: 'KeyboardNode',
  'gamepad-visual': 'GamepadVisualNode', monitor: 'MonitorNode', oscilloscope: 'OscilloscopeNode',
  graph: 'GraphNode', equalizer: 'EqualizerNode', 'main-output': 'MainOutputNode',
  'step-sequencer': 'StepSequencerNode', synth: 'SynthNode', function: 'FunctionNode',
  dispatch: 'DispatchNode', emulator: 'EmulatorNode', 'mediapipe-hand': 'MediaPipeHandNode',
  'mediapipe-face': 'MediaPipeFaceNode', 'mediapipe-pose': 'MediaPipePoseNode',
  'mediapipe-object': 'MediaPipeObjectNode', 'mediapipe-segmentation': 'MediaPipeSegmentationNode',
  'mediapipe-gesture': 'MediaPipeGestureNode', 'mediapipe-audio': 'MediaPipeAudioNode',
  'muse-eeg': 'MuseHeadMap',
}

describe('custom-node component registry derives from definition.component', () => {
  it('CUSTOM_NODE_TYPE_IDS is exactly the historical set (no drift from the derive)', () => {
    expect([...CUSTOM_NODE_TYPE_IDS].sort()).toEqual(EXPECTED_CUSTOM_TYPES)
  })

  it('nodeTypes maps default + custom + every custom id to a defined component', () => {
    expect(nodeTypes.default).toBeTruthy()
    expect(nodeTypes.custom).toBeTruthy()
    for (const id of CUSTOM_NODE_TYPE_IDS) {
      expect(nodeTypes[id], `nodeTypes["${id}"]`).toBeTruthy()
    }
    // No stray keys beyond default/custom + the custom set.
    expect(Object.keys(nodeTypes).sort()).toEqual(['custom', 'default', ...EXPECTED_CUSTOM_TYPES].sort())
  })

  it('every custom id is backed by exactly one definition carrying a component (single source)', () => {
    for (const id of CUSTOM_NODE_TYPE_IDS) {
      const defs = allNodes.filter((d) => d.id === id)
      expect(defs.length, `definitions with id "${id}"`).toBe(1)
      expect(defs[0].component, `definition "${id}" carries a component`).toBeTruthy()
    }
  })

  it('the derived set equals the set of definitions that carry a component', () => {
    const idsWithComponent = allNodes.filter((d) => d.component).map((d) => d.id).sort()
    expect(idsWithComponent).toEqual(EXPECTED_CUSTOM_TYPES)
  })

  it('every bespoke node maps to a DISTINCT component (catches a copy-pasted / wrong .vue import)', () => {
    // The realistic authoring mutant when wiring 22 near-identical definitions is importing the wrong
    // `.vue` — most often a duplicate of a sibling. Distinct component identities kill that class.
    const comps = CUSTOM_NODE_TYPE_IDS.map((id) => nodeTypes[id])
    expect(new Set(comps).size).toBe(CUSTOM_NODE_TYPE_IDS.length)
  })

  it('each nodeTypes entry is the same object its definition declares (derive is not cross-wired)', () => {
    for (const id of CUSTOM_NODE_TYPE_IDS) {
      const def = allNodes.find((d) => d.id === id)!
      expect(nodeTypes[id]).toBe(def.component) // markRaw is idempotent → same reference
    }
  })

  it('each id resolves to its OWN .vue (SFC __name) — catches a single wrong import', () => {
    for (const id of CUSTOM_NODE_TYPE_IDS) {
      const comp = nodeTypes[id] as { __name?: string }
      expect(comp.__name, `component for "${id}"`).toBe(EXPECTED_COMPONENT_NAME[id])
    }
  })

  it('migrated-to-ui nodes carry no component and are not custom types', () => {
    for (const id of MIGRATED_TO_UI) {
      const def = allNodes.find((d) => d.id === id)
      expect(def, `definition "${id}" exists`).toBeTruthy()
      expect(def!.component, `migrated "${id}" has no component`).toBeFalsy()
      expect(CUSTOM_NODE_TYPE_IDS).not.toContain(id)
    }
  })
})
