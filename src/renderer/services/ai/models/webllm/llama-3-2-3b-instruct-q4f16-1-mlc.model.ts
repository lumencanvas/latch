import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  name: 'Llama 3.2 3B',
  family: 'webllm',
  task: 'text-generation',
  size: '~2.3 GB',
  license: 'llama3.2',
  load: { promptFormat: 'chat' },
})
