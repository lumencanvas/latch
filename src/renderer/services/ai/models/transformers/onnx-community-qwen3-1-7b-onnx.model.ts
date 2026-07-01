import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/Qwen3-1.7B-ONNX',
  name: 'Qwen3 1.7B',
  family: 'transformers',
  task: 'text-generation',
  size: '~1 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
