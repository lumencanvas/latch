import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
  name: 'Qwen2.5 Coder 3B',
  family: 'webllm',
  task: 'text-generation',
  size: '~2.5 GB',
  load: { promptFormat: 'chat' },
})
