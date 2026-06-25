export { addNode } from './add'
export { subtractNode } from './subtract'
export { multiplyNode } from './multiply'
export { divideNode } from './divide'
export { clampNode } from './clamp'
export { absNode } from './abs'
export { randomNode } from './random'
export { noiseNode } from './noise'
export { easingNode } from './easing'
export { springNode } from './spring'
export { mapRangeNode } from './map-range'
export { smoothNode } from './smooth'
export { trigNode } from './trig'
export { powerNode } from './power'
export { vectorMathNode } from './vector-math'
export { moduloNode } from './modulo'
// New advanced math nodes
export { lerpNode } from './lerp'
export { stepNode } from './step'
export { smoothstepNode } from './smoothstep'
export { remapNode } from './remap'
export { quantizeNode } from './quantize'
export { wrapNode } from './wrap'
// Signal-processing math nodes
export { slewLimiterNode } from './slew-limiter'
export { derivativeNode } from './derivative'
export { integralNode } from './integral'
export { tweenToTargetNode } from './tween-to-target'

import { addNode } from './add'
import { subtractNode } from './subtract'
import { multiplyNode } from './multiply'
import { divideNode } from './divide'
import { clampNode } from './clamp'
import { absNode } from './abs'
import { randomNode } from './random'
import { noiseNode } from './noise'
import { easingNode } from './easing'
import { springNode } from './spring'
import { mapRangeNode } from './map-range'
import { smoothNode } from './smooth'
import { trigNode } from './trig'
import { powerNode } from './power'
import { vectorMathNode } from './vector-math'
import { moduloNode } from './modulo'
// New advanced math nodes
import { lerpNode } from './lerp'
import { stepNode } from './step'
import { smoothstepNode } from './smoothstep'
import { remapNode } from './remap'
import { quantizeNode } from './quantize'
import { wrapNode } from './wrap'
import { slewLimiterNode } from './slew-limiter'
import { derivativeNode } from './derivative'
import { integralNode } from './integral'
import { tweenToTargetNode } from './tween-to-target'
import type { NodeDefinition } from '../types'

export const mathNodes: NodeDefinition[] = [
  addNode,
  subtractNode,
  multiplyNode,
  divideNode,
  clampNode,
  absNode,
  randomNode,
  noiseNode,
  easingNode,
  springNode,
  mapRangeNode,
  smoothNode,
  trigNode,
  powerNode,
  vectorMathNode,
  moduloNode,
  // New advanced math nodes
  lerpNode,
  stepNode,
  smoothstepNode,
  remapNode,
  quantizeNode,
  wrapNode,
  slewLimiterNode,
  derivativeNode,
  integralNode,
  tweenToTargetNode,
]
