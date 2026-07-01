import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
  name: 'MobileNetV4 Small',
  family: 'transformers',
  task: 'image-classification',
  size: '~20 MB',
  license: 'apache-2.0',
})
