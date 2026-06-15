import type { NodeDefinition } from '../types'

export const vectorMemoryNode: NodeDefinition = {
  id: 'vector-memory',
  name: 'Vector Memory',
  version: '1.0.0',
  category: 'ai',
  description: 'Build a RAG corpus incrementally — store embeddings + text over time',
  icon: 'database',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'vector', type: 'data', label: 'Vector' },
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'add', type: 'trigger', label: 'Add' },
    { id: 'clear', type: 'trigger', label: 'Clear' },
  ],
  outputs: [
    { id: 'corpus', type: 'data', label: 'Corpus' },
    { id: 'count', type: 'number', label: 'Count' },
  ],
  controls: [{ id: 'maxSize', type: 'number', label: 'Max Size', default: 0 }],
  info: {
    overview:
      'A stateful, incrementally-built RAG corpus. Pulse Add to store the current Vector + Text; pulse Clear to empty it. The accumulated Corpus output wires straight into the Retrieve node, so a small, short-context LLM can answer over text gathered across a whole session. Pure and offline — no model call here.',
    tips: [
      'Embed each document chunk with Text Embed, then pulse Add to remember it.',
      'Wire the Corpus output into the Retrieve node’s Corpus input to rank by relevance.',
      'Set Max Size > 0 to cap the corpus (oldest entries are evicted) and bound memory in long-running sets; 0 means unlimited.',
      'All embeddings must come from the same model — a dimension mismatch is ignored rather than stored.',
    ],
    pairsWith: ['feature-extraction', 'retrieve', 'text-generation', 'trigger'],
  },
}
