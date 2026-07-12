import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { textboxExecutor } from '@/engine/executors/input'

import { markRaw } from 'vue'
import TextboxNode from './TextboxNode.vue'

const definition: NodeDefinition = {
  id: 'textbox',
  component: markRaw(TextboxNode),
  name: 'Textbox',
  version: '1.0.0',
  category: 'inputs',
  description: 'Resizable text input that outputs a string',
  icon: 'type',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [{ id: 'text', type: 'string', label: 'Text' }],
  controls: [
    { id: 'text', type: 'text', label: 'Text', default: '' },
    { id: 'height', type: 'number', label: 'Height', default: 100 },
  ],
  tags: ['textbox', 'text', 'string', 'input', 'label', 'type'],
  info: {
    overview: 'A resizable text input area that outputs its contents as a string. The optional trigger input lets you control when the text value updates downstream. The height control adjusts the visible editing area without affecting output.',
    tips: [
      'Use the trigger input to send text only on demand rather than on every keystroke.',
      'Pair with a template node to insert the text output into a larger formatted string.',
      'Set a tall height for multi-line content like JSON payloads or code snippets.',
    ],
    pairsWith: ['template', 'json-parse', 'console', 'string-concat'],
  },
}

export default defineNode({ definition, executor: textboxExecutor })
