import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  name: 'Qwen2.5 1.5B',
  family: 'webllm',
  task: 'text-generation',
  size: '~1.6 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
