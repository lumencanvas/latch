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

// Starter flows offered on the empty canvas (and in the node explorer). Each is a COMPLETE, working
// mini-flow: every edge connects real ports and ends in something you can see or hear (a live
// visualizer, the main output, a monitor, or audio). Kept small (2–4 nodes) so they read at a glance.
// Ports here are verified against the node definitions — insertions with a stale port would silently drop.
export const flowSnippets: FlowSnippet[] = [
  {
    id: 'webcam-kaleidoscope',
    name: 'Webcam Kaleidoscope',
    description: 'Feed your webcam through a kaleidoscope effect to the main output',
    category: 'visual',
    relatedNodes: ['webcam', 'image-fx-kaleidoscope', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'webcam', position: { x: 0, y: 0 }, data: { nodeType: 'webcam' } },
      { id: 'sn-2', type: 'image-fx-kaleidoscope', position: { x: 300, y: 0 }, data: { nodeType: 'image-fx-kaleidoscope' } },
      { id: 'sn-3', type: 'main-output', position: { x: 620, y: 0 }, data: { nodeType: 'main-output' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-2', targetHandle: 'source' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'texture', target: 'sn-3', targetHandle: 'texture' },
    ],
  },
  {
    id: 'hand-tracking',
    name: 'Hand Tracking',
    description: 'Track hands from the webcam with MediaPipe and show your camera on the output',
    category: 'ai',
    relatedNodes: ['webcam', 'mediapipe-hand', 'main-output', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'webcam', position: { x: 0, y: 0 }, data: { nodeType: 'webcam' } },
      { id: 'sn-2', type: 'mediapipe-hand', position: { x: 300, y: -40 }, data: { nodeType: 'mediapipe-hand' } },
      { id: 'sn-3', type: 'main-output', position: { x: 300, y: 220 }, data: { nodeType: 'main-output' } },
      { id: 'sn-4', type: 'monitor', position: { x: 640, y: -40 }, data: { nodeType: 'monitor', label: 'Hands' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'video', target: 'sn-2', targetHandle: 'video' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'texture', target: 'sn-3', targetHandle: 'texture' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'handCount', target: 'sn-4', targetHandle: 'value' },
    ],
  },
  {
    id: 'keyboard-synth',
    name: 'Keyboard to Synth',
    description: 'Play the on-screen keyboard through a synthesizer',
    category: 'audio',
    relatedNodes: ['keyboard', 'synth'],
    nodes: [
      { id: 'sn-1', type: 'keyboard', position: { x: 0, y: 0 }, data: { nodeType: 'keyboard' } },
      { id: 'sn-2', type: 'synth', position: { x: 360, y: 0 }, data: { nodeType: 'synth' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'note' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-2', targetHandle: 'velocity' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'gate', target: 'sn-2', targetHandle: 'gate' },
      { id: 'se-4', source: 'sn-1', sourceHandle: 'noteOn', target: 'sn-2', targetHandle: 'trigger' },
    ],
  },
  {
    id: 'audio-reactive',
    name: 'Audio Reactive',
    description: 'Show a live waveform of the mic and read out the detected tempo',
    category: 'audio',
    relatedNodes: ['audio-input', 'oscilloscope', 'beat-detect', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'audio-input', position: { x: 0, y: 0 }, data: { nodeType: 'audio-input' } },
      { id: 'sn-2', type: 'oscilloscope', position: { x: 320, y: -40 }, data: { nodeType: 'oscilloscope' } },
      { id: 'sn-3', type: 'beat-detect', position: { x: 320, y: 240 }, data: { nodeType: 'beat-detect' } },
      { id: 'sn-4', type: 'monitor', position: { x: 640, y: 240 }, data: { nodeType: 'monitor', label: 'BPM' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'audio', target: 'sn-2', targetHandle: 'audio' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'audio', target: 'sn-3', targetHandle: 'audio' },
      { id: 'se-3', source: 'sn-3', sourceHandle: 'bpm', target: 'sn-4', targetHandle: 'value' },
    ],
  },
  {
    id: 'shader-output',
    name: 'Animated Shader',
    description: 'Render an animated Shadertoy-style shader to the main output',
    category: 'visual',
    relatedNodes: ['shader', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'shader', position: { x: 0, y: 0 }, data: { nodeType: 'shader' } },
      { id: 'sn-2', type: 'main-output', position: { x: 380, y: 0 }, data: { nodeType: 'main-output' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-2', targetHandle: 'texture' },
    ],
  },
  {
    id: 'lfo-scope',
    name: 'LFO Waveform',
    description: 'Watch a low-frequency oscillator sweep on a live scope — the basis of modulation',
    category: 'timing',
    relatedNodes: ['lfo', 'oscilloscope'],
    nodes: [
      { id: 'sn-1', type: 'lfo', position: { x: 0, y: 0 }, data: { nodeType: 'lfo', frequency: 0.5, waveform: 'sine' } },
      { id: 'sn-2', type: 'oscilloscope', position: { x: 300, y: 0 }, data: { nodeType: 'oscilloscope' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'value', target: 'sn-2', targetHandle: 'signal' },
    ],
  },
  {
    id: 'value-threshold',
    name: 'Value Threshold',
    description: 'Route a value through a Switch based on whether it clears a threshold',
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
    id: 'midi-note-filter',
    name: 'MIDI Note Filter',
    description: 'Let a MIDI note through only when it matches a target pitch',
    category: 'inputs',
    relatedNodes: ['midi-input', 'compare', 'gate'],
    nodes: [
      { id: 'sn-1', type: 'midi-input', position: { x: 0, y: 0 }, data: { nodeType: 'midi-input', channel: -1 } },
      { id: 'sn-2', type: 'compare', position: { x: 250, y: 0 }, data: { nodeType: 'compare', operator: '==', b: 60 } },
      { id: 'sn-3', type: 'gate', position: { x: 500, y: 0 }, data: { nodeType: 'gate', open: true } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'a' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'result', target: 'sn-3', targetHandle: 'gate' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-3', targetHandle: 'value' },
    ],
  },
]
