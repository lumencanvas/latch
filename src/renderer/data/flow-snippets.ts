export interface FlowSnippet {
  id: string
  name: string
  description: string
  category: string
  relatedNodes: string[]
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
  }>
}

export const flowSnippets: FlowSnippet[] = [
  {
    id: 'midi-note-filter',
    name: 'MIDI Note Filter',
    description: 'Filter MIDI notes by pitch using Compare and Gate',
    category: 'inputs',
    relatedNodes: ['midi-input', 'compare', 'gate'],
    nodes: [
      { id: 'sn-1', type: 'midi-input', position: { x: 0, y: 0 }, data: { nodeType: 'midi-input', enabled: true, channel: -1 } },
      { id: 'sn-2', type: 'compare', position: { x: 250, y: 0 }, data: { nodeType: 'compare', operator: '==', b: 60 } },
      { id: 'sn-3', type: 'gate', position: { x: 500, y: 0 }, data: { nodeType: 'gate', open: true } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'a' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'result', target: 'sn-3', targetHandle: 'gate' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-3', targetHandle: 'value' },
    ],
  },
  {
    id: 'audio-reactive-visuals',
    name: 'Audio Reactive Visuals',
    description: 'Connect audio input to beat detection feeding into a shader',
    category: 'audio',
    relatedNodes: ['audio-input', 'beat-detect', 'shader'],
    nodes: [
      { id: 'sn-1', type: 'audio-input', position: { x: 0, y: 0 }, data: { nodeType: 'audio-input' } },
      { id: 'sn-2', type: 'shader', position: { x: 350, y: 0 }, data: { nodeType: 'shader' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'audio', target: 'sn-2', targetHandle: 'audio' },
    ],
  },
  {
    id: 'value-threshold',
    name: 'Value Threshold',
    description: 'Route values above or below a threshold using Compare and Switch',
    category: 'logic',
    relatedNodes: ['constant', 'compare', 'switch'],
    nodes: [
      { id: 'sn-1', type: 'constant', position: { x: 0, y: 0 }, data: { nodeType: 'constant', value: 50 } },
      { id: 'sn-2', type: 'compare', position: { x: 250, y: 0 }, data: { nodeType: 'compare', operator: '>=', b: 50 } },
      { id: 'sn-3', type: 'switch', position: { x: 500, y: 0 }, data: { nodeType: 'switch' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'value', target: 'sn-2', targetHandle: 'a' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'result', target: 'sn-3', targetHandle: 'condition' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'value', target: 'sn-3', targetHandle: 'true' },
    ],
  },
  {
    id: 'color-cycling',
    name: 'Color Cycling',
    description: 'Use an LFO to cycle through colors over time',
    category: 'visual',
    relatedNodes: ['lfo', 'map-range', 'color'],
    nodes: [
      { id: 'sn-1', type: 'lfo', position: { x: 0, y: 0 }, data: { nodeType: 'lfo', frequency: 0.5, waveform: 'sine' } },
      { id: 'sn-2', type: 'map-range', position: { x: 250, y: 0 }, data: { nodeType: 'map-range', inMin: -1, inMax: 1, outMin: 0, outMax: 360 } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'value', target: 'sn-2', targetHandle: 'value' },
    ],
  },
  {
    id: 'keyboard-synth',
    name: 'Keyboard to Synth',
    description: 'Connect the on-screen keyboard to a synthesizer',
    category: 'audio',
    relatedNodes: ['keyboard', 'synth'],
    nodes: [
      { id: 'sn-1', type: 'keyboard', position: { x: 0, y: 0 }, data: { nodeType: 'keyboard' } },
      { id: 'sn-2', type: 'synth', position: { x: 350, y: 0 }, data: { nodeType: 'synth' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'note' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'gate', target: 'sn-2', targetHandle: 'gate' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-2', targetHandle: 'velocity' },
    ],
  },
  {
    id: 'data-logger',
    name: 'Data Logger',
    description: 'Monitor and log any input value for debugging',
    category: 'debug',
    relatedNodes: ['monitor', 'console'],
    nodes: [
      { id: 'sn-1', type: 'monitor', position: { x: 0, y: 0 }, data: { nodeType: 'monitor' } },
      { id: 'sn-2', type: 'console', position: { x: 250, y: 0 }, data: { nodeType: 'console', label: 'Log' } },
    ],
    edges: [],
  },
]
