import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-case',
  name: 'String Case',
  version: '1.0.0',
  category: 'string',
  description: 'Convert string case',
  icon: 'case-upper',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Result' },
  ],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'UPPER',
      props: {
        options: ['UPPER', 'lower', 'Title', 'camelCase', 'snake_case', 'kebab-case'],
      },
    },
  ],
  info: {
    overview: 'Converts a string between different casing conventions. Supports uppercase, lowercase, title case, camelCase, snake_case, and kebab-case. Useful for formatting identifiers, labels, or display text.',
    tips: [
      'Use snake_case or kebab-case modes to normalize user input into valid identifiers.',
      'Chain with String Template to format case-converted values into larger strings.',
    ],
    pairsWith: ['string-template', 'string-concat', 'string-replace', 'string-trim'],
  },
}

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
}

function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase())
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const mode = (ctx.controls.get('mode') as string) ?? 'UPPER'

  let result: string

  switch (mode) {
    case 'UPPER':
      result = input.toUpperCase()
      break
    case 'lower':
      result = input.toLowerCase()
      break
    case 'Title':
      result = toTitleCase(input)
      break
    case 'camelCase':
      result = toCamelCase(input)
      break
    case 'snake_case':
      result = toSnakeCase(input)
      break
    case 'kebab-case':
      result = toKebabCase(input)
      break
    default:
      result = input
  }

  return new Map([['result', result]])
}

export default defineNode({ definition, executor })
