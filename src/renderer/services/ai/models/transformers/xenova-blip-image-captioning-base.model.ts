import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/blip-image-captioning-base',
  name: 'blip-image-captioning-base',
  family: 'transformers',
  task: 'image-to-text',
  size: '~990 MB',
  license: 'bsd-3-clause',
})
