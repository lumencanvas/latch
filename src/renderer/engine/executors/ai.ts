/**
 * AI executors — Workstream B re-export shim.
 *
 * The AI executor bodies are co-located in registry/ai/<id>/node.ts (each still a named export) and
 * the shared state/helpers/lifecycle live in registry/ai/shared.ts. This module re-exports the executor
 * consts so the existing executor unit tests keep importing them from '@/engine/executors/ai' unchanged.
 */
export { depthEstimationExecutor } from '@/registry/ai/depth-estimation/node'
export { featureExtractionExecutor } from '@/registry/ai/feature-extraction/node'
export { imageCaptioningExecutor } from '@/registry/ai/image-captioning/node'
export { imageClassificationExecutor } from '@/registry/ai/image-classification/node'
export { mediapipeAudioExecutor } from '@/registry/ai/mediapipe-audio/node'
export { mediapipeFaceExecutor } from '@/registry/ai/mediapipe-face/node'
export { mediapipeGestureExecutor } from '@/registry/ai/mediapipe-gesture/node'
export { mediapipeHandExecutor } from '@/registry/ai/mediapipe-hand/node'
export { mediapipeObjectExecutor } from '@/registry/ai/mediapipe-object/node'
export { mediapipePoseExecutor } from '@/registry/ai/mediapipe-pose/node'
export { mediapipeSegmentationExecutor } from '@/registry/ai/mediapipe-segmentation/node'
export { objectDetectionExecutor } from '@/registry/ai/object-detection/node'
export { objectDetectionLiveExecutor } from '@/registry/ai/object-detection-live/node'
export { objectDetectionYoloExecutor } from '@/registry/ai/object-detection-yolo/node'
export { sentimentAnalysisExecutor } from '@/registry/ai/sentiment-analysis/node'
export { speechRecognitionExecutor } from '@/registry/ai/speech-recognition/node'
export { textGenerationExecutor } from '@/registry/ai/text-generation/node'
export { textToSpeechExecutor } from '@/registry/ai/text-to-speech/node'
export { textTransformationExecutor } from '@/registry/ai/text-transformation/node'
export { vlaExecutor } from '@/registry/ai/vla/node'
