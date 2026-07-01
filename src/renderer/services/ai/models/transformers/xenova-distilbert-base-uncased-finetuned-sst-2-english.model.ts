import { defineModel } from '../../defineModel'

export default defineModel({
  id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  name: 'distilbert-base-uncased-finetuned-sst-2-english',
  family: 'transformers',
  task: 'sentiment-analysis',
  size: '~270 MB',
  license: 'apache-2.0',
})
