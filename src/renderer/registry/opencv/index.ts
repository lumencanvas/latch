export { cvGrayscaleNode } from './cv-grayscale'
export { cvCannyNode } from './cv-canny'
export { cvThresholdNode } from './cv-threshold'
export { cvBlurNode } from './cv-blur'
export { cvMorphologyNode } from './cv-morphology'
export { cvContoursNode } from './cv-contours'

import { cvGrayscaleNode } from './cv-grayscale'
import { cvCannyNode } from './cv-canny'
import { cvThresholdNode } from './cv-threshold'
import { cvBlurNode } from './cv-blur'
import { cvMorphologyNode } from './cv-morphology'
import { cvContoursNode } from './cv-contours'
import type { NodeDefinition } from '../types'

export const opencvNodes: NodeDefinition[] = [
  cvGrayscaleNode,
  cvCannyNode,
  cvThresholdNode,
  cvBlurNode,
  cvMorphologyNode,
  cvContoursNode,
]
