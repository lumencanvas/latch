import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  name: 'Qwen2.5 7B',
  family: 'webllm',
  task: 'text-generation',
  size: '~5.1 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
