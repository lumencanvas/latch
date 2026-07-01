import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/resnet-50',
  name: 'ResNet-50',
  family: 'transformers',
  task: 'image-classification',
  size: '~100 MB',
  license: 'apache-2.0',
})
