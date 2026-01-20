export { textGenerationNode } from './text-generation'
export { imageClassificationNode } from './image-classification'
export { sentimentAnalysisNode } from './sentiment-analysis'
export { imageCaptioningNode } from './image-captioning'
export { featureExtractionNode } from './feature-extraction'
export { objectDetectionNode } from './object-detection'
export { speechRecognitionNode } from './speech-recognition'
export { textTransformationNode } from './text-transformation'

// MediaPipe nodes with custom UI components
export { mediapipeHandNode, MediaPipeHandNode } from './mediapipe-hand'
export { mediapipeFaceNode, MediaPipeFaceNode } from './mediapipe-face'
export { mediapipePoseNode, MediaPipePoseNode } from './mediapipe-pose'
export { mediapipeObjectNode, MediaPipeObjectNode } from './mediapipe-object'
export { mediapipeSegmentationNode, MediaPipeSegmentationNode } from './mediapipe-segmentation'
export { mediapipeGestureNode, MediaPipeGestureNode } from './mediapipe-gesture'
export { mediapipeAudioNode, MediaPipeAudioNode } from './mediapipe-audio'

import { textGenerationNode } from './text-generation'
import { imageClassificationNode } from './image-classification'
import { sentimentAnalysisNode } from './sentiment-analysis'
import { imageCaptioningNode } from './image-captioning'
import { featureExtractionNode } from './feature-extraction'
import { objectDetectionNode } from './object-detection'
import { speechRecognitionNode } from './speech-recognition'
import { textTransformationNode } from './text-transformation'
import { mediapipeHandNode } from './mediapipe-hand'
import { mediapipeFaceNode } from './mediapipe-face'
import { mediapipePoseNode } from './mediapipe-pose'
import { mediapipeObjectNode } from './mediapipe-object'
import { mediapipeSegmentationNode } from './mediapipe-segmentation'
import { mediapipeGestureNode } from './mediapipe-gesture'
import { mediapipeAudioNode } from './mediapipe-audio'
import type { NodeDefinition } from '../types'

export const aiNodes: NodeDefinition[] = [
  textGenerationNode,
  imageClassificationNode,
  sentimentAnalysisNode,
  imageCaptioningNode,
  featureExtractionNode,
  objectDetectionNode,
  speechRecognitionNode,
  textTransformationNode,
  mediapipeHandNode,
  mediapipeFaceNode,
  mediapipePoseNode,
  mediapipeObjectNode,
  mediapipeSegmentationNode,
  mediapipeGestureNode,
  mediapipeAudioNode,
]
