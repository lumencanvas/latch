import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/Qwen3-0.6B-ONNX',
  name: 'Qwen3 0.6B',
  family: 'transformers',
  task: 'text-generation',
  size: '~0.4 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
