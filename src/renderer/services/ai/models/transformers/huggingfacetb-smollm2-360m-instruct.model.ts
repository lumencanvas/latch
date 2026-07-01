import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
  name: 'SmolLM2 360M',
  family: 'transformers',
  task: 'text-generation',
  size: '~0.3 GB',
  license: 'apache-2.0',
  load: { promptFormat: 'chat' },
})
