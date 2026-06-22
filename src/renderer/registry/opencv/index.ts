export { cvGrayscaleNode } from './cv-grayscale'
export { cvCannyNode } from './cv-canny'
export { cvThresholdNode } from './cv-threshold'
export { cvBlurNode } from './cv-blur'
export { cvMorphologyNode } from './cv-morphology'
export { cvContoursNode } from './cv-contours'
export { cvCornersNode } from './cv-corners'
export { cvOpticalFlowNode } from './cv-optical-flow'

import { cvGrayscaleNode } from './cv-grayscale'
import { cvCannyNode } from './cv-canny'
import { cvThresholdNode } from './cv-threshold'
import { cvBlurNode } from './cv-blur'
import { cvMorphologyNode } from './cv-morphology'
import { cvContoursNode } from './cv-contours'
import { cvCornersNode } from './cv-corners'
import { cvOpticalFlowNode } from './cv-optical-flow'
import type { NodeDefinition } from '../types'

export const opencvNodes: NodeDefinition[] = [
  cvGrayscaleNode,
  cvCannyNode,
  cvThresholdNode,
  cvBlurNode,
  cvMorphologyNode,
  cvContoursNode,
  cvCornersNode,
  cvOpticalFlowNode,
]
