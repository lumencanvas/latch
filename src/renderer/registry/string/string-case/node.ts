import { defineNode } from '@/engine/defineNode'
import { toStr } from '../strHelpers'
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

/**
 * Split into words on case boundaries ("helloWorld", "HTTPServer"), digits→letters, and any
 * run of non-alphanumerics. Unicode-aware. The old per-mode regexes lowercased FIRST (so an
 * existing camelCase input lost its boundaries: "helloWorld" → "helloworld"), capitalised a
 * leading word after leading spaces ("  foo bar" → "FooBar"), and left trailing separators
 * ("foo bar " → "foo_bar_").
 */
function words(str: string): string[] {
  return str
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function toCamelCase(str: string): string {
  return words(str)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
}

function toSnakeCase(str: string): string {
  return words(str).map((w) => w.toLowerCase()).join('_')
}

function toKebabCase(str: string): string {
  return words(str).map((w) => w.toLowerCase()).join('-')
}

/** Capitalise the first letter of each whitespace-separated word ("it's" → "It's", not "It'S"). */
function toTitleCase(str: string): string {
  return str.replace(/(^|\s)(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase())
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = toStr(ctx.inputs.get('input'))
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
