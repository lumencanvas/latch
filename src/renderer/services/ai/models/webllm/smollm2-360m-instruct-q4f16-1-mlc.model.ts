import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  name: 'SmolLM2 360M',
  family: 'webllm',
  task: 'text-generation',
  size: '~0.4 GB',
  load: { promptFormat: 'chat' },
})
