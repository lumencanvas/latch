import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/gemma-3-1b-it-ONNX',
  name: 'Gemma 3 1B',
  family: 'transformers',
  task: 'text-generation',
  size: '~0.8 GB',
  license: 'gemma',
  load: { promptFormat: 'chat' },
})
