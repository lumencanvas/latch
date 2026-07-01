import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/whisper-small.en',
  name: 'Whisper Small',
  family: 'transformers',
  task: 'automatic-speech-recognition',
  size: '~480 MB',
  license: 'apache-2.0',
})
