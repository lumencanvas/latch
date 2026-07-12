import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-pad',
  name: 'String Pad',
  version: '1.0.0',
  category: 'string',
  description: 'Pad string to target length',
  icon: 'space',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'input', type: 'string', label: 'Input' }],
  outputs: [{ id: 'result', type: 'string', label: 'Result' }],
  controls: [
    { id: 'length', type: 'number', label: 'Length', default: 10 },
    { id: 'char', type: 'text', label: 'Char', default: ' ' },
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'start',
      props: { options: ['start', 'end'] },
    },
  ],
  tags: ['pad', 'fill', 'align', 'format'],
  info: {
    overview: 'Pads a string to a target length by adding characters to the start or end. Commonly used to zero-pad numbers, align columns, or produce fixed-width output strings.',
    tips: [
      'Set the char to "0" and mode to "start" to zero-pad numeric strings.',
      'Use this after converting a number to a string to ensure consistent formatting.',
    ],
    pairsWith: ['string-concat', 'string-length', 'string-template', 'string-case'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const length = (ctx.controls.get('length') as number) ?? 10
  const char = (ctx.controls.get('char') as string) ?? ' '
  const mode = (ctx.controls.get('mode') as string) ?? 'start'

  const padChar = char || ' ' // Ensure at least space

  let result: string

  if (mode === 'start') {
    result = input.padStart(length, padChar)
  } else {
    result = input.padEnd(length, padChar)
  }

  return new Map([['result', result]])
}

export default defineNode({ definition, executor })
