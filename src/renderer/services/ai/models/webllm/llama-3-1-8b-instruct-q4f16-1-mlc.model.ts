import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
  name: 'Llama 3.1 8B',
  family: 'webllm',
  task: 'text-generation',
  size: '~5.0 GB',
  load: { promptFormat: 'chat' },
})
