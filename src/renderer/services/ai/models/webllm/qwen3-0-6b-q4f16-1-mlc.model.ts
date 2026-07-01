import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen3-0.6B-q4f16_1-MLC',
  name: 'Qwen3 0.6B',
  family: 'webllm',
  task: 'text-generation',
  size: '~0.9 GB',
  load: { promptFormat: 'chat' },
})
