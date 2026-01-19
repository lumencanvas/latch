/**
 * Node Component Registry
 *
 * Maps node type IDs to their Vue components.
 * Most nodes use BaseNode, but some have custom UI components.
 */

import { markRaw } from 'vue'
import BaseNode from '@/components/nodes/BaseNode.vue'

// Import custom UI components from their node folders
import { TriggerNode } from './inputs/trigger'
import { XYPadNode } from './inputs/xy-pad'
import { TextboxNode } from './inputs/textbox'
import { MonitorNode } from './debug/monitor'
import { OscilloscopeNode } from './debug/oscilloscope'
import { GraphNode } from './debug/graph'
import { EqualizerNode } from './debug/equalizer'
import { MainOutputNode } from './outputs/main-output'
import { StepSequencerNode } from './timing/step-sequencer'

/**
 * Node type to Vue component mapping.
 * Used by Vue Flow to render nodes.
 */
export const nodeTypes = {
  // Default renderer for all simple nodes
  default: markRaw(BaseNode),
  custom: markRaw(BaseNode),

  // Custom UI nodes - inputs
  trigger: markRaw(TriggerNode),
  'xy-pad': markRaw(XYPadNode),
  textbox: markRaw(TextboxNode),

  // Custom UI nodes - debug
  monitor: markRaw(MonitorNode),
  oscilloscope: markRaw(OscilloscopeNode),
  graph: markRaw(GraphNode),
  equalizer: markRaw(EqualizerNode),

  // Custom UI nodes - outputs
  'main-output': markRaw(MainOutputNode),

  // Custom UI nodes - timing
  'step-sequencer': markRaw(StepSequencerNode),
}
