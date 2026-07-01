import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/Llama-3.2-3B-Instruct-ONNX',
  name: 'Llama 3.2 3B',
  family: 'transformers',
  task: 'text-generation',
  size: '~1.8 GB (q4f16)',
  license: 'llama3.2',
  load: { promptFormat: 'chat' },
})
