export { shaderNode } from './shader'
export { webcamSnapshotNode } from './webcam-snapshot'
export { colorNode } from './color'
export { textureDisplayNode } from './texture-display'
export { blendNode } from './blend'
export { blurNode } from './blur'
export { colorCorrectionNode } from './color-correction'
export { displacementNode } from './displacement'
export { transform2dNode } from './transform-2d'
export { imageLoaderNode } from './image-loader'
export { videoPlayerNode } from './video-player'

import { shaderNode } from './shader'
import { webcamSnapshotNode } from './webcam-snapshot'
import { colorNode } from './color'
import { textureDisplayNode } from './texture-display'
import { blendNode } from './blend'
import { blurNode } from './blur'
import { colorCorrectionNode } from './color-correction'
import { displacementNode } from './displacement'
import { transform2dNode } from './transform-2d'
import { imageLoaderNode } from './image-loader'
import { videoPlayerNode } from './video-player'
import type { NodeDefinition } from '../types'

export const visualNodes: NodeDefinition[] = [
  shaderNode,
  webcamSnapshotNode,
  colorNode,
  textureDisplayNode,
  blendNode,
  blurNode,
  colorCorrectionNode,
  displacementNode,
  transform2dNode,
  imageLoaderNode,
  videoPlayerNode,
]
