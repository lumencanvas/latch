import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/flan-t5-base',
  name: 'Flan-T5 Base',
  family: 'transformers',
  task: 'text2text-generation',
  size: '~900 MB',
  license: 'apache-2.0',
})
