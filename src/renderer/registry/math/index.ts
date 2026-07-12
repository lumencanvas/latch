// Migrated to co-located registry/math/<node>/node.ts (Phase 6): add / subtract /
// multiply / divide / atan2 / min / max, plus abs / clamp / map-range / modulo / power /
// trig / vector-math / lerp / step / smoothstep / remap / quantize / wrap.
export { randomNode } from './random'
export { noiseNode } from './noise'
export { easingNode } from './easing'
export { springNode } from './spring'
export { smoothNode } from './smooth'
// Signal-processing math nodes
export { slewLimiterNode } from './slew-limiter'
export { derivativeNode } from './derivative'
export { integralNode } from './integral'
export { tweenToTargetNode } from './tween-to-target'

import { randomNode } from './random'
import { noiseNode } from './noise'
import { easingNode } from './easing'
import { springNode } from './spring'
import { smoothNode } from './smooth'
import { slewLimiterNode } from './slew-limiter'
import { derivativeNode } from './derivative'
import { integralNode } from './integral'
import { tweenToTargetNode } from './tween-to-target'
import type { NodeDefinition } from '../types'

export const mathNodes: NodeDefinition[] = [
  randomNode,
  noiseNode,
  easingNode,
  springNode,
  smoothNode,
  slewLimiterNode,
  derivativeNode,
  integralNode,
  tweenToTargetNode,
]
