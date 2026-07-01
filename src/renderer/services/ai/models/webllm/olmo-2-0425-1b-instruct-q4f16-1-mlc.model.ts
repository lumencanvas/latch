import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'OLMo-2-0425-1B-Instruct-q4f16_1-MLC',
  name: 'OLMo 2 1B',
  family: 'webllm',
  task: 'text-generation',
  size: '~1.0 GB',
  load: { promptFormat: 'chat' },
})
