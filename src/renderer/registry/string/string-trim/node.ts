import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-trim',
  name: 'String Trim',
  version: '1.0.0',
  category: 'string',
  description: 'Remove whitespace from string',
  icon: 'scissors',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'input', type: 'string', label: 'Input' }],
  outputs: [{ id: 'result', type: 'string', label: 'Result' }],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'both',
      props: { options: ['both', 'start', 'end'] },
    },
  ],
  tags: ['trim', 'whitespace', 'clean', 'strip'],
  info: {
    overview: 'Removes leading and trailing whitespace from a string. Can trim from both ends, only the start, or only the end. Helpful for cleaning up user input or text extracted from other sources.',
    tips: [
      'Place this after Speech to Text or any text input to strip unwanted whitespace before further processing.',
      'Use the "start" or "end" mode when you only need to clean one side of the string.',
    ],
    pairsWith: ['string-replace', 'string-concat', 'string-case', 'speech-recognition'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const mode = (ctx.controls.get('mode') as string) ?? 'both'

  let result: string

  switch (mode) {
    case 'both':
      result = input.trim()
      break
    case 'start':
      result = input.trimStart()
      break
    case 'end':
      result = input.trimEnd()
      break
    default:
      result = input.trim()
  }

  return new Map([['result', result]])
}

export default defineNode({ definition, executor })
