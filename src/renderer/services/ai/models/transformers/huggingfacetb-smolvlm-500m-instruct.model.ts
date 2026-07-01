import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'HuggingFaceTB/SmolVLM-500M-Instruct',
  name: 'SmolVLM 500M',
  family: 'transformers',
  task: 'image-text-to-text',
  size: '~600 MB',
  license: 'apache-2.0',
})
