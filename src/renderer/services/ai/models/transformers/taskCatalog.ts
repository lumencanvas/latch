/**
 * Per-task wrapper metadata for the transformers `AI_MODELS` catalog (memo fork 1a):
 * task-level display/editorial fields + which co-located model is the default and the
 * ORDERED alternate ids. `deriveAiModels()` groups the `family:'transformers'` specs by
 * this catalog and reconstructs the per-task `ModelDefinition` shape; `defaultSize`/
 * `defaultLicense` come from the default model's own spec, so they are never restated here.
 * A glob sort can't reproduce the curated task order or alternate order — hence this list.
 */
export interface TaskCatalogEntry {
  readonly id: string
  readonly name: string
  readonly task: string
  readonly description: string
  readonly category: 'text' | 'vision' | 'audio' | 'multimodal'
  readonly supportsWebGPU: boolean
  /** Model id of the default (its size+license derive from that model's spec). */
  readonly defaultModel: string
  /** Ordered alternate model ids. */
  readonly alternates: readonly string[]
}

export const TASK_CATALOG: readonly TaskCatalogEntry[] = [
  {
    id: 'text-generation',
    name: 'Text Generation',
    task: 'text-generation',
    description: 'Generate and complete text',
    category: 'text',
    supportsWebGPU: true,
    defaultModel: 'Xenova/TinyLlama-1.1B-Chat-v1.0',
    alternates: [
      'onnx-community/Qwen2.5-0.5B-Instruct',
      'onnx-community/Qwen2.5-1.5B-Instruct',
      'onnx-community/Qwen3-0.6B-ONNX',
      'onnx-community/Qwen3-1.7B-ONNX',
      'HuggingFaceTB/SmolLM2-360M-Instruct',
      'HuggingFaceTB/SmolLM2-1.7B-Instruct',
      'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      'onnx-community/Llama-3.2-3B-Instruct-ONNX',
      'onnx-community/gemma-3-1b-it-ONNX',
      'onnx-community/gemma-3-270m-it-ONNX',
      'onnx-community/Phi-4-mini-instruct-ONNX',
      'onnx-community/Qwen3-0.6B-heretic-abliterated-uncensored-ONNX',
    ],
  },
  {
    id: 'text2text-generation',
    name: 'Text Transformation',
    task: 'text2text-generation',
    description: 'Summarize, translate, or rewrite text',
    category: 'text',
    supportsWebGPU: false,
    defaultModel: 'Xenova/flan-t5-small',
    alternates: [
      'Xenova/flan-t5-base',
      'Xenova/t5-small',
    ],
  },
  {
    id: 'image-classification',
    name: 'Image Classification',
    task: 'image-classification',
    description: 'Classify images into categories',
    category: 'vision',
    supportsWebGPU: true,
    defaultModel: 'Xenova/vit-base-patch16-224',
    alternates: [
      'Xenova/resnet-50',
      'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
    ],
  },
  {
    id: 'object-detection',
    name: 'Object Detection',
    task: 'object-detection',
    description: 'Detect and locate objects in images',
    category: 'vision',
    supportsWebGPU: true,
    defaultModel: 'Xenova/detr-resnet-50',
    alternates: [
      'Xenova/yolos-tiny',
    ],
  },
  {
    id: 'automatic-speech-recognition',
    name: 'Speech Recognition',
    task: 'automatic-speech-recognition',
    description: 'Transcribe audio to text',
    category: 'audio',
    supportsWebGPU: true,
    defaultModel: 'Xenova/whisper-tiny.en',
    alternates: [
      'onnx-community/whisper-base.en',
      'onnx-community/whisper-small.en',
    ],
  },
  {
    id: 'sentiment-analysis',
    name: 'Sentiment Analysis',
    task: 'sentiment-analysis',
    description: 'Analyze text sentiment and emotion',
    category: 'text',
    supportsWebGPU: false,
    defaultModel: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    alternates: [
      'Xenova/bert-base-multilingual-uncased-sentiment',
    ],
  },
  {
    id: 'feature-extraction',
    name: 'Text Embeddings',
    task: 'feature-extraction',
    description: 'Convert text to vector embeddings',
    category: 'text',
    supportsWebGPU: false,
    defaultModel: 'Xenova/all-MiniLM-L6-v2',
    alternates: [
      'Xenova/bge-small-en-v1.5',
      'Xenova/gte-small',
      'nomic-ai/nomic-embed-text-v1.5',
    ],
  },
  {
    id: 'image-to-text',
    name: 'Image Captioning',
    task: 'image-to-text',
    description: 'Generate captions for images',
    category: 'multimodal',
    supportsWebGPU: true,
    defaultModel: 'Xenova/blip-image-captioning-base',
    alternates: [
      'Xenova/blip-image-captioning-large',
      'Xenova/trocr-base-handwritten',
    ],
  },
  {
    id: 'vision-language',
    name: 'Vision-Language (VLA)',
    task: 'image-text-to-text',
    description: 'Image + instruction → an answer or action (SmolVLM, vision-language-action style)',
    category: 'multimodal',
    supportsWebGPU: true,
    defaultModel: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    alternates: [
      'HuggingFaceTB/SmolVLM-500M-Instruct',
    ],
  },
]
