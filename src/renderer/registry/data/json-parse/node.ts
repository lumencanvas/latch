import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

// Split a JSON path on dots and brackets (e.g. `a.b[0]` → a, b, 0).
const JSON_PATH_SPLIT_REGEX = /[.[\]]/

const definition: NodeDefinition = {
  id: 'json-parse',
  name: 'JSON Parse',
  version: '1.0.0',
  category: 'data',
  description: 'Parse JSON string to object',
  icon: 'braces',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'JSON String' },
  ],
  outputs: [
    { id: 'output', type: 'data', label: 'Object' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'path', type: 'text', label: 'Path', default: '', props: { placeholder: 'e.g., data.items[0]' } },
  ],
  info: {
    overview: 'Parses a JSON string into a structured object. Optionally extracts a nested value using a dot-notation path. If parsing fails, the error output provides the reason.',
    tips: [
      'Use the path field to drill into deeply nested responses without needing separate Object Get nodes.',
      'Connect the error output to a Monitor node to debug malformed JSON from external sources.',
    ],
    pairsWith: ['json-stringify', 'object-get', 'http-request', 'monitor'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input') as string | undefined
  const path = (ctx.controls.get('path') as string) ?? ''

  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('output', null)
    outputs.set('error', null)
    return outputs
  }

  try {
    let parsed: unknown
    if (typeof input === 'string') {
      parsed = JSON.parse(input)
    } else {
      parsed = input
    }

    // Navigate path if provided (e.g., "data.items[0].name")
    if (path.trim()) {
      const parts = path.split(JSON_PATH_SPLIT_REGEX).filter(Boolean)
      let current: unknown = parsed
      for (const part of parts) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[part]
        } else {
          current = undefined
          break
        }
      }
      outputs.set('output', current)
    } else {
      outputs.set('output', parsed)
    }
    outputs.set('error', null)
  } catch (error) {
    outputs.set('output', null)
    outputs.set('error', error instanceof Error ? error.message : 'Parse error')
  }

  return outputs
}

export default defineNode({ definition, executor })
