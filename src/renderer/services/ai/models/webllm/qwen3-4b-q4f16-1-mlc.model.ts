import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Qwen3-4B-q4f16_1-MLC',
  name: 'Qwen3 4B',
  family: 'webllm',
  task: 'text-generation',
  size: '~3.3 GB',
  load: { promptFormat: 'chat' },
})
