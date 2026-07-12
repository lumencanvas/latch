import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-template',
  name: 'String Template',
  version: '1.0.0',
  category: 'string',
  description: 'String interpolation with placeholders',
  icon: 'file-code',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
    { id: 'c', type: 'any', label: 'C' },
    { id: 'd', type: 'any', label: 'D' },
  ],
  outputs: [{ id: 'result', type: 'string', label: 'Result' }],
  controls: [
    {
      id: 'template',
      type: 'text',
      label: 'Template',
      default: 'Hello {a}!',
      props: { placeholder: 'Hello {a}, you have {b} messages' },
    },
  ],
  tags: ['template', 'interpolation', 'format', 'placeholder'],
  info: {
    overview: 'Builds a string by inserting input values into a template with {a}, {b}, {c}, and {d} placeholders. Accepts any input type and converts values to strings automatically. Good for composing messages, prompts, or formatted output.',
    tips: [
      'Use this to build prompts for the Text Generate node by inserting dynamic values into a base template.',
      'Placeholders that have no connected input are replaced with an empty string.',
    ],
    pairsWith: ['text-generation', 'string-concat', 'string-case', 'string-replace'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = ctx.inputs.get('a')
  const b = ctx.inputs.get('b')
  const c = ctx.inputs.get('c')
  const d = ctx.inputs.get('d')
  const template = (ctx.controls.get('template') as string) ?? ''

  // Replace placeholders {a}, {b}, {c}, {d} with values
  const result = template
    .replace(/\{a\}/g, String(a ?? ''))
    .replace(/\{b\}/g, String(b ?? ''))
    .replace(/\{c\}/g, String(c ?? ''))
    .replace(/\{d\}/g, String(d ?? ''))

  return new Map([['result', result]])
}

export default defineNode({ definition, executor })
