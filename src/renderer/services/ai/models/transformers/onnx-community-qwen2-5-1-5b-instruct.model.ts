import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/Qwen2.5-1.5B-Instruct',
  name: 'Qwen2.5 1.5B Instruct',
  family: 'transformers',
  task: 'text-generation',
  size: '~0.9 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
