import type { NodeDefinition } from '../types'

export const retrieveNode: NodeDefinition = {
  id: 'retrieve',
  name: 'Retrieve',
  version: '1.0.0',
  category: 'ai',
  description: 'Rank pre-embedded documents by similarity to a query embedding (RAG)',
  icon: 'search',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'corpus', type: 'data', label: 'Corpus' },
    { id: 'query', type: 'data', label: 'Query' },
  ],
  outputs: [
    { id: 'matches', type: 'data', label: 'Matches' },
    { id: 'context', type: 'string', label: 'Context' },
    { id: 'bestText', type: 'string', label: 'Best' },
  ],
  controls: [{ id: 'topK', type: 'number', label: 'Top K', default: 3 }],
  tags: ['retrieve', 'rag', 'search', 'vector', 'similarity', 'memory', 'context', 'ai'],
  info: {
    overview:
      'Ranks a corpus of pre-embedded documents by cosine similarity to a query embedding and returns the top-K. This is the retrieval step of in-browser RAG: it lets a small, short-context LLM answer over far more text than fits in its window. Pure and offline — no model call here.',
    tips: [
      'Feed Corpus as an array of { vector, text } objects — embed each document once with Text Embed.',
      'Embed the user question with Text Embed and wire it to Query.',
      'Wire the Context output into a Template / Text Generation prompt to ground the model in the retrieved text.',
    ],
    pairsWith: ['feature-extraction', 'text-generation', 'template', 'monitor'],
  },
}
