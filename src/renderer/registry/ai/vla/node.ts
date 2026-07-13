import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getCached, setCached, hasTriggerValue, runModelInference, convertToImageData } from '../shared'

const definition: NodeDefinition = {
  id: 'vla',
  name: 'Vision-Language-Action',
  version: '1.0.0',
  category: 'ai',
  description: 'Image + instruction → an action/answer, in-browser (SmolVLM)',
  icon: 'bot',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'instruction', type: 'string', label: 'Instruction' },
    { id: 'trigger', type: 'trigger', label: 'Run' },
  ],
  outputs: [
    { id: 'action', type: 'string', label: 'Action' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'model',
      type: 'select',
      label: 'Model',
      default: 'HuggingFaceTB/SmolVLM-256M-Instruct',
      props: {
        options: [
          { value: 'HuggingFaceTB/SmolVLM-256M-Instruct', label: 'SmolVLM 256M (~300 MB)' },
          { value: 'HuggingFaceTB/SmolVLM-500M-Instruct', label: 'SmolVLM 500M (~600 MB)' },
        ],
      },
    },
    {
      id: 'instruction',
      type: 'text',
      label: 'Instruction',
      default: 'What action should be taken next? Answer with one short command.',
    },
    { id: 'maxTokens', type: 'number', label: 'Max Tokens', default: 64, props: { min: 8, max: 256 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 120, props: { min: 1, max: 600 } },
  ],
  tags: ['vla', 'vision language', 'smolvlm', 'multimodal', 'vision', 'ai'],
  info: {
    overview:
      'Runs a vision-language model (SmolVLM) on an image plus a natural-language instruction and outputs the model’s response — an answer or a chosen action. This is the "VLM-as-policy" pattern: the model reasons over what it sees and the instruction, then emits a short action/command in text. Runs entirely in the browser (WebGPU or WASM); load the model from the AI Model Manager (Vision-Language). A true robotics VLA action head is not yet browser-runnable, so a vision-language model stands in.',
    tips: [
      'Feed it a Webcam Snapshot (or any Texture → Data) image and pulse Run; read the Action output.',
      'Phrase the Instruction to constrain the output, e.g. "Reply with exactly one of: left, right, forward, stop."',
      'Wire Action into an LLM, Switch, or expression node to drive behavior; Done pulses when a result lands.',
      'SmolVLM 256M is fastest; 500M is more capable. Raise Frame Interval on live video to limit cost.',
    ],
    pairsWith: ['webcam', 'image-captioning', 'llm', 'text-generation'],
  },
}

export const vlaExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')
  const modelId = ctx.controls.get('model') as string | undefined
  const instruction =
    (ctx.inputs.get('instruction') as string) || (ctx.controls.get('instruction') as string) || ''
  const maxTokens = Math.floor((ctx.controls.get('maxTokens') as number) ?? 64)

  // Defer the image conversion until the model is loaded (VLA models are heavy).
  const imageData = aiInference.isModelLoaded('image-text-to-text', modelId)
    ? convertToImageData(imageInput)
    : null

  // Run on an explicit trigger or every `interval` frames (VLA is expensive).
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 120
  const intervalElapsed = !lastFrame || (currentFrame - lastFrame) >= interval
  const shouldRun = !!imageData && (hasTriggerValue(trigger) || intervalElapsed)

  const { result, started, state } = runModelInference<string>(ctx, outputs, {
    task: 'image-text-to-text',
    shouldRun,
    notLoadedMessage: 'Model not loaded. Open AI Model Manager → Vision-Language (VLA) → Load.',
    infer: (m) => aiInference.visionAction(imageData as ImageData, instruction, { modelId: m, maxNewTokens: maxTokens }),
  })
  if (started) setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  outputs.set('action', result ?? '')
  // A bad/absent image (model loaded) clears the stale action — the original cleared it via
  // emit('', false). Leaving it latched could drive a policy off a frame that no longer exists.
  if (state !== 'not-loaded' && !imageData) {
    outputs.set('action', '')
    if (imageInput) {
      outputs.set('error', 'Unsupported image input. Use Webcam Snapshot or Texture to Data.')
    }
  }
  return outputs
}

export default defineNode({ definition, executor: vlaExecutor })
