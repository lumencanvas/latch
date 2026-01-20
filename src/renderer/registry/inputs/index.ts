// Simple input nodes
export { constantNode } from './constant'
export { sliderNode } from './slider'
export { audioInputNode } from './audio-input'

// Custom UI input nodes
export { triggerNode, TriggerNode } from './trigger'
export { xyPadNode, XYPadNode } from './xy-pad'
export { textboxNode, TextboxNode } from './textbox'
export { knobNode, KnobNode } from './knob'
export { keyboardNode, KeyboardNode } from './keyboard'

import { constantNode } from './constant'
import { sliderNode } from './slider'
import { audioInputNode } from './audio-input'
import { triggerNode } from './trigger'
import { xyPadNode } from './xy-pad'
import { textboxNode } from './textbox'
import { knobNode } from './knob'
import { keyboardNode } from './keyboard'
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
]
