import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
  name: 'SmolLM2 1.7B',
  family: 'transformers',
  task: 'text-generation',
  size: '~1 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
