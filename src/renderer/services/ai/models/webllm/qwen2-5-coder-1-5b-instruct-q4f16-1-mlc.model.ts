import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  name: 'Qwen2.5 Coder 1.5B',
  family: 'webllm',
  task: 'text-generation',
  size: '~1.6 GB',
  load: { promptFormat: 'chat' },
})
