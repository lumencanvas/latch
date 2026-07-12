import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { jsonStringifyExecutor } from '@/engine/executors/connectivity'

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

export default defineNode({ definition, executor: jsonStringifyExecutor })
