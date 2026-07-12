import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { expressionExecutor } from '@/engine/executors/code'

const definition: NodeDefinition = {
  id: 'expression',
  name: 'Expression',
  version: '1.0.0',
  category: 'code',
  description: 'Inline math expression evaluator',
  icon: 'calculator',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 'c', type: 'number', label: 'C' },
    { id: 'd', type: 'number', label: 'D' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'expression', type: 'text', label: 'Expression', default: 'a + b', props: { placeholder: 'e.g., sin(t) * a + b' } },
  ],
  info: {
    overview: 'Evaluates a single-line math expression using up to four numeric inputs. Standard JavaScript Math functions like sin, cos, abs, and floor are available without the Math prefix. The built-in variable t provides elapsed time in seconds.',
    tips: [
      'Use t for time-based expressions without needing an external oscillator.',
      'Chain multiple expression nodes for staged calculations rather than writing one complicated expression.',
      'The error output tells you about syntax problems at runtime, so connect it to a console during setup.',
    ],
    pairsWith: ['constant', 'slider', 'oscillator', 'map-range'],
  },
}

export default defineNode({ definition, executor: expressionExecutor })
