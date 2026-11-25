import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  name: 'SmolLM2 360M',
  family: 'webllm',
  task: 'text-generation',
  size: '~0.4 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
