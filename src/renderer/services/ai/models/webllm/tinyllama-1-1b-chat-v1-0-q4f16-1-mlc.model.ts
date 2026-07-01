import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
  name: 'TinyLlama 1.1B',
  family: 'webllm',
  task: 'text-generation',
  size: '~0.7 GB',
  load: { promptFormat: 'chat' },
})
