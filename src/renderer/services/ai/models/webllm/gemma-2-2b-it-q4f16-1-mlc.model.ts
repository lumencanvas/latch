import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'gemma-2-2b-it-q4f16_1-MLC',
  name: 'Gemma 2 2B',
  family: 'webllm',
  task: 'text-generation',
  size: '~1.9 GB',
  load: { promptFormat: 'chat' },
})
