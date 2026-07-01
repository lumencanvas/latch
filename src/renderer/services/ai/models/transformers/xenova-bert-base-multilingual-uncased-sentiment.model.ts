import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/bert-base-multilingual-uncased-sentiment',
  name: 'Multilingual BERT',
  family: 'transformers',
  task: 'sentiment-analysis',
  size: '~700 MB',
  license: 'mit',
})
