import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Phi-4-mini-instruct-q4f16_1-MLC',
  name: 'Phi-4 Mini',
  family: 'webllm',
  task: 'text-generation',
  size: '~3.7 GB',
  load: { promptFormat: 'chat' },
})
