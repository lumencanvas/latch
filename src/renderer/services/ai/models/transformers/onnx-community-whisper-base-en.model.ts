import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/whisper-base.en',
  name: 'Whisper Base',
  family: 'transformers',
  task: 'automatic-speech-recognition',
  size: '~145 MB',
  license: 'apache-2.0',
})
