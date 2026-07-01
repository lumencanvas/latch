import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen3-1.7B-q4f16_1-MLC',
  name: 'Qwen3 1.7B',
  family: 'webllm',
  task: 'text-generation',
  size: '~1.8 GB',
  load: { promptFormat: 'chat' },
})
