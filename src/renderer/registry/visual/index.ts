export { shaderNode } from './shader'
export { snapshotNode } from './snapshot'
export { webcamSnapshotNode } from './webcam-snapshot'
export { colorNode } from './color'
export { colorRampNode } from './color-ramp'
export { textureDisplayNode } from './texture-display'
export { blendNode } from './blend'
export { blurNode } from './blur'
export { colorCorrectionNode } from './color-correction'
export { displacementNode } from './displacement'
export { transform2dNode } from './transform-2d'
export { imageLoaderNode } from './image-loader'
export { videoPlayerNode } from './video-player'
export { imageFxGlitchNode } from './image-fx-glitch'
export { imageFxRgbShiftNode } from './image-fx-rgb-shift'
export { imageFxPixelateNode } from './image-fx-pixelate'
export { imageFxKaleidoscopeNode } from './image-fx-kaleidoscope'
export { imageFxScanlinesNode } from './image-fx-scanlines'
export { imageFxPosterizeNode } from './image-fx-posterize'
export { imageFxDitherNode } from './image-fx-dither'
export { imageFxChromaKeyNode } from './image-fx-chroma-key'

import { shaderNode } from './shader'
import { snapshotNode } from './snapshot'
import { webcamSnapshotNode } from './webcam-snapshot'
import { colorNode } from './color'
import { colorRampNode } from './color-ramp'
import { textureDisplayNode } from './texture-display'
import { blendNode } from './blend'
import { blurNode } from './blur'
import { colorCorrectionNode } from './color-correction'
import { displacementNode } from './displacement'
import { transform2dNode } from './transform-2d'
import { imageLoaderNode } from './image-loader'
import { videoPlayerNode } from './video-player'
import { imageFxGlitchNode } from './image-fx-glitch'
import { imageFxRgbShiftNode } from './image-fx-rgb-shift'
import { imageFxPixelateNode } from './image-fx-pixelate'
import { imageFxKaleidoscopeNode } from './image-fx-kaleidoscope'
import { imageFxScanlinesNode } from './image-fx-scanlines'
import { imageFxPosterizeNode } from './image-fx-posterize'
import { imageFxDitherNode } from './image-fx-dither'
import { imageFxChromaKeyNode } from './image-fx-chroma-key'
import type { NodeDefinition } from '../types'

export const visualNodes: NodeDefinition[] = [
  shaderNode,
  snapshotNode,
  webcamSnapshotNode,
  colorNode,
  colorRampNode,
  textureDisplayNode,
  blendNode,
  blurNode,
  colorCorrectionNode,
  displacementNode,
  transform2dNode,
  imageLoaderNode,
  videoPlayerNode,
  imageFxGlitchNode,
  imageFxRgbShiftNode,
  imageFxPixelateNode,
  imageFxKaleidoscopeNode,
  imageFxScanlinesNode,
  imageFxPosterizeNode,
  imageFxDitherNode,
  imageFxChromaKeyNode,
]
