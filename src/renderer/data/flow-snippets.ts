/** What a starter needs from the user/machine before it does anything — shown as a hint on its card. */
export type SnippetRequirement = 'camera' | 'microphone' | 'hardware' | 'network' | 'model'

/** Who a starter is for — drives grouping in the snippet gallery. Order here is display order. */
export const SNIPPET_PERSONAS = [
  'Start here',
  'Visuals & VJ',
  'Music & audio',
  'AI & vision',
  '3D',
  'Data & network',
  'Hardware',
] as const
export type SnippetPersona = (typeof SNIPPET_PERSONAS)[number]

export interface FlowSnippet {
  id: string
  name: string
  description: string
  /** A node category id — the explorer's category filter narrows snippets by it. */
  category: string
  persona: SnippetPersona
  /** Permissions / hardware / network / model downloads the flow needs (absent = runs as-is). */
  requires?: SnippetRequirement[]
  /** One line of setup the flow can't do for itself (e.g. pick a saved connection). */
  setup?: string
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

export const REQUIREMENT_LABELS: Record<SnippetRequirement, string> = {
  camera: 'Camera',
  microphone: 'Mic',
  hardware: 'Hardware',
  network: 'Network',
  model: 'AI model',
}

// Starter flows offered on the empty canvas (and in the node explorer's Snippets tab). Each is a
// COMPLETE, working mini-flow: every edge connects real ports and ends in something you can see or
// hear (the main output, a monitor/scope, or audio) once you press Play. Ports, port types and
// control values are pinned against the live node definitions by tests/unit/data/starter-flows.test.ts
// — insertion does not validate wires, so a stale port id would otherwise leave a silently dead edge.
// Layout: ~300px columns, rows spaced so no two node bodies overlap.
export const flowSnippets: FlowSnippet[] = [
  // ── Start here ───────────────────────────────────────────────────────────────
  {
    id: 'lfo-kaleidoscope',
    name: 'Spinning Kaleidoscope',
    description: 'An LFO, mapped to an angle, slowly turns a kaleidoscope over a plasma shader — modulation in five nodes',
    category: 'timing',
    persona: 'Start here',
    relatedNodes: ['lfo', 'map-range', 'shader', 'image-fx-kaleidoscope', 'main-output', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'shader', position: { x: 0, y: 0 }, data: { preset: 'plasma' } },
      { id: 'sn-2', type: 'lfo', position: { x: 0, y: 240 }, data: { frequency: 0.1, waveform: 'sine' } },
      { id: 'sn-3', type: 'map-range', position: { x: 300, y: 240 }, data: { inMin: -1, inMax: 1, outMin: 0, outMax: 6.28 } },
      { id: 'sn-4', type: 'image-fx-kaleidoscope', position: { x: 600, y: 0 }, data: { u_segments: 8 } },
      { id: 'sn-5', type: 'main-output', position: { x: 900, y: 0 }, data: {} },
      { id: 'sn-6', type: 'monitor', position: { x: 600, y: 240 }, data: { label: 'Angle (rad)' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-4', targetHandle: 'source' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'value', target: 'sn-3', targetHandle: 'value' },
      { id: 'se-3', source: 'sn-3', sourceHandle: 'result', target: 'sn-4', targetHandle: 'u_rotation' },
      { id: 'se-4', source: 'sn-4', sourceHandle: 'texture', target: 'sn-5', targetHandle: 'texture' },
      { id: 'se-5', source: 'sn-3', sourceHandle: 'result', target: 'sn-6', targetHandle: 'value' },
    ],
  },
  {
    id: 'lfo-scope',
    name: 'LFO Waveform',
    description: 'Watch a low-frequency oscillator sweep on a live scope — the basis of modulation',
    category: 'timing',
    persona: 'Start here',
    relatedNodes: ['lfo', 'oscilloscope'],
    nodes: [
      { id: 'sn-1', type: 'lfo', position: { x: 0, y: 0 }, data: { frequency: 0.5, waveform: 'sine' } },
      { id: 'sn-2', type: 'oscilloscope', position: { x: 300, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'value', target: 'sn-2', targetHandle: 'signal' },
    ],
  },
  {
    id: 'value-threshold',
    name: 'Threshold Switch',
    description: 'Drag the slider: a Compare decides whether the Switch passes the value or a fallback 0',
    category: 'logic',
    persona: 'Start here',
    relatedNodes: ['slider', 'compare', 'switch', 'constant', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'slider', position: { x: 0, y: 0 }, data: { value: 0.7 } },
      { id: 'sn-2', type: 'compare', position: { x: 300, y: 0 }, data: { operator: '>=', b: 0.5 } },
      { id: 'sn-3', type: 'constant', position: { x: 300, y: 200 }, data: { value: 0 } },
      { id: 'sn-4', type: 'switch', position: { x: 600, y: 0 }, data: {} },
      { id: 'sn-5', type: 'monitor', position: { x: 900, y: 0 }, data: { label: 'Passed value' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'value', target: 'sn-2', targetHandle: 'a' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'result', target: 'sn-4', targetHandle: 'condition' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'value', target: 'sn-4', targetHandle: 'true' },
      { id: 'se-4', source: 'sn-3', sourceHandle: 'value', target: 'sn-4', targetHandle: 'false' },
      { id: 'se-5', source: 'sn-4', sourceHandle: 'result', target: 'sn-5', targetHandle: 'value' },
    ],
  },

  // ── Visuals & VJ ─────────────────────────────────────────────────────────────
  {
    id: 'shader-output',
    name: 'Animated Shader',
    description: 'Render an animated Shadertoy-style shader to the main output — edit the GLSL live',
    category: 'visual',
    persona: 'Visuals & VJ',
    relatedNodes: ['shader', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'shader', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'main-output', position: { x: 380, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-2', targetHandle: 'texture' },
    ],
  },
  {
    id: 'vj-audio-shader',
    name: 'Audio-Reactive VJ Loop',
    description: 'Voronoi shader → kaleidoscope → RGB split; the mic’s bass kicks the split, the mids fold the mirror',
    category: 'visual',
    persona: 'Visuals & VJ',
    requires: ['microphone'],
    relatedNodes: ['shader', 'image-fx-kaleidoscope', 'image-fx-rgb-shift', 'audio-input', 'audio-analyzer', 'remap', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'shader', position: { x: 0, y: 0 }, data: { preset: 'voronoi' } },
      { id: 'sn-2', type: 'image-fx-kaleidoscope', position: { x: 300, y: 0 }, data: { u_segments: 6 } },
      { id: 'sn-3', type: 'image-fx-rgb-shift', position: { x: 600, y: 0 }, data: { u_amount: 0.01 } },
      { id: 'sn-4', type: 'main-output', position: { x: 900, y: 0 }, data: {} },
      { id: 'sn-5', type: 'audio-input', position: { x: 0, y: 260 }, data: {} },
      { id: 'sn-6', type: 'audio-analyzer', position: { x: 300, y: 260 }, data: { smoothing: 0.7 } },
      { id: 'sn-7', type: 'remap', position: { x: 600, y: 260 }, data: { inMin: 0.2, inMax: 0.8, outMin: 0, outMax: 0.06, clamp: true } },
      { id: 'sn-8', type: 'remap', position: { x: 600, y: 460 }, data: { inMin: 0.1, inMax: 0.7, outMin: 4, outMax: 12, clamp: true } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-2', targetHandle: 'source' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'texture', target: 'sn-3', targetHandle: 'source' },
      { id: 'se-3', source: 'sn-3', sourceHandle: 'texture', target: 'sn-4', targetHandle: 'texture' },
      { id: 'se-4', source: 'sn-5', sourceHandle: 'audio', target: 'sn-6', targetHandle: 'audio' },
      { id: 'se-5', source: 'sn-6', sourceHandle: 'bass', target: 'sn-7', targetHandle: 'value' },
      { id: 'se-6', source: 'sn-7', sourceHandle: 'result', target: 'sn-3', targetHandle: 'u_amount' },
      { id: 'se-7', source: 'sn-6', sourceHandle: 'mid', target: 'sn-8', targetHandle: 'value' },
      { id: 'se-8', source: 'sn-8', sourceHandle: 'result', target: 'sn-2', targetHandle: 'u_segments' },
    ],
  },
  {
    id: 'webcam-kaleidoscope',
    name: 'Webcam Kaleidoscope',
    description: 'Feed your webcam through a kaleidoscope effect to the main output',
    category: 'visual',
    persona: 'Visuals & VJ',
    requires: ['camera'],
    relatedNodes: ['webcam', 'image-fx-kaleidoscope', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'webcam', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'image-fx-kaleidoscope', position: { x: 300, y: 0 }, data: { u_segments: 8 } },
      { id: 'sn-3', type: 'main-output', position: { x: 620, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-2', targetHandle: 'source' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'texture', target: 'sn-3', targetHandle: 'texture' },
    ],
  },
  {
    id: 'webcam-edges',
    name: 'Webcam Edge Detection',
    description: 'OpenCV Canny edges on your webcam to the output, with a live count of the shapes it sees',
    category: 'opencv',
    persona: 'Visuals & VJ',
    requires: ['camera'],
    relatedNodes: ['webcam', 'cv-canny', 'cv-contours', 'main-output', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'webcam', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'cv-canny', position: { x: 300, y: 0 }, data: { lowThreshold: 60, highThreshold: 140, interval: 1 } },
      { id: 'sn-3', type: 'main-output', position: { x: 600, y: 0 }, data: {} },
      { id: 'sn-4', type: 'cv-contours', position: { x: 300, y: 220 }, data: { minArea: 400, interval: 4 } },
      { id: 'sn-5', type: 'monitor', position: { x: 600, y: 220 }, data: { label: 'Shapes' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'texture', target: 'sn-2', targetHandle: 'source' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'texture', target: 'sn-3', targetHandle: 'texture' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'texture', target: 'sn-4', targetHandle: 'source' },
      { id: 'se-4', source: 'sn-4', sourceHandle: 'count', target: 'sn-5', targetHandle: 'value' },
    ],
  },

  // ── Music & audio ────────────────────────────────────────────────────────────
  {
    id: 'melody-synth',
    name: 'Generative Melody',
    description: 'A metronome clocks a melody walker through A minor pentatonic into a plucked synth with delay and reverb',
    category: 'audio',
    persona: 'Music & audio',
    relatedNodes: ['metronome', 'melody-walk', 'synth', 'audio-delay', 'reverb', 'audio-output', 'oscilloscope'],
    nodes: [
      { id: 'sn-1', type: 'metronome', position: { x: 0, y: 0 }, data: { bpm: 100, subdivision: '1/2' } },
      { id: 'sn-2', type: 'melody-walk', position: { x: 300, y: 0 }, data: { root: 'A', scaleName: 'minor pentatonic', octaveRange: 2, leapChance: 0.2 } },
      { id: 'sn-3', type: 'synth', position: { x: 600, y: 0 }, data: { instrument: 'pluck', volume: -8, attack: 0.002, decay: 0.35, sustain: 0, release: 0.4 } },
      { id: 'sn-4', type: 'audio-delay', position: { x: 900, y: 0 }, data: { time: 0.375, feedback: 0.35, wet: 0.3 } },
      { id: 'sn-5', type: 'reverb', position: { x: 1200, y: 0 }, data: { decay: 3, wet: 0.35 } },
      { id: 'sn-6', type: 'audio-output', position: { x: 1500, y: 0 }, data: {} },
      { id: 'sn-7', type: 'oscilloscope', position: { x: 1500, y: 200 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'beat', target: 'sn-2', targetHandle: 'clock' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'note', target: 'sn-3', targetHandle: 'note' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'velocity', target: 'sn-3', targetHandle: 'velocity' },
      { id: 'se-4', source: 'sn-2', sourceHandle: 'trigger', target: 'sn-3', targetHandle: 'trigger' },
      { id: 'se-5', source: 'sn-3', sourceHandle: 'audio', target: 'sn-4', targetHandle: 'audio' },
      { id: 'se-6', source: 'sn-4', sourceHandle: 'audio', target: 'sn-5', targetHandle: 'audio' },
      { id: 'se-7', source: 'sn-5', sourceHandle: 'audio', target: 'sn-6', targetHandle: 'audio' },
      { id: 'se-8', source: 'sn-5', sourceHandle: 'audio', target: 'sn-7', targetHandle: 'audio' },
    ],
  },
  {
    id: 'bellows-progression',
    name: 'Chords & Arpeggio',
    description: 'A bellows chord progression in D dorian plays electric piano each bar while a kalimba arpeggiates it',
    category: 'audio',
    persona: 'Music & audio',
    relatedNodes: ['metronome', 'progression', 'arpeggiator', 'poly-voice', 'bellows-instrument', 'bellows-reverb', 'audio-output'],
    nodes: [
      { id: 'sn-1', type: 'metronome', position: { x: 0, y: 120 }, data: { bpm: 84, subdivision: '1/2', beatsPerBar: 4 } },
      { id: 'sn-2', type: 'progression', position: { x: 300, y: 0 }, data: { root: 'D', scaleName: 'dorian', bars: 4 } },
      { id: 'sn-3', type: 'poly-voice', position: { x: 600, y: 0 }, data: { preset: 'dx-epiano', gain: 0.5 } },
      { id: 'sn-4', type: 'arpeggiator', position: { x: 600, y: 260 }, data: { mode: 'updown', octaves: 2, velocity: 90 } },
      { id: 'sn-5', type: 'bellows-instrument', position: { x: 900, y: 300 }, data: { preset: 'kalimba', gain: 0.7 } },
      { id: 'sn-6', type: 'bellows-reverb', position: { x: 900, y: 0 }, data: { effect: 'fdn', fx_fdn_mix: 0.35 } },
      { id: 'sn-7', type: 'audio-output', position: { x: 1500, y: 0 }, data: {} },
      { id: 'sn-8', type: 'audio-output', position: { x: 1200, y: 300 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'bar', target: 'sn-2', targetHandle: 'clock' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'notes', target: 'sn-3', targetHandle: 'notes' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'trigger', target: 'sn-3', targetHandle: 'trigger' },
      { id: 'se-4', source: 'sn-1', sourceHandle: 'beat', target: 'sn-4', targetHandle: 'clock' },
      { id: 'se-5', source: 'sn-2', sourceHandle: 'notes', target: 'sn-4', targetHandle: 'notes' },
      { id: 'se-6', source: 'sn-4', sourceHandle: 'note', target: 'sn-5', targetHandle: 'note' },
      { id: 'se-7', source: 'sn-4', sourceHandle: 'velocity', target: 'sn-5', targetHandle: 'velocity' },
      { id: 'se-8', source: 'sn-4', sourceHandle: 'trigger', target: 'sn-5', targetHandle: 'trigger' },
      { id: 'se-9', source: 'sn-3', sourceHandle: 'audio', target: 'sn-6', targetHandle: 'audio' },
      { id: 'se-10', source: 'sn-5', sourceHandle: 'audio', target: 'sn-8', targetHandle: 'audio' },
      { id: 'se-11', source: 'sn-6', sourceHandle: 'audio', target: 'sn-7', targetHandle: 'audio' },
    ],
  },
  {
    id: 'keyboard-synth',
    name: 'Keyboard to Synth',
    description: 'Play the on-screen keyboard (click the keys) through a synthesizer to your speakers',
    category: 'audio',
    persona: 'Music & audio',
    relatedNodes: ['keyboard', 'synth', 'audio-output'],
    nodes: [
      { id: 'sn-1', type: 'keyboard', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'synth', position: { x: 520, y: 0 }, data: { instrument: 'piano', attack: 0.005, decay: 0.6, sustain: 0.2, release: 1.2 } },
      { id: 'sn-3', type: 'audio-output', position: { x: 820, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'note' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-2', targetHandle: 'velocity' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'gate', target: 'sn-2', targetHandle: 'gate' },
      { id: 'se-4', source: 'sn-2', sourceHandle: 'audio', target: 'sn-3', targetHandle: 'audio' },
    ],
  },
  {
    id: 'audio-reactive',
    name: 'Mic Scope & Tempo',
    description: 'Show a live waveform of the mic and read out the detected tempo',
    category: 'audio',
    persona: 'Music & audio',
    requires: ['microphone'],
    relatedNodes: ['audio-input', 'oscilloscope', 'beat-detect', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'audio-input', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'oscilloscope', position: { x: 320, y: -40 }, data: {} },
      { id: 'sn-3', type: 'beat-detect', position: { x: 320, y: 240 }, data: {} },
      { id: 'sn-4', type: 'monitor', position: { x: 640, y: 240 }, data: { label: 'BPM' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'audio', target: 'sn-2', targetHandle: 'audio' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'audio', target: 'sn-3', targetHandle: 'audio' },
      { id: 'se-3', source: 'sn-3', sourceHandle: 'bpm', target: 'sn-4', targetHandle: 'value' },
    ],
  },

  // ── AI & vision ──────────────────────────────────────────────────────────────
  {
    id: 'face-glitch',
    name: 'Face-Controlled Glitch',
    description: 'MediaPipe face tracking: open your mouth to split the RGB channels, smile to swing their angle',
    category: 'ai',
    persona: 'AI & vision',
    requires: ['camera'],
    relatedNodes: ['webcam', 'mediapipe-face', 'remap', 'image-fx-rgb-shift', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'webcam', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'mediapipe-face', position: { x: 300, y: 0 }, data: { meshMode: 'contours' } },
      { id: 'sn-3', type: 'remap', position: { x: 600, y: 120 }, data: { inMin: 0, inMax: 0.6, outMin: 0, outMax: 0.08, clamp: true } },
      { id: 'sn-4', type: 'remap', position: { x: 600, y: 340 }, data: { inMin: 0, inMax: 1, outMin: 0, outMax: 3.14, clamp: true } },
      { id: 'sn-5', type: 'image-fx-rgb-shift', position: { x: 900, y: 0 }, data: { u_amount: 0 } },
      { id: 'sn-6', type: 'main-output', position: { x: 1200, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'video', target: 'sn-2', targetHandle: 'video' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'texture', target: 'sn-5', targetHandle: 'source' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'mouthOpen', target: 'sn-3', targetHandle: 'value' },
      { id: 'se-4', source: 'sn-3', sourceHandle: 'result', target: 'sn-5', targetHandle: 'u_amount' },
      { id: 'se-5', source: 'sn-2', sourceHandle: 'smile', target: 'sn-4', targetHandle: 'value' },
      { id: 'se-6', source: 'sn-4', sourceHandle: 'result', target: 'sn-5', targetHandle: 'u_angle' },
      { id: 'se-7', source: 'sn-5', sourceHandle: 'texture', target: 'sn-6', targetHandle: 'texture' },
    ],
  },
  {
    id: 'hand-tracking',
    name: 'Hand Tracking',
    description: 'Track hands from the webcam with MediaPipe, show your camera on the output and count the hands',
    category: 'ai',
    persona: 'AI & vision',
    requires: ['camera'],
    relatedNodes: ['webcam', 'mediapipe-hand', 'main-output', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'webcam', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'mediapipe-hand', position: { x: 300, y: -40 }, data: {} },
      { id: 'sn-3', type: 'main-output', position: { x: 300, y: 320 }, data: {} },
      { id: 'sn-4', type: 'monitor', position: { x: 640, y: -40 }, data: { label: 'Hands' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'video', target: 'sn-2', targetHandle: 'video' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'texture', target: 'sn-3', targetHandle: 'texture' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'handCount', target: 'sn-4', targetHandle: 'value' },
    ],
  },
  {
    id: 'llm-poem',
    name: 'Local LLM Poem',
    description: 'Generate text with a small language model running entirely in your browser — press the trigger to write',
    category: 'ai',
    persona: 'AI & vision',
    requires: ['model'],
    setup: 'Load a text-generation model in the AI Model Manager first, then click the Trigger.',
    relatedNodes: ['trigger', 'text-generation', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'text-generation', position: { x: 300, y: 0 }, data: { prompt: 'Write a two-line poem about light and machines:', maxTokens: 60, temperature: 0.9 } },
      { id: 'sn-3', type: 'monitor', position: { x: 640, y: 0 }, data: { label: 'Poem' } },
      { id: 'sn-4', type: 'monitor', position: { x: 640, y: 200 }, data: { label: 'Status' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'trigger', target: 'sn-2', targetHandle: 'trigger' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'text', target: 'sn-3', targetHandle: 'value' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'error', target: 'sn-4', targetHandle: 'value' },
    ],
  },

  // ── 3D ───────────────────────────────────────────────────────────────────────
  {
    id: 'spinning-torus-3d',
    name: 'Spinning 3D Torus',
    description: 'Geometry + physical material, rotated by time, rendered through a camera to the main output',
    category: '3d',
    persona: '3D',
    relatedNodes: ['time', 'expression', 'material-3d', 'torus-3d', 'transform-3d', 'scene-3d', 'camera-3d', 'render-3d', 'main-output'],
    nodes: [
      { id: 'sn-1', type: 'time', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'expression', position: { x: 300, y: 0 }, data: { expression: 'a * 0.6' } },
      { id: 'sn-3', type: 'material-3d', position: { x: 0, y: 200 }, data: { type: 'physical', color: '#ff4f81', metalness: 0.6, roughness: 0.25, emissive: '#3a0820', emissiveIntensity: 1 } },
      { id: 'sn-4', type: 'torus-3d', position: { x: 300, y: 200 }, data: { radius: 0.9, tube: 0.32, radialSegments: 32, tubularSegments: 160 } },
      { id: 'sn-5', type: 'transform-3d', position: { x: 600, y: 100 }, data: {} },
      { id: 'sn-6', type: 'scene-3d', position: { x: 900, y: 100 }, data: { backgroundColor: '#0d0d14' } },
      { id: 'sn-7', type: 'camera-3d', position: { x: 900, y: 280 }, data: { posY: 1, posZ: 4 } },
      { id: 'sn-8', type: 'render-3d', position: { x: 1200, y: 100 }, data: {} },
      { id: 'sn-9', type: 'main-output', position: { x: 1500, y: 100 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-3', sourceHandle: 'material', target: 'sn-4', targetHandle: 'material' },
      { id: 'se-2', source: 'sn-4', sourceHandle: 'object', target: 'sn-5', targetHandle: 'object' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'time', target: 'sn-5', targetHandle: 'rotY' },
      { id: 'se-4', source: 'sn-1', sourceHandle: 'time', target: 'sn-2', targetHandle: 'a' },
      { id: 'se-5', source: 'sn-2', sourceHandle: 'result', target: 'sn-5', targetHandle: 'rotX' },
      { id: 'se-6', source: 'sn-5', sourceHandle: 'object', target: 'sn-6', targetHandle: 'objects' },
      { id: 'se-7', source: 'sn-6', sourceHandle: 'scene', target: 'sn-8', targetHandle: 'scene' },
      { id: 'se-8', source: 'sn-7', sourceHandle: 'camera', target: 'sn-8', targetHandle: 'camera' },
      { id: 'se-9', source: 'sn-8', sourceHandle: 'texture', target: 'sn-9', targetHandle: 'texture' },
    ],
  },

  // ── Data & network ───────────────────────────────────────────────────────────
  {
    id: 'github-stars',
    name: 'Fetch Live JSON',
    description: 'On Play, fetch a public JSON API, pull one field out by path, format it and show it as a sentence',
    category: 'data',
    persona: 'Data & network',
    requires: ['network'],
    relatedNodes: ['start', 'http-request', 'object-get', 'format-number', 'string-template', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'sn-2', type: 'http-request', position: { x: 300, y: 0 }, data: { url: 'https://api.github.com/repos/mrdoob/three.js', method: 'GET' } },
      { id: 'sn-3', type: 'object-get', position: { x: 600, y: 0 }, data: { defaultPath: 'stargazers_count' } },
      { id: 'sn-4', type: 'format-number', position: { x: 900, y: 0 }, data: { decimals: 0 } },
      { id: 'sn-5', type: 'string-template', position: { x: 1200, y: 0 }, data: { template: 'three.js has {a} stars on GitHub' } },
      { id: 'sn-6', type: 'monitor', position: { x: 1500, y: 0 }, data: { label: 'Result' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'trigger', target: 'sn-2', targetHandle: 'trigger' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'response', target: 'sn-3', targetHandle: 'object' },
      { id: 'se-3', source: 'sn-3', sourceHandle: 'value', target: 'sn-4', targetHandle: 'value' },
      { id: 'se-4', source: 'sn-4', sourceHandle: 'result', target: 'sn-5', targetHandle: 'a' },
      { id: 'se-5', source: 'sn-5', sourceHandle: 'result', target: 'sn-6', targetHandle: 'value' },
    ],
  },
  {
    id: 'clasp-relay-loopback',
    name: 'CLASP Relay Loopback',
    description: 'Publish an LFO to the public CLASP relay ten times a second and subscribe to it back — realtime pub/sub',
    category: 'clasp',
    persona: 'Data & network',
    requires: ['network'],
    relatedNodes: ['clasp-connection', 'lfo', 'interval', 'clasp-set', 'clasp-subscribe', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'clasp-connection', position: { x: 0, y: 0 }, data: { url: 'wss://relay.clasp.to', name: 'latch-starter' } },
      { id: 'sn-2', type: 'lfo', position: { x: 0, y: 240 }, data: { frequency: 0.5 } },
      { id: 'sn-3', type: 'interval', position: { x: 0, y: 400 }, data: { interval: 100 } },
      { id: 'sn-4', type: 'clasp-set', position: { x: 300, y: 0 }, data: { address: '/latch/starter/lfo' } },
      { id: 'sn-5', type: 'clasp-subscribe', position: { x: 300, y: 220 }, data: { pattern: '/latch/starter/**' } },
      { id: 'sn-6', type: 'monitor', position: { x: 600, y: 220 }, data: { label: 'From relay' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'connectionId', target: 'sn-4', targetHandle: 'connectionId' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'connectionId', target: 'sn-5', targetHandle: 'connectionId' },
      { id: 'se-3', source: 'sn-2', sourceHandle: 'value', target: 'sn-4', targetHandle: 'value' },
      { id: 'se-4', source: 'sn-3', sourceHandle: 'trigger', target: 'sn-4', targetHandle: 'trigger' },
      { id: 'se-5', source: 'sn-5', sourceHandle: 'value', target: 'sn-6', targetHandle: 'value' },
    ],
  },
  {
    id: 'mqtt-listener',
    name: 'MQTT Listener',
    description: 'Subscribe to an MQTT topic and watch messages arrive — the broker’s uptime ticks every few seconds',
    category: 'connectivity',
    persona: 'Data & network',
    requires: ['network'],
    setup: 'Add an MQTT connection (e.g. wss://test.mosquitto.org:8081) in Connections, then pick it on the MQTT node.',
    relatedNodes: ['mqtt', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'mqtt', position: { x: 0, y: 0 }, data: { topic: '$SYS/broker/uptime' } },
      { id: 'sn-2', type: 'monitor', position: { x: 300, y: 0 }, data: { label: 'Message' } },
      { id: 'sn-3', type: 'monitor', position: { x: 300, y: 180 }, data: { label: 'Connected' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'message', target: 'sn-2', targetHandle: 'value' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'connected', target: 'sn-3', targetHandle: 'value' },
    ],
  },

  // ── Hardware ─────────────────────────────────────────────────────────────────
  {
    id: 'midi-bellows',
    name: 'MIDI Keyboard Instrument',
    description: 'Play a USB MIDI keyboard through a bellows electric piano, with the mod-wheel / CC value shown live',
    category: 'audio',
    persona: 'Hardware',
    requires: ['hardware'],
    relatedNodes: ['midi-input', 'bellows-instrument', 'bellows-reverb', 'audio-output', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'midi-input', position: { x: 0, y: 0 }, data: { channel: -1 } },
      { id: 'sn-2', type: 'bellows-instrument', position: { x: 300, y: 0 }, data: { preset: 'dx-epiano' } },
      { id: 'sn-3', type: 'monitor', position: { x: 300, y: 220 }, data: { label: 'CC value' } },
      { id: 'sn-4', type: 'bellows-reverb', position: { x: 600, y: 0 }, data: { effect: 'fdn', fx_fdn_mix: 0.25 } },
      { id: 'sn-5', type: 'audio-output', position: { x: 900, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'note' },
      { id: 'se-2', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-2', targetHandle: 'velocity' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'noteOn', target: 'sn-2', targetHandle: 'gate' },
      { id: 'se-4', source: 'sn-1', sourceHandle: 'ccValue', target: 'sn-3', targetHandle: 'value' },
      { id: 'se-5', source: 'sn-2', sourceHandle: 'audio', target: 'sn-4', targetHandle: 'audio' },
      { id: 'se-6', source: 'sn-4', sourceHandle: 'audio', target: 'sn-5', targetHandle: 'audio' },
    ],
  },
  {
    id: 'midi-note-filter',
    name: 'MIDI Note Filter',
    description: 'Let a MIDI note’s velocity through only when it is middle C (60), shown on a monitor',
    category: 'inputs',
    persona: 'Hardware',
    requires: ['hardware'],
    relatedNodes: ['midi-input', 'compare', 'gate', 'monitor'],
    nodes: [
      { id: 'sn-1', type: 'midi-input', position: { x: 0, y: 0 }, data: { channel: -1 } },
      { id: 'sn-2', type: 'compare', position: { x: 300, y: 0 }, data: { operator: '==', b: 60 } },
      { id: 'sn-3', type: 'gate', position: { x: 600, y: 0 }, data: { open: true } },
      { id: 'sn-4', type: 'monitor', position: { x: 900, y: 0 }, data: { label: 'Middle C velocity' } },
    ],
    edges: [
      { id: 'se-1', source: 'sn-1', sourceHandle: 'note', target: 'sn-2', targetHandle: 'a' },
      { id: 'se-2', source: 'sn-2', sourceHandle: 'result', target: 'sn-3', targetHandle: 'gate' },
      { id: 'se-3', source: 'sn-1', sourceHandle: 'velocity', target: 'sn-3', targetHandle: 'value' },
      { id: 'se-4', source: 'sn-3', sourceHandle: 'result', target: 'sn-4', targetHandle: 'value' },
    ],
  },
]

/**
 * The curated starters shown as cards on the empty canvas: a varied, mostly zero-permission set
 * (math→visual, generative music, Tone synthesis, 3D, then camera-based AI + VJ). Everything else
 * lives in the node explorer's Snippets tab, grouped by persona.
 */
export const STARTER_FLOW_IDS = [
  'lfo-kaleidoscope',
  'bellows-progression',
  'melody-synth',
  'spinning-torus-3d',
  'face-glitch',
  'webcam-kaleidoscope',
] as const
