import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { vlaExecutor } from '@/engine/executors/ai'

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

export default defineNode({ definition, executor: vlaExecutor })
