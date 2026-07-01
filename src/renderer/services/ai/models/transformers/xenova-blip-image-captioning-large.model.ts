import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/blip-image-captioning-large',
  name: 'BLIP Large',
  family: 'transformers',
  task: 'image-to-text',
  size: '~1.8 GB',
  license: 'bsd-3-clause',
})
