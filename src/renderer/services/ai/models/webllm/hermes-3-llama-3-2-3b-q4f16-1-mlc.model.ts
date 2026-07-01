import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC',
  name: 'Hermes 3 (Llama 3.2 3B)',
  family: 'webllm',
  task: 'text-generation',
  size: '~2.3 GB',
  load: { promptFormat: 'chat' },
})
