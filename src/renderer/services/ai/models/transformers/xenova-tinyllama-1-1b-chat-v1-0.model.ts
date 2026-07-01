import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/TinyLlama-1.1B-Chat-v1.0',
  name: 'TinyLlama-1.1B-Chat-v1.0',
  family: 'transformers',
  task: 'text-generation',
  size: '~640 MB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
