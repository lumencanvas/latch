import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  name: 'Llama 3.2 1B',
  family: 'webllm',
  task: 'text-generation',
  size: '~0.9 GB',
  load: { promptFormat: 'chat' },
})
