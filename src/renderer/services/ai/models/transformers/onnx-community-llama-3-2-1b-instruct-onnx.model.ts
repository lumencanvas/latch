import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
  name: 'Llama 3.2 1B',
  family: 'transformers',
  task: 'text-generation',
  size: '~0.8 GB (q4f16)',
  license: 'llama3.2',
  load: { promptFormat: 'chat' },
})
