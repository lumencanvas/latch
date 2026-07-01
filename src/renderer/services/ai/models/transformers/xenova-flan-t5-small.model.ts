import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/flan-t5-small',
  name: 'flan-t5-small',
  family: 'transformers',
  task: 'text2text-generation',
  size: '~300 MB',
  license: 'apache-2.0',
})
