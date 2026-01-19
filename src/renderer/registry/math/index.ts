export { addNode } from './add'
export { subtractNode } from './subtract'
export { multiplyNode } from './multiply'
export { divideNode } from './divide'
export { clampNode } from './clamp'
export { absNode } from './abs'
export { randomNode } from './random'
export { mapRangeNode } from './map-range'
export { smoothNode } from './smooth'
export { trigNode } from './trig'
export { powerNode } from './power'
export { vectorMathNode } from './vector-math'
export { moduloNode } from './modulo'

import { addNode } from './add'
import { subtractNode } from './subtract'
import { multiplyNode } from './multiply'
import { divideNode } from './divide'
import { clampNode } from './clamp'
import { absNode } from './abs'
import { randomNode } from './random'
import { mapRangeNode } from './map-range'
import { smoothNode } from './smooth'
import { trigNode } from './trig'
import { powerNode } from './power'
import { vectorMathNode } from './vector-math'
import { moduloNode } from './modulo'
import type { NodeDefinition } from '../types'

export const mathNodes: NodeDefinition[] = [
  addNode,
  subtractNode,
  multiplyNode,
  divideNode,
  clampNode,
  absNode,
  randomNode,
  mapRangeNode,
  smoothNode,
  trigNode,
  powerNode,
  vectorMathNode,
  moduloNode,
]
