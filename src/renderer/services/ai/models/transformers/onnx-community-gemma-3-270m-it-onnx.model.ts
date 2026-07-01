import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/gemma-3-270m-it-ONNX',
  name: 'Gemma 3 270M',
  family: 'transformers',
  task: 'text-generation',
  size: '~0.2 GB',
  license: 'gemma',
  load: { promptFormat: 'chat' },
})
