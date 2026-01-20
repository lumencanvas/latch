export { oscillatorNode } from './oscillator'
export { audioOutputNode } from './audio-output'
export { audioAnalyzerNode } from './audio-analyzer'
export { gainNode } from './gain'
export { filterNode } from './filter'
export { audioDelayNode } from './audio-delay'
export { beatDetectNode } from './beat-detect'
export { audioPlayerNode } from './audio-player'
export { envelopeNode } from './envelope'
export { reverbNode } from './reverb'
export { svfFilterNode } from './svf-filter'
export { pitchDetectNode } from './pitch-detect'

// Custom UI audio nodes
export { envelopeVisualNode, EnvelopeVisualNode } from './envelope-visual'
export { parametricEqNode, ParametricEqNode } from './parametric-eq'
export { wavetableNode, WavetableNode } from './wavetable'
export { synthNode, SynthNode } from './_synth'

import { oscillatorNode } from './oscillator'
import { audioOutputNode } from './audio-output'
import { audioAnalyzerNode } from './audio-analyzer'
import { gainNode } from './gain'
import { filterNode } from './filter'
import { audioDelayNode } from './audio-delay'
import { beatDetectNode } from './beat-detect'
import { audioPlayerNode } from './audio-player'
import { envelopeNode } from './envelope'
import { reverbNode } from './reverb'
import { svfFilterNode } from './svf-filter'
import { pitchDetectNode } from './pitch-detect'
import { envelopeVisualNode } from './envelope-visual'
import { parametricEqNode } from './parametric-eq'
import { wavetableNode } from './wavetable'
import { synthNode } from './_synth'
import type { NodeDefinition } from '../types'

export const audioNodes: NodeDefinition[] = [
  oscillatorNode,
  audioOutputNode,
  audioAnalyzerNode,
  gainNode,
  filterNode,
  audioDelayNode,
  beatDetectNode,
  audioPlayerNode,
  envelopeNode,
  reverbNode,
  svfFilterNode,
  pitchDetectNode,
  envelopeVisualNode,
  parametricEqNode,
  wavetableNode,
  synthNode,
]
