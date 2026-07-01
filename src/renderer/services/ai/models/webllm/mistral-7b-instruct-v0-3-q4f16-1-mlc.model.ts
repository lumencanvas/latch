import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
  name: 'Mistral 7B v0.3',
  family: 'webllm',
  task: 'text-generation',
  size: '~4.6 GB',
  load: { promptFormat: 'chat' },
})
