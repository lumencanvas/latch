import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
  name: 'DeepSeek R1 Distill 7B',
  family: 'webllm',
  task: 'text-generation',
  size: '~5.1 GB',
  load: { promptFormat: 'chat' },
})
