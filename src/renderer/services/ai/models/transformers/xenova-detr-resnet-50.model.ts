import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/detr-resnet-50',
  name: 'detr-resnet-50',
  family: 'transformers',
  task: 'object-detection',
  size: '~160 MB',
  license: 'apache-2.0',
})
