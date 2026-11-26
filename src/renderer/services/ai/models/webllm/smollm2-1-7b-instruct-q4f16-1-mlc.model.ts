import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  name: 'SmolLM2 1.7B',
  family: 'webllm',
  task: 'text-generation',
  size: '~1.8 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
