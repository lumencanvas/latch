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
import { KnobNode } from './inputs/_knob'
import { KeyboardNode } from './inputs/keyboard'
import { MonitorNode } from './debug/monitor'
import { OscilloscopeNode } from './debug/oscilloscope'
import { GraphNode } from './debug/graph'
import { EqualizerNode } from './debug/equalizer'
import { MainOutputNode } from './outputs/main-output'
import { StepSequencerNode } from './timing/step-sequencer'
import { EnvelopeVisualNode } from './audio/_envelope-visual'
import { ParametricEqNode } from './audio/_parametric-eq'
import { WavetableNode } from './audio/_wavetable'
import { SynthNode } from './audio/_synth'
import { MediaPipeHandNode } from './ai/mediapipe-hand'
import { MediaPipeFaceNode } from './ai/mediapipe-face'
import { MediaPipePoseNode } from './ai/mediapipe-pose'
import { MediaPipeObjectNode } from './ai/mediapipe-object'
import { MediaPipeSegmentationNode } from './ai/mediapipe-segmentation'
import { MediaPipeGestureNode } from './ai/mediapipe-gesture'
import { MediaPipeAudioNode } from './ai/mediapipe-audio'
import { FunctionNode } from './code/_function'
import { DispatchNode } from './logic/dispatch'

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
  knob: markRaw(KnobNode),
  keyboard: markRaw(KeyboardNode),

  // Custom UI nodes - debug
  monitor: markRaw(MonitorNode),
  oscilloscope: markRaw(OscilloscopeNode),
  graph: markRaw(GraphNode),
  equalizer: markRaw(EqualizerNode),

  // Custom UI nodes - outputs
  'main-output': markRaw(MainOutputNode),

  // Custom UI nodes - timing
  'step-sequencer': markRaw(StepSequencerNode),

  // Custom UI nodes - audio
  'envelope-visual': markRaw(EnvelopeVisualNode),
  'parametric-eq': markRaw(ParametricEqNode),
  wavetable: markRaw(WavetableNode),
  synth: markRaw(SynthNode),

  // Custom UI nodes - AI (MediaPipe)
  'mediapipe-hand': markRaw(MediaPipeHandNode),
  'mediapipe-face': markRaw(MediaPipeFaceNode),
  'mediapipe-pose': markRaw(MediaPipePoseNode),
  'mediapipe-object': markRaw(MediaPipeObjectNode),
  'mediapipe-segmentation': markRaw(MediaPipeSegmentationNode),
  'mediapipe-gesture': markRaw(MediaPipeGestureNode),
  'mediapipe-audio': markRaw(MediaPipeAudioNode),

  // Custom UI nodes - Code
  function: markRaw(FunctionNode),

  // Custom UI nodes - Logic
  dispatch: markRaw(DispatchNode),
}
