// Simple input nodes
export { constantNode } from './constant'
export { sliderNode } from './slider'
export { audioInputNode } from './audio-input'

// Custom UI input nodes
export { triggerNode } from './trigger'
export { xyPadNode } from './xy-pad'
export { textboxNode } from './textbox'
export { knobNode } from './knob'
export { keyboardNode } from './keyboard'

// Controller input nodes
export { gamepadNode } from './gamepad'
export { gamepadVisualNode } from './gamepad-visual'

// Re-categorized input nodes
export { midiInputNode } from '../connectivity/midi-input'
export { webcamNode } from '../visual/webcam'

import { constantNode } from './constant'
import { sliderNode } from './slider'
import { audioInputNode } from './audio-input'
import { triggerNode } from './trigger'
import { xyPadNode } from './xy-pad'
import { textboxNode } from './textbox'
import { knobNode } from './knob'
import { keyboardNode } from './keyboard'
import { gamepadNode } from './gamepad'
import { gamepadVisualNode } from './gamepad-visual'
import { midiInputNode } from '../connectivity/midi-input'
import { webcamNode } from '../visual/webcam'
import type { NodeDefinition } from '../types'

export const inputNodes: NodeDefinition[] = [
  constantNode,
  sliderNode,
  knobNode,
  audioInputNode,
  triggerNode,
  xyPadNode,
  textboxNode,
  keyboardNode,
  gamepadNode,
  gamepadVisualNode,
  midiInputNode,
  webcamNode,
]
