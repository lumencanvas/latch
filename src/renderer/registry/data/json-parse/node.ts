import { defineNode } from '@/engine/defineNode'
import { defineNodeState } from '@/engine/nodeState'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const parseCache = defineNodeState<{ input: unknown; path: string; outputs: Map<string, unknown> }>({ label: 'json-parse' })

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
    // 'any' (was 'data'): a Path can extract a number/boolean/array, which a 'data' port
    // couldn't be wired into. An 'any' source connects to every target type.
    { id: 'output', type: 'any', label: 'Value' },
    { id: 'error', type: 'string', label: 'Error' },
    { id: 'found', type: 'boolean', label: 'Found' },
  ],
  controls: [
    { id: 'path', type: 'text', label: 'Path', default: '', props: { placeholder: 'e.g., data.items[0]' } },
  ],
  info: {
    overview: 'Parses a JSON string into a structured object. Optionally extracts a nested value using a dot-notation path. If parsing fails, the error output provides the reason.',
    tips: [
      'Use the path field to drill into deeply nested responses without needing separate Object Get nodes.',
      'Connect the error output to a Monitor node to debug malformed JSON from external sources.',
      'Found is 0 when the Path does not resolve, so a missing key is distinguishable from a null value.',
    ],
    pairsWith: ['json-stringify', 'object-get', 'http-request', 'monitor'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input') as string | undefined
  const path = (ctx.controls.get('path') as string) ?? ''

  // Same input + path as last frame → reuse (JSON.parse of a large payload every frame is
  // the dominant cost of this node). A copy of the cached Map keeps outputs independent.
  const prev = parseCache.get(ctx.nodeId)
  if (prev && prev.input === input && prev.path === path) return new Map(prev.outputs)
  const outputs = compute(input, path)
  parseCache.set(ctx.nodeId, { input, path, outputs })
  return new Map(outputs)
}

function compute(input: unknown, path: string): Map<string, unknown> {
  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('output', null)
    outputs.set('error', null)
    outputs.set('found', 0)
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
      let found = true
      for (const part of parts) {
        // Own properties only (an inherited `constructor`/`toString` is not "in" the JSON).
        if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)) {
          current = (current as Record<string, unknown>)[part]
        } else {
          current = undefined
          found = false
          break
        }
      }
      outputs.set('output', current)
      outputs.set('found', found ? 1 : 0)
    } else {
      outputs.set('output', parsed)
      outputs.set('found', 1)
    }
    outputs.set('error', null)
  } catch (error) {
    outputs.set('output', null)
    outputs.set('error', error instanceof Error ? error.message : 'Parse error')
    outputs.set('found', 0)
  }

  return outputs
}

export default defineNode({ definition, executor })
