import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
  name: 'Phi-3.5 Mini',
  family: 'webllm',
  task: 'text-generation',
  size: '~3.7 GB',
  load: { promptFormat: 'chat' },
})
