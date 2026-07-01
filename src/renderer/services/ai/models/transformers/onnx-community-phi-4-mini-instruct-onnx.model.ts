import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/Phi-4-mini-instruct-ONNX',
  name: 'Phi-4 Mini',
  family: 'transformers',
  task: 'text-generation',
  size: '~2.4 GB (q4f16)',
  license: 'mit',
  load: { promptFormat: 'chat' },
})
