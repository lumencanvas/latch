import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'json-stringify',
  name: 'JSON Stringify',
  version: '1.0.0',
  category: 'data',
  description: 'Convert object to JSON string',
  icon: 'braces',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'data', label: 'Object' },
  ],
  outputs: [
    { id: 'output', type: 'string', label: 'JSON String' },
  ],
  controls: [
    { id: 'pretty', type: 'toggle', label: 'Pretty Print', default: false },
  ],
  info: {
    overview: 'Converts a JavaScript object into a JSON string. Supports pretty-printed output with indentation for readability. Useful for preparing data to send over HTTP, WebSocket, or MQTT connections.',
    tips: [
      'Enable pretty print when sending output to a Monitor or Console for easier debugging.',
      'Pair with HTTP Request to serialize request bodies as JSON.',
    ],
    pairsWith: ['json-parse', 'http-request', 'websocket', 'mqtt'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input')
  const pretty = (ctx.controls.get('pretty') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  if (input === undefined) {
    outputs.set('output', '')
    return outputs
  }

  try {
    const result = pretty ? JSON.stringify(input, null, 2) : JSON.stringify(input)
    outputs.set('output', result)
  } catch {
    outputs.set('output', String(input))
  }

  return outputs
}

export default defineNode({ definition, executor })
