<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { VueFlow, useVueFlow, Panel } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Connection, NodeChange } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { useNodesStore, categoryMeta, type NodeCategory } from '@/stores/nodes'
import BaseNode from '@/components/nodes/BaseNode.vue'
import MainOutputNode from '@/components/nodes/MainOutputNode.vue'
import TriggerNode from '@/components/nodes/TriggerNode.vue'
import XYPadNode from '@/components/nodes/XYPadNode.vue'
import MonitorNode from '@/components/nodes/MonitorNode.vue'
import OscilloscopeNode from '@/components/nodes/OscilloscopeNode.vue'
import GraphNode from '@/components/nodes/GraphNode.vue'
import EqualizerNode from '@/components/nodes/EqualizerNode.vue'
import TextboxNode from '@/components/nodes/TextboxNode.vue'
import AnimatedEdge from '@/components/edges/AnimatedEdge.vue'
import { validateConnection } from '@/utils/connections'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { getCustomNodeLoader } from '@/services/customNodes'

// History for undo/redo
const { canUndo, canRedo, undo, redo, startBatch, endBatch } = useFlowHistory()

// Connection validation message
const connectionError = ref<string | null>(null)
let connectionErrorTimeout: ReturnType<typeof setTimeout> | null = null

// Clipboard for copy/paste
interface ClipboardData {
  nodes: Array<{ nodeType: string; position: { x: number; y: number }; data: Record<string, unknown> }>
  copyOffset: { x: number; y: number }
}
const clipboard = ref<ClipboardData | null>(null)

const flowsStore = useFlowsStore()
const uiStore = useUIStore()
const nodesStore = useNodesStore()

const vueFlow = useVueFlow()
const {
  onConnect,
  addEdges,
  onNodeDragStop,
  onPaneReady,
  onPaneClick,
  onNodeClick,
  project,
  fitView,
  setViewport,
  getViewport,
  getSelectedEdges,
} = vueFlow

// Node types - use markRaw to prevent Vue reactivity warnings
const nodeTypes = {
  default: markRaw(BaseNode),
  custom: markRaw(BaseNode),
  'main-output': markRaw(MainOutputNode),
  trigger: markRaw(TriggerNode),
  'xy-pad': markRaw(XYPadNode),
  monitor: markRaw(MonitorNode),
  oscilloscope: markRaw(OscilloscopeNode),
  graph: markRaw(GraphNode),
  equalizer: markRaw(EqualizerNode),
  textbox: markRaw(TextboxNode),
}

// Edge types - use markRaw to prevent Vue reactivity warnings
const edgeTypes = {
  animated: markRaw(AnimatedEdge),
}

// Register nodes immediately (before component renders)
registerDemoNodes()

// Create initial flow if none exists (must happen after nodes are registered)
if (!flowsStore.activeFlow) {
  flowsStore.createFlow('My First Flow')
}

// Connection validation
function isValidConnection(connection: Connection): boolean {
  const result = validateConnection(
    connection,
    (nodeType) => nodesStore.getDefinition(nodeType),
    (nodeId) => flowsStore.activeFlow?.nodes.find(n => n.id === nodeId)?.data as Record<string, unknown> | undefined
  )

  if (!result.valid && result.reason) {
    showConnectionError(result.reason)
  }

  return result.valid
}

function showConnectionError(message: string) {
  connectionError.value = message
  if (connectionErrorTimeout) {
    clearTimeout(connectionErrorTimeout)
  }
  connectionErrorTimeout = setTimeout(() => {
    connectionError.value = null
  }, 2000)
}

// Get node color for MiniMap based on category
function getNodeMinimapColor(node: { data?: Record<string, unknown> }): string {
  const nodeType = node.data?.nodeType as string | undefined
  if (!nodeType) return 'var(--color-neutral-400)'

  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return 'var(--color-neutral-400)'

  const category = definition.category as NodeCategory
  return categoryMeta[category]?.color ?? 'var(--color-neutral-400)'
}

function registerDemoNodes() {
  nodesStore.register({
    id: 'constant',
    name: 'Constant',
    version: '1.0.0',
    category: 'inputs',
    description: 'Output a constant value',
    icon: 'hash',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [{ id: 'value', type: 'number', label: 'Value' }],
    controls: [
      { id: 'value', type: 'number', label: 'Value', default: 0, exposable: true },
    ],
  })

  nodesStore.register({
    id: 'monitor',
    name: 'Monitor',
    version: '1.0.0',
    category: 'debug',
    description: 'Display input values',
    icon: 'eye',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'any', label: 'Value' }],
    outputs: [{ id: 'value', type: 'any', label: 'Pass' }],
    controls: [],
  })

  nodesStore.register({
    id: 'oscilloscope',
    name: 'Oscilloscope',
    version: '1.0.0',
    category: 'debug',
    description: 'Visualize signal waveform over time',
    icon: 'activity',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'signal', type: 'number', label: 'Signal' },
      { id: 'audio', type: 'audio', label: 'Audio' },
    ],
    outputs: [],
    controls: [
      { id: 'timeScale', type: 'slider', label: 'Time Scale', default: 1, props: { min: 0.25, max: 4, step: 0.25 } },
      { id: 'amplitude', type: 'slider', label: 'Amplitude', default: 1, props: { min: 0.1, max: 2, step: 0.1 } },
    ],
  })

  nodesStore.register({
    id: 'graph',
    name: 'Graph',
    version: '1.0.0',
    category: 'debug',
    description: 'Plot X/Y values with dynamic point inputs',
    icon: 'line-chart',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'x0', type: 'number', label: 'X' },
      { id: 'y0', type: 'number', label: 'Y' },
    ],
    outputs: [],
    controls: [
      { id: 'pointCount', type: 'number', label: 'Points', default: 1, props: { min: 1, max: 8 } },
      { id: 'displayMode', type: 'select', label: 'Mode', default: 'line', props: { options: ['line', 'scatter'] } },
      { id: 'showGrid', type: 'toggle', label: 'Grid', default: true },
      { id: 'autoScale', type: 'toggle', label: 'Auto Scale', default: true },
    ],
  })

  nodesStore.register({
    id: 'equalizer',
    name: 'Equalizer',
    version: '1.0.0',
    category: 'debug',
    description: 'Visualize audio frequency spectrum as bars',
    icon: 'bar-chart-3',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    outputs: [],
    controls: [
      { id: 'barCount', type: 'slider', label: 'Bars', default: 16, props: { min: 8, max: 32, step: 4 } },
      { id: 'colorMode', type: 'select', label: 'Color', default: 'gradient', props: { options: ['gradient', 'spectrum', 'solid'] } },
      { id: 'smoothing', type: 'slider', label: 'Smooth', default: 0.8, props: { min: 0, max: 0.95, step: 0.05 } },
    ],
  })

  nodesStore.register({
    id: 'map-range',
    name: 'Map Range',
    version: '1.0.0',
    category: 'math',
    description: 'Remap a value from one range to another',
    icon: 'arrow-right-left',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'number', label: 'Value', required: true }],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [
      { id: 'inMin', type: 'number', label: 'In Min', default: 0 },
      { id: 'inMax', type: 'number', label: 'In Max', default: 1 },
      { id: 'outMin', type: 'number', label: 'Out Min', default: 0 },
      { id: 'outMax', type: 'number', label: 'Out Max', default: 100 },
    ],
  })

  nodesStore.register({
    id: 'trigger',
    name: 'Trigger',
    version: '1.0.0',
    category: 'inputs',
    description: 'Manual trigger button with various output types',
    icon: 'zap',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [{ id: 'trigger', type: 'trigger', label: 'Trigger' }],
    controls: [
      { id: 'outputType', type: 'select', label: 'Type', default: 'boolean', props: { options: ['boolean', 'number', 'string', 'json', 'timestamp'] } },
      { id: 'value', type: 'toggle', label: 'Value', default: false },
      { id: 'stringValue', type: 'text', label: 'String Value', default: '' },
      { id: 'jsonValue', type: 'text', label: 'JSON Value', default: '{}' },
    ],
  })

  nodesStore.register({
    id: 'textbox',
    name: 'Textbox',
    version: '1.0.0',
    category: 'inputs',
    description: 'Resizable text input that outputs a string',
    icon: 'type',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'trigger', type: 'trigger', label: 'Trigger' },
    ],
    outputs: [{ id: 'text', type: 'string', label: 'Text' }],
    controls: [
      { id: 'text', type: 'text', label: 'Text', default: '' },
      { id: 'height', type: 'number', label: 'Height', default: 100 },
    ],
  })

  nodesStore.register({
    id: 'slider',
    name: 'Slider',
    version: '1.0.0',
    category: 'inputs',
    description: 'Slider control (0-1)',
    icon: 'sliders-horizontal',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [{ id: 'value', type: 'number', label: 'Value' }],
    controls: [
      { id: 'value', type: 'slider', label: 'Value', default: 0.5, exposable: true, props: { min: 0, max: 1, step: 0.01 } },
    ],
  })

  nodesStore.register({
    id: 'xy-pad',
    name: 'XY Pad',
    version: '1.0.0',
    category: 'inputs',
    description: '2D position controller with X/Y outputs',
    icon: 'move',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [
      { id: 'rawX', type: 'number', label: 'Raw X' },
      { id: 'rawY', type: 'number', label: 'Raw Y' },
      { id: 'normX', type: 'number', label: '0-1 X' },
      { id: 'normY', type: 'number', label: '0-1 Y' },
    ],
    controls: [
      { id: 'normalizedX', type: 'number', label: 'X', default: 0.5, exposable: true },
      { id: 'normalizedY', type: 'number', label: 'Y', default: 0.5, exposable: true },
      { id: 'minX', type: 'number', label: 'Min X', default: 0 },
      { id: 'maxX', type: 'number', label: 'Max X', default: 1 },
      { id: 'minY', type: 'number', label: 'Min Y', default: 0 },
      { id: 'maxY', type: 'number', label: 'Max Y', default: 1 },
    ],
  })

  nodesStore.register({
    id: 'audio-input',
    name: 'Audio Input',
    version: '1.0.0',
    category: 'audio',
    description: 'Capture audio from microphone',
    icon: 'mic',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      { id: 'level', type: 'number', label: 'Level' },
      { id: 'beat', type: 'trigger', label: 'Beat' },
    ],
    controls: [
      { id: 'source', type: 'select', label: 'Source', default: 'default' },
    ],
  })

  // Math nodes
  nodesStore.register({
    id: 'add',
    name: 'Add',
    version: '1.0.0',
    category: 'math',
    description: 'Add two numbers',
    icon: 'plus',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'number', label: 'A' },
      { id: 'b', type: 'number', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'subtract',
    name: 'Subtract',
    version: '1.0.0',
    category: 'math',
    description: 'Subtract two numbers',
    icon: 'minus',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'number', label: 'A' },
      { id: 'b', type: 'number', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'multiply',
    name: 'Multiply',
    version: '1.0.0',
    category: 'math',
    description: 'Multiply two numbers',
    icon: 'x',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'number', label: 'A' },
      { id: 'b', type: 'number', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'divide',
    name: 'Divide',
    version: '1.0.0',
    category: 'math',
    description: 'Divide two numbers',
    icon: 'divide',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'number', label: 'A' },
      { id: 'b', type: 'number', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'clamp',
    name: 'Clamp',
    version: '1.0.0',
    category: 'math',
    description: 'Clamp a value between min and max',
    icon: 'shrink',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'number', label: 'Value' }],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [
      { id: 'min', type: 'number', label: 'Min', default: 0 },
      { id: 'max', type: 'number', label: 'Max', default: 1 },
    ],
  })

  nodesStore.register({
    id: 'abs',
    name: 'Absolute',
    version: '1.0.0',
    category: 'math',
    description: 'Get absolute value',
    icon: 'flip-horizontal',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'number', label: 'Value' }],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'random',
    name: 'Random',
    version: '1.0.0',
    category: 'math',
    description: 'Generate random number',
    icon: 'shuffle',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'seed', type: 'number', label: 'Seed' }],
    outputs: [{ id: 'result', type: 'number', label: 'Result' }],
    controls: [
      { id: 'min', type: 'number', label: 'Min', default: 0 },
      { id: 'max', type: 'number', label: 'Max', default: 1 },
    ],
  })

  // Timing nodes
  nodesStore.register({
    id: 'time',
    name: 'Time',
    version: '1.0.0',
    category: 'timing',
    description: 'Current time and frame info',
    icon: 'clock',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [
      { id: 'time', type: 'number', label: 'Time' },
      { id: 'delta', type: 'number', label: 'Delta' },
      { id: 'frame', type: 'number', label: 'Frame' },
    ],
    controls: [],
  })

  nodesStore.register({
    id: 'lfo',
    name: 'LFO',
    version: '1.0.0',
    category: 'timing',
    description: 'Low frequency oscillator',
    icon: 'waves',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [{ id: 'value', type: 'number', label: 'Value' }],
    controls: [
      { id: 'frequency', type: 'number', label: 'Frequency', default: 1 },
      { id: 'amplitude', type: 'number', label: 'Amplitude', default: 1 },
      { id: 'offset', type: 'number', label: 'Offset', default: 0 },
      { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine', props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },
    ],
  })

  nodesStore.register({
    id: 'start',
    name: 'Start',
    version: '1.0.0',
    category: 'timing',
    description: 'Fires once when flow starts running',
    icon: 'play',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [{ id: 'trigger', type: 'trigger', label: 'Trigger' }],
    controls: [],
  })

  nodesStore.register({
    id: 'interval',
    name: 'Interval',
    version: '1.0.0',
    category: 'timing',
    description: 'Fires at regular intervals',
    icon: 'timer',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'enabled', type: 'boolean', label: 'Enabled' }],
    outputs: [{ id: 'trigger', type: 'trigger', label: 'Trigger' }],
    controls: [
      { id: 'interval', type: 'number', label: 'Interval (ms)', default: 1000, props: { min: 10, max: 60000 } },
      { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
    ],
  })

  nodesStore.register({
    id: 'delay',
    name: 'Delay',
    version: '1.0.0',
    category: 'timing',
    description: 'Delays a value by specified time',
    icon: 'clock',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'any', label: 'Value' }],
    outputs: [{ id: 'value', type: 'any', label: 'Delayed' }],
    controls: [
      { id: 'delay', type: 'number', label: 'Delay (ms)', default: 500, props: { min: 0, max: 10000 } },
    ],
  })

  nodesStore.register({
    id: 'timer',
    name: 'Timer',
    version: '1.0.0',
    category: 'timing',
    description: 'Stopwatch timer with start/stop/reset',
    icon: 'timer',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'start', type: 'trigger', label: 'Start' },
      { id: 'stop', type: 'trigger', label: 'Stop' },
      { id: 'reset', type: 'trigger', label: 'Reset' },
    ],
    outputs: [
      { id: 'elapsed', type: 'number', label: 'Elapsed (s)' },
      { id: 'running', type: 'boolean', label: 'Running' },
    ],
    controls: [],
  })

  // Logic nodes
  nodesStore.register({
    id: 'compare',
    name: 'Compare',
    version: '1.0.0',
    category: 'logic',
    description: 'Compare two values',
    icon: 'git-compare',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'number', label: 'A' },
      { id: 'b', type: 'number', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
    controls: [
      { id: 'operator', type: 'select', label: 'Op', default: '==', props: { options: ['==', '!=', '>', '>=', '<', '<='] } },
    ],
  })

  nodesStore.register({
    id: 'and',
    name: 'And',
    version: '1.0.0',
    category: 'logic',
    description: 'Logical AND',
    icon: 'circle-dot',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'boolean', label: 'A' },
      { id: 'b', type: 'boolean', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'or',
    name: 'Or',
    version: '1.0.0',
    category: 'logic',
    description: 'Logical OR',
    icon: 'circle',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'boolean', label: 'A' },
      { id: 'b', type: 'boolean', label: 'B' },
    ],
    outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'not',
    name: 'Not',
    version: '1.0.0',
    category: 'logic',
    description: 'Logical NOT',
    icon: 'circle-off',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'boolean', label: 'Value' }],
    outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
    controls: [],
  })

  nodesStore.register({
    id: 'gate',
    name: 'Gate',
    version: '1.0.0',
    category: 'logic',
    description: 'Pass or block value',
    icon: 'door-open',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'value', type: 'any', label: 'Value' },
      { id: 'gate', type: 'boolean', label: 'Gate' },
    ],
    outputs: [{ id: 'result', type: 'any', label: 'Result' }],
    controls: [
      { id: 'open', type: 'toggle', label: 'Open', default: true },
    ],
  })

  nodesStore.register({
    id: 'switch',
    name: 'Switch',
    version: '1.0.0',
    category: 'logic',
    description: 'Select between two values',
    icon: 'git-branch',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'condition', type: 'boolean', label: 'Condition' },
      { id: 'true', type: 'any', label: 'True' },
      { id: 'false', type: 'any', label: 'False' },
    ],
    outputs: [{ id: 'result', type: 'any', label: 'Result' }],
    controls: [],
  })

  // Debug nodes
  nodesStore.register({
    id: 'console',
    name: 'Console',
    version: '1.0.0',
    category: 'debug',
    description: 'Log value to console',
    icon: 'terminal',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'value', type: 'any', label: 'Value' }],
    outputs: [],
    controls: [
      { id: 'label', type: 'text', label: 'Label', default: 'Log' },
      { id: 'logOnChange', type: 'toggle', label: 'On Change', default: true },
    ],
  })

  // Audio nodes
  nodesStore.register({
    id: 'oscillator',
    name: 'Oscillator',
    version: '1.0.0',
    category: 'audio',
    description: 'Generate audio waveform',
    icon: 'waves',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'frequency', type: 'number', label: 'Freq' },
      { id: 'detune', type: 'number', label: 'Detune' },
    ],
    outputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      { id: 'frequency', type: 'number', label: 'Freq' },
    ],
    controls: [
      { id: 'frequency', type: 'number', label: 'Frequency', default: 440 },
      { id: 'detune', type: 'number', label: 'Detune', default: 0 },
      { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine', props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },
      { id: 'volume', type: 'number', label: 'Volume (dB)', default: -6 },
    ],
  })

  nodesStore.register({
    id: 'audio-output',
    name: 'Audio Output',
    version: '1.0.0',
    category: 'audio',
    description: 'Output audio to speakers',
    icon: 'volume-2',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    outputs: [],
    controls: [
      { id: 'volume', type: 'number', label: 'Volume (dB)', default: 0 },
      { id: 'mute', type: 'toggle', label: 'Mute', default: false },
    ],
  })

  nodesStore.register({
    id: 'audio-analyzer',
    name: 'Audio Analyzer',
    version: '1.0.0',
    category: 'audio',
    description: 'Analyze audio levels and frequencies',
    icon: 'bar-chart-2',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    outputs: [
      { id: 'level', type: 'number', label: 'Level' },
      { id: 'bass', type: 'number', label: 'Bass' },
      { id: 'mid', type: 'number', label: 'Mid' },
      { id: 'high', type: 'number', label: 'High' },
    ],
    controls: [
      { id: 'smoothing', type: 'number', label: 'Smoothing', default: 0.8 },
    ],
  })

  nodesStore.register({
    id: 'gain',
    name: 'Gain',
    version: '1.0.0',
    category: 'audio',
    description: 'Adjust audio volume',
    icon: 'volume-1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      { id: 'gain', type: 'number', label: 'Gain' },
    ],
    outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    controls: [
      { id: 'gain', type: 'number', label: 'Gain', default: 1 },
    ],
  })

  nodesStore.register({
    id: 'filter',
    name: 'Filter',
    version: '1.0.0',
    category: 'audio',
    description: 'Filter audio frequencies',
    icon: 'sliders',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      { id: 'frequency', type: 'number', label: 'Freq' },
    ],
    outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    controls: [
      { id: 'frequency', type: 'number', label: 'Frequency', default: 1000 },
      { id: 'Q', type: 'number', label: 'Q', default: 1 },
      { id: 'type', type: 'select', label: 'Type', default: 'lowpass', props: { options: ['lowpass', 'highpass', 'bandpass', 'notch'] } },
    ],
  })

  nodesStore.register({
    id: 'delay',
    name: 'Delay',
    version: '1.0.0',
    category: 'audio',
    description: 'Add delay/echo effect',
    icon: 'repeat',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      { id: 'time', type: 'number', label: 'Time' },
    ],
    outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    controls: [
      { id: 'time', type: 'number', label: 'Delay (s)', default: 0.25 },
      { id: 'feedback', type: 'number', label: 'Feedback', default: 0.5 },
      { id: 'wet', type: 'number', label: 'Wet', default: 0.5 },
    ],
  })

  nodesStore.register({
    id: 'beat-detect',
    name: 'Beat Detect',
    version: '1.0.0',
    category: 'audio',
    description: 'Detect beats and estimate BPM',
    icon: 'activity',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'audio', type: 'audio', label: 'Audio', required: true },
    ],
    outputs: [
      { id: 'beat', type: 'trigger', label: 'Beat' },
      { id: 'bpm', type: 'number', label: 'BPM' },
      { id: 'energy', type: 'number', label: 'Energy' },
    ],
    controls: [
      { id: 'sensitivity', type: 'slider', label: 'Sensitivity', default: 1.5, props: { min: 1, max: 3, step: 0.1 } },
      { id: 'minInterval', type: 'number', label: 'Min Interval (ms)', default: 200, props: { min: 50, max: 500 } },
      { id: 'decayRate', type: 'slider', label: 'Decay Rate', default: 0.95, props: { min: 0.8, max: 0.99, step: 0.01 } },
    ],
  })

  nodesStore.register({
    id: 'audio-player',
    name: 'Audio Player',
    version: '1.0.0',
    category: 'audio',
    description: 'Play audio files from URL',
    icon: 'play-circle',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'url', type: 'string', label: 'URL' },
      { id: 'play', type: 'trigger', label: 'Play' },
      { id: 'stop', type: 'trigger', label: 'Stop' },
    ],
    outputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      { id: 'playing', type: 'boolean', label: 'Playing' },
      { id: 'duration', type: 'number', label: 'Duration' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'url', type: 'text', label: 'URL', default: '' },
      { id: 'loop', type: 'toggle', label: 'Loop', default: false },
      { id: 'autoplay', type: 'toggle', label: 'Autoplay', default: false },
      { id: 'volume', type: 'slider', label: 'Volume (dB)', default: 0, props: { min: -40, max: 6, step: 1 } },
      { id: 'playbackRate', type: 'slider', label: 'Speed', default: 1, props: { min: 0.5, max: 2, step: 0.1 } },
    ],
  })

  nodesStore.register({
    id: 'envelope',
    name: 'Envelope (ADSR)',
    version: '1.0.0',
    category: 'audio',
    description: 'ADSR amplitude envelope',
    icon: 'trending-up',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'trigger', type: 'trigger', label: 'Trigger' },
      { id: 'release', type: 'trigger', label: 'Release' },
    ],
    outputs: [
      { id: 'envelope', type: 'audio', label: 'Envelope' },
      { id: 'value', type: 'number', label: 'Value' },
    ],
    controls: [
      { id: 'attack', type: 'slider', label: 'Attack', default: 0.01, props: { min: 0.001, max: 2, step: 0.001 } },
      { id: 'decay', type: 'slider', label: 'Decay', default: 0.1, props: { min: 0.001, max: 2, step: 0.001 } },
      { id: 'sustain', type: 'slider', label: 'Sustain', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'release', type: 'slider', label: 'Release', default: 0.3, props: { min: 0.001, max: 5, step: 0.001 } },
    ],
  })

  nodesStore.register({
    id: 'reverb',
    name: 'Reverb',
    version: '1.0.0',
    category: 'audio',
    description: 'Add reverb effect',
    icon: 'waves',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'audio', type: 'audio', label: 'Audio', required: true },
    ],
    outputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
    ],
    controls: [
      { id: 'decay', type: 'slider', label: 'Decay', default: 1.5, props: { min: 0.1, max: 10, step: 0.1 } },
      { id: 'wet', type: 'slider', label: 'Wet', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'preDelay', type: 'slider', label: 'Pre-Delay', default: 0.01, props: { min: 0, max: 0.1, step: 0.001 } },
    ],
  })

  // Visual nodes
  nodesStore.register({
    id: 'shader',
    name: 'Shader',
    version: '1.0.0',
    category: 'visual',
    description: 'Custom GLSL shader (Shadertoy compatible)',
    icon: 'code',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'param1', type: 'number', label: 'Param 1' },
      { id: 'param2', type: 'number', label: 'Param 2' },
      { id: 'param3', type: 'number', label: 'Param 3' },
      { id: 'param4', type: 'number', label: 'Param 4' },
      { id: 'texture0', type: 'texture', label: 'Texture 0' },
      { id: 'texture1', type: 'texture', label: 'Texture 1' },
    ],
    outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    controls: [
      { id: 'code', type: 'code', label: 'GLSL Code', default: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
  fragColor = vec4(col, 1.0);
}` },
      { id: 'shadertoy', type: 'toggle', label: 'Shadertoy Mode', default: true },
    ],
  })

  nodesStore.register({
    id: 'webcam',
    name: 'Webcam',
    version: '1.0.0',
    category: 'visual',
    description: 'Capture video from camera',
    icon: 'camera',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [
      { id: 'texture', type: 'texture', label: 'Texture' },
      { id: 'video', type: 'video', label: 'Video' },
      { id: 'width', type: 'number', label: 'Width' },
      { id: 'height', type: 'number', label: 'Height' },
    ],
    controls: [
      { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
      { id: 'device', type: 'select', label: 'Device', default: 'default' },
    ],
  })

  nodesStore.register({
    id: 'color',
    name: 'Color',
    version: '1.0.0',
    category: 'visual',
    description: 'Create RGBA color value',
    icon: 'palette',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'r', type: 'number', label: 'R' },
      { id: 'g', type: 'number', label: 'G' },
      { id: 'b', type: 'number', label: 'B' },
      { id: 'a', type: 'number', label: 'A' },
    ],
    outputs: [
      { id: 'color', type: 'data', label: 'Color' },
      { id: 'r', type: 'number', label: 'R' },
      { id: 'g', type: 'number', label: 'G' },
      { id: 'b', type: 'number', label: 'B' },
      { id: 'a', type: 'number', label: 'A' },
    ],
    controls: [
      { id: 'r', type: 'slider', label: 'R', default: 1, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'g', type: 'slider', label: 'G', default: 1, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'b', type: 'slider', label: 'B', default: 1, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'a', type: 'slider', label: 'A', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    ],
  })

  nodesStore.register({
    id: 'texture-display',
    name: 'Texture Display',
    version: '1.0.0',
    category: 'visual',
    description: 'Display texture on canvas',
    icon: 'monitor',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    outputs: [],
    controls: [],
  })

  nodesStore.register({
    id: 'blend',
    name: 'Blend',
    version: '1.0.0',
    category: 'visual',
    description: 'Blend two textures together',
    icon: 'layers',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'texture', label: 'A' },
      { id: 'b', type: 'texture', label: 'B' },
      { id: 'mix', type: 'number', label: 'Mix' },
    ],
    outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    controls: [
      { id: 'mix', type: 'slider', label: 'Mix', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'mode', type: 'select', label: 'Mode', default: 'normal', props: { options: ['normal', 'add', 'multiply', 'screen', 'overlay'] } },
    ],
  })

  nodesStore.register({
    id: 'blur',
    name: 'Blur',
    version: '1.0.0',
    category: 'visual',
    description: 'Apply Gaussian blur to texture',
    icon: 'droplet',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'texture', type: 'texture', label: 'Texture' },
      { id: 'radius', type: 'number', label: 'Radius' },
    ],
    outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    controls: [
      { id: 'radius', type: 'slider', label: 'Radius', default: 5, props: { min: 0, max: 50, step: 0.5 } },
      { id: 'passes', type: 'number', label: 'Passes', default: 2, props: { min: 1, max: 10 } },
    ],
  })

  nodesStore.register({
    id: 'color-correction',
    name: 'Color Correction',
    version: '1.0.0',
    category: 'visual',
    description: 'Adjust brightness, contrast, saturation, hue, and gamma',
    icon: 'palette',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'texture', type: 'texture', label: 'Texture' },
      { id: 'brightness', type: 'number', label: 'Brightness' },
      { id: 'contrast', type: 'number', label: 'Contrast' },
      { id: 'saturation', type: 'number', label: 'Saturation' },
      { id: 'hue', type: 'number', label: 'Hue' },
      { id: 'gamma', type: 'number', label: 'Gamma' },
    ],
    outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    controls: [
      { id: 'brightness', type: 'slider', label: 'Brightness', default: 0, props: { min: -1, max: 1, step: 0.01 } },
      { id: 'contrast', type: 'slider', label: 'Contrast', default: 1, props: { min: 0, max: 3, step: 0.01 } },
      { id: 'saturation', type: 'slider', label: 'Saturation', default: 1, props: { min: 0, max: 3, step: 0.01 } },
      { id: 'hue', type: 'slider', label: 'Hue', default: 0, props: { min: -180, max: 180, step: 1 } },
      { id: 'gamma', type: 'slider', label: 'Gamma', default: 1, props: { min: 0.1, max: 3, step: 0.01 } },
    ],
  })

  nodesStore.register({
    id: 'displacement',
    name: 'Displacement',
    version: '1.0.0',
    category: 'visual',
    description: 'Displace texture using displacement map',
    icon: 'move',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'texture', type: 'texture', label: 'Texture' },
      { id: 'displacementMap', type: 'texture', label: 'Displacement Map' },
      { id: 'strength', type: 'number', label: 'Strength' },
    ],
    outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    controls: [
      { id: 'strength', type: 'slider', label: 'Strength', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'channel', type: 'select', label: 'Channel', default: 'rg', props: { options: ['r', 'rg', 'rgb'] } },
    ],
  })

  nodesStore.register({
    id: 'transform-2d',
    name: 'Transform 2D',
    version: '1.0.0',
    category: 'visual',
    description: 'Apply 2D transforms (scale, rotate, translate)',
    icon: 'move-3d',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'texture', type: 'texture', label: 'Texture' },
      { id: 'scale', type: 'number', label: 'Scale' },
      { id: 'rotation', type: 'number', label: 'Rotation' },
      { id: 'translateX', type: 'number', label: 'Translate X' },
      { id: 'translateY', type: 'number', label: 'Translate Y' },
    ],
    outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    controls: [
      { id: 'scale', type: 'slider', label: 'Scale', default: 1, props: { min: 0.1, max: 5, step: 0.01 } },
      { id: 'rotation', type: 'slider', label: 'Rotation', default: 0, props: { min: -180, max: 180, step: 1 } },
      { id: 'translateX', type: 'slider', label: 'Translate X', default: 0, props: { min: -1, max: 1, step: 0.01 } },
      { id: 'translateY', type: 'slider', label: 'Translate Y', default: 0, props: { min: -1, max: 1, step: 0.01 } },
    ],
  })

  // Main Output - special viewer node
  nodesStore.register({
    id: 'main-output',
    name: 'Main Output',
    version: '1.0.0',
    category: 'outputs',
    description: 'Final output viewer with large preview',
    icon: 'monitor-play',
    platforms: ['web', 'electron'],
    inputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
    outputs: [],
    controls: [],
  })

  // ============================================================================
  // AI Nodes
  // ============================================================================

  nodesStore.register({
    id: 'text-generation',
    name: 'Text Generate',
    version: '1.0.0',
    category: 'ai',
    description: 'Generate text using local language models',
    icon: 'message-square',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'prompt', type: 'string', label: 'Prompt' },
      { id: 'trigger', type: 'trigger', label: 'Generate' },
    ],
    outputs: [
      { id: 'text', type: 'string', label: 'Generated Text' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [
      { id: 'prompt', type: 'text', label: 'Prompt', default: 'Once upon a time' },
      { id: 'maxTokens', type: 'number', label: 'Max Tokens', default: 50, props: { min: 10, max: 200 } },
      { id: 'temperature', type: 'slider', label: 'Temperature', default: 0.7, props: { min: 0.1, max: 2, step: 0.1 } },
    ],
  })

  nodesStore.register({
    id: 'image-classification',
    name: 'Classify Image',
    version: '1.0.0',
    category: 'ai',
    description: 'Classify images using Vision Transformer',
    icon: 'scan',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'image', type: 'data', label: 'Image' },
    ],
    outputs: [
      { id: 'labels', type: 'data', label: 'Labels' },
      { id: 'topLabel', type: 'string', label: 'Top Label' },
      { id: 'topScore', type: 'number', label: 'Top Score' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [
      { id: 'topK', type: 'number', label: 'Top K', default: 5, props: { min: 1, max: 10 } },
      { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
    ],
  })

  nodesStore.register({
    id: 'sentiment-analysis',
    name: 'Sentiment',
    version: '1.0.0',
    category: 'ai',
    description: 'Analyze text sentiment (positive/negative)',
    icon: 'smile',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'text', type: 'string', label: 'Text' },
    ],
    outputs: [
      { id: 'sentiment', type: 'string', label: 'Sentiment' },
      { id: 'score', type: 'number', label: 'Score' },
      { id: 'positive', type: 'number', label: 'Positive' },
      { id: 'negative', type: 'number', label: 'Negative' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [],
  })

  nodesStore.register({
    id: 'image-captioning',
    name: 'Caption Image',
    version: '1.0.0',
    category: 'ai',
    description: 'Generate captions for images',
    icon: 'image',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'image', type: 'data', label: 'Image' },
      { id: 'trigger', type: 'trigger', label: 'Caption' },
    ],
    outputs: [
      { id: 'caption', type: 'string', label: 'Caption' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [
      { id: 'interval', type: 'number', label: 'Frame Interval', default: 60, props: { min: 1, max: 300 } },
    ],
  })

  nodesStore.register({
    id: 'feature-extraction',
    name: 'Text Embed',
    version: '1.0.0',
    category: 'ai',
    description: 'Convert text to embedding vectors',
    icon: 'hash',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'text', type: 'string', label: 'Text' },
    ],
    outputs: [
      { id: 'embedding', type: 'data', label: 'Embedding' },
      { id: 'dimensions', type: 'number', label: 'Dimensions' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [],
  })

  nodesStore.register({
    id: 'object-detection',
    name: 'Detect Objects',
    version: '1.0.0',
    category: 'ai',
    description: 'Detect and locate objects in images',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'image', type: 'data', label: 'Image' },
    ],
    outputs: [
      { id: 'objects', type: 'data', label: 'Objects' },
      { id: 'count', type: 'number', label: 'Count' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [
      { id: 'threshold', type: 'slider', label: 'Threshold', default: 0.5, props: { min: 0.1, max: 1, step: 0.05 } },
      { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
    ],
  })

  // ============================================================================
  // Connectivity Nodes
  // ============================================================================

  nodesStore.register({
    id: 'http-request',
    name: 'HTTP Request',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Make HTTP/REST API requests',
    icon: 'globe',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'url', type: 'string', label: 'URL' },
      { id: 'headers', type: 'data', label: 'Headers' },
      { id: 'body', type: 'data', label: 'Body' },
      { id: 'trigger', type: 'trigger', label: 'Fetch' },
    ],
    outputs: [
      { id: 'response', type: 'data', label: 'Response' },
      { id: 'status', type: 'number', label: 'Status' },
      { id: 'error', type: 'string', label: 'Error' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
    ],
    controls: [
      { id: 'url', type: 'text', label: 'URL', default: 'https://api.example.com/data' },
      { id: 'method', type: 'select', label: 'Method', default: 'GET', props: { options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] } },
    ],
  })

  nodesStore.register({
    id: 'websocket',
    name: 'WebSocket',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Real-time WebSocket connection',
    icon: 'radio',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'url', type: 'string', label: 'URL' },
      { id: 'send', type: 'data', label: 'Send' },
      { id: 'connect', type: 'boolean', label: 'Connect' },
    ],
    outputs: [
      { id: 'message', type: 'data', label: 'Message' },
      { id: 'connected', type: 'boolean', label: 'Connected' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'url', type: 'text', label: 'URL', default: 'wss://echo.websocket.org' },
      { id: 'autoConnect', type: 'toggle', label: 'Auto Connect', default: false },
    ],
  })

  nodesStore.register({
    id: 'midi-input',
    name: 'MIDI Input',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Receive MIDI messages from devices',
    icon: 'music',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [
      { id: 'note', type: 'number', label: 'Note' },
      { id: 'velocity', type: 'number', label: 'Velocity' },
      { id: 'noteOn', type: 'boolean', label: 'Note On' },
      { id: 'cc', type: 'number', label: 'CC Number' },
      { id: 'ccValue', type: 'number', label: 'CC Value' },
      { id: 'connected', type: 'boolean', label: 'Connected' },
    ],
    controls: [
      { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
      { id: 'channel', type: 'number', label: 'Channel (-1=all)', default: -1, props: { min: -1, max: 15 } },
    ],
  })

  nodesStore.register({
    id: 'midi-output',
    name: 'MIDI Output',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Send MIDI messages to devices',
    icon: 'music',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'note', type: 'number', label: 'Note' },
      { id: 'velocity', type: 'number', label: 'Velocity' },
      { id: 'trigger', type: 'trigger', label: 'Send' },
    ],
    outputs: [
      { id: 'connected', type: 'boolean', label: 'Connected' },
    ],
    controls: [
      { id: 'channel', type: 'number', label: 'Channel', default: 0, props: { min: 0, max: 15 } },
    ],
  })

  nodesStore.register({
    id: 'json-parse',
    name: 'JSON Parse',
    version: '1.0.0',
    category: 'data',
    description: 'Parse JSON string to object',
    icon: 'braces',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'input', type: 'string', label: 'JSON String' },
    ],
    outputs: [
      { id: 'output', type: 'data', label: 'Object' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'path', type: 'text', label: 'Path', default: '', props: { placeholder: 'e.g., data.items[0]' } },
    ],
  })

  nodesStore.register({
    id: 'json-stringify',
    name: 'JSON Stringify',
    version: '1.0.0',
    category: 'data',
    description: 'Convert object to JSON string',
    icon: 'braces',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'input', type: 'data', label: 'Object' },
    ],
    outputs: [
      { id: 'output', type: 'string', label: 'JSON String' },
    ],
    controls: [
      { id: 'pretty', type: 'toggle', label: 'Pretty Print', default: false },
    ],
  })

  // Texture to Data converter - bridges visual pipeline to AI/data nodes
  nodesStore.register({
    id: 'texture-to-data',
    name: 'Texture to Data',
    version: '1.0.0',
    category: 'data',
    description: 'Convert texture to image data for AI processing',
    icon: 'image-down',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'texture', type: 'texture', label: 'Texture', required: true },
      { id: 'trigger', type: 'trigger', label: 'Capture' },
    ],
    outputs: [
      { id: 'data', type: 'data', label: 'Image Data' },
      { id: 'width', type: 'number', label: 'Width' },
      { id: 'height', type: 'number', label: 'Height' },
    ],
    controls: [
      { id: 'format', type: 'select', label: 'Format', default: 'imageData', props: { options: ['imageData', 'base64', 'blob'] } },
      { id: 'continuous', type: 'toggle', label: 'Continuous', default: false },
    ],
  })

  nodesStore.register({
    id: 'mqtt',
    name: 'MQTT',
    version: '1.0.0',
    category: 'connectivity',
    description: 'MQTT pub/sub messaging (via WebSocket)',
    icon: 'radio',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'url', type: 'string', label: 'Broker URL' },
      { id: 'topic', type: 'string', label: 'Topic' },
      { id: 'publish', type: 'data', label: 'Publish' },
    ],
    outputs: [
      { id: 'message', type: 'data', label: 'Message' },
      { id: 'topic', type: 'string', label: 'Topic' },
      { id: 'connected', type: 'boolean', label: 'Connected' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'url', type: 'text', label: 'Broker URL', default: 'ws://localhost:8083/mqtt', props: { placeholder: 'ws://broker:8083/mqtt' } },
      { id: 'topic', type: 'text', label: 'Topic', default: 'clasp/data', props: { placeholder: 'topic/subtopic' } },
      { id: 'connect', type: 'toggle', label: 'Connect', default: true },
    ],
  })

  nodesStore.register({
    id: 'osc',
    name: 'OSC',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Open Sound Control over WebSocket',
    icon: 'radio-tower',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'host', type: 'string', label: 'Host' },
      { id: 'port', type: 'number', label: 'Port' },
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'send', type: 'data', label: 'Send' },
    ],
    outputs: [
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'args', type: 'data', label: 'Arguments' },
      { id: 'value', type: 'number', label: 'Value' },
      { id: 'connected', type: 'boolean', label: 'Connected' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'host', type: 'text', label: 'Host', default: 'localhost' },
      { id: 'port', type: 'number', label: 'Port', default: 8080, props: { min: 1, max: 65535 } },
      { id: 'address', type: 'text', label: 'Address', default: '/clasp', props: { placeholder: '/path/to/param' } },
      { id: 'connect', type: 'toggle', label: 'Connect', default: true },
    ],
  })

  nodesStore.register({
    id: 'serial',
    name: 'Serial Port',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Serial port communication (Web Serial API)',
    icon: 'usb',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'send', type: 'string', label: 'Send' },
    ],
    outputs: [
      { id: 'data', type: 'string', label: 'Raw Data' },
      { id: 'line', type: 'string', label: 'Last Line' },
      { id: 'value', type: 'number', label: 'Value' },
      { id: 'connected', type: 'boolean', label: 'Connected' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'baudRate', type: 'select', label: 'Baud Rate', default: 9600, props: { options: [9600, 19200, 38400, 57600, 115200] } },
      { id: 'connect', type: 'toggle', label: 'Connect', default: false },
    ],
  })

  nodesStore.register({
    id: 'ble',
    name: 'Bluetooth LE',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Bluetooth Low Energy communication (Web Bluetooth API)',
    icon: 'bluetooth',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'send', type: 'data', label: 'Send' },
    ],
    outputs: [
      { id: 'value', type: 'number', label: 'Value' },
      { id: 'text', type: 'string', label: 'Text' },
      { id: 'rawValue', type: 'data', label: 'Raw Value' },
      { id: 'deviceName', type: 'string', label: 'Device Name' },
      { id: 'connected', type: 'boolean', label: 'Connected' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'serviceUUID', type: 'text', label: 'Service UUID', default: '', props: { placeholder: 'e.g., heart_rate or 0000180d-...' } },
      { id: 'characteristicUUID', type: 'text', label: 'Characteristic UUID', default: '', props: { placeholder: 'UUID' } },
      { id: 'connect', type: 'toggle', label: 'Connect', default: false },
    ],
  })

  // ============================================================================
  // CLASP Protocol Nodes
  // ============================================================================

  nodesStore.register({
    id: 'clasp-connection',
    name: 'CLASP Connection',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Manage a named CLASP connection (can be shared across nodes)',
    icon: 'network',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'url', type: 'string', label: 'URL' },
      { id: 'connect', type: 'trigger', label: 'Connect' },
      { id: 'disconnect', type: 'trigger', label: 'Disconnect' },
    ],
    outputs: [
      { id: 'connected', type: 'boolean', label: 'Connected' },
      { id: 'status', type: 'string', label: 'Status' },
      { id: 'error', type: 'string', label: 'Error' },
      { id: 'session', type: 'string', label: 'Session ID' },
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default', props: { placeholder: 'Unique ID to reference this connection' } },
      { id: 'url', type: 'text', label: 'URL', default: 'ws://localhost:7330', props: { placeholder: 'ws://host:port' } },
      { id: 'name', type: 'text', label: 'Client Name', default: 'clasp-flow' },
      { id: 'token', type: 'text', label: 'Token', default: '', props: { placeholder: 'cpsk_... or empty for open' } },
      { id: 'autoConnect', type: 'toggle', label: 'Auto Connect', default: true },
      { id: 'autoReconnect', type: 'toggle', label: 'Auto Reconnect', default: true },
      { id: 'reconnectDelay', type: 'number', label: 'Reconnect Delay (ms)', default: 5000, props: { min: 1000, max: 60000 } },
    ],
    tags: ['clasp', 'protocol', 'connection', 'websocket'],
  })

  nodesStore.register({
    id: 'clasp-subscribe',
    name: 'CLASP Subscribe',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Subscribe to CLASP address patterns and receive values',
    icon: 'bell',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
      { id: 'pattern', type: 'string', label: 'Pattern' },
    ],
    outputs: [
      { id: 'value', type: 'any', label: 'Value' },
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'type', type: 'string', label: 'Signal Type' },
      { id: 'revision', type: 'number', label: 'Revision' },
      { id: 'subscribed', type: 'boolean', label: 'Subscribed' },
      { id: 'updated', type: 'boolean', label: 'Updated' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default' },
      { id: 'pattern', type: 'text', label: 'Pattern', default: '/**', props: { placeholder: '/lights/** or /param/*' } },
      { id: 'types', type: 'select', label: 'Signal Types', default: 'all', props: { options: ['all', 'param', 'event', 'stream', 'gesture'] } },
      { id: 'maxRate', type: 'number', label: 'Max Rate (Hz)', default: 0, props: { min: 0, max: 120, step: 1 } },
      { id: 'epsilon', type: 'number', label: 'Change Threshold', default: 0, props: { min: 0, max: 1, step: 0.01 } },
    ],
    tags: ['clasp', 'subscribe', 'listen', 'receive'],
  })

  nodesStore.register({
    id: 'clasp-set',
    name: 'CLASP Set',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Set a CLASP parameter value (persistent state)',
    icon: 'edit-3',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'value', type: 'any', label: 'Value' },
      { id: 'trigger', type: 'trigger', label: 'Send' },
    ],
    outputs: [
      { id: 'sent', type: 'boolean', label: 'Sent' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default' },
      { id: 'address', type: 'text', label: 'Address', default: '/param', props: { placeholder: '/lights/strip1/brightness' } },
    ],
    tags: ['clasp', 'set', 'parameter', 'send'],
  })

  nodesStore.register({
    id: 'clasp-emit',
    name: 'CLASP Emit',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Emit a CLASP event (one-time trigger)',
    icon: 'zap',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'payload', type: 'any', label: 'Payload' },
      { id: 'trigger', type: 'trigger', label: 'Emit' },
    ],
    outputs: [
      { id: 'sent', type: 'boolean', label: 'Sent' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default' },
      { id: 'address', type: 'text', label: 'Event Address', default: '/event', props: { placeholder: '/cue/fire' } },
    ],
    tags: ['clasp', 'emit', 'event', 'trigger'],
  })

  nodesStore.register({
    id: 'clasp-get',
    name: 'CLASP Get',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Get current value of a CLASP parameter',
    icon: 'download',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'trigger', type: 'trigger', label: 'Get' },
    ],
    outputs: [
      { id: 'value', type: 'any', label: 'Value' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default' },
      { id: 'address', type: 'text', label: 'Address', default: '/param', props: { placeholder: '/lights/strip1/brightness' } },
    ],
    tags: ['clasp', 'get', 'read', 'fetch'],
  })

  nodesStore.register({
    id: 'clasp-stream',
    name: 'CLASP Stream',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Stream high-rate data (continuous updates)',
    icon: 'activity',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
      { id: 'address', type: 'string', label: 'Address' },
      { id: 'value', type: 'any', label: 'Value' },
    ],
    outputs: [
      { id: 'sent', type: 'boolean', label: 'Sent' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default' },
      { id: 'address', type: 'text', label: 'Address', default: '/stream', props: { placeholder: '/sensor/temperature' } },
      { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
    ],
    tags: ['clasp', 'stream', 'continuous', 'high-rate'],
  })

  nodesStore.register({
    id: 'clasp-bundle',
    name: 'CLASP Bundle',
    version: '1.0.0',
    category: 'connectivity',
    description: 'Send atomic bundles of operations',
    icon: 'package',
    color: '#6366f1',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'connectionId', type: 'string', label: 'Connection ID' },
      { id: 'messages', type: 'data', label: 'Messages' },
      { id: 'at', type: 'number', label: 'Schedule At (µs)' },
      { id: 'trigger', type: 'trigger', label: 'Send' },
    ],
    outputs: [
      { id: 'sent', type: 'boolean', label: 'Sent' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default' },
    ],
    tags: ['clasp', 'bundle', 'atomic', 'batch'],
  })

  // ============================================================================
  // Code / Advanced Nodes
  // ============================================================================

  nodesStore.register({
    id: 'function',
    name: 'Function',
    version: '1.0.0',
    category: 'code',
    description: 'Custom JavaScript function with sandboxed execution',
    icon: 'code-2',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'any', label: 'A' },
      { id: 'b', type: 'any', label: 'B' },
      { id: 'c', type: 'any', label: 'C' },
      { id: 'd', type: 'any', label: 'D' },
    ],
    outputs: [
      { id: 'result', type: 'any', label: 'Result' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'code', type: 'code', label: 'Code', default: `// Access inputs via: inputs.a, inputs.b, etc.
// Access time via: time, deltaTime, frame
// Use state: getState('key', default), setState('key', value)
// Return a value or object with multiple outputs

return inputs.a + inputs.b;` },
    ],
  })

  nodesStore.register({
    id: 'expression',
    name: 'Expression',
    version: '1.0.0',
    category: 'code',
    description: 'Inline math expression evaluator',
    icon: 'calculator',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'number', label: 'A' },
      { id: 'b', type: 'number', label: 'B' },
      { id: 'c', type: 'number', label: 'C' },
      { id: 'd', type: 'number', label: 'D' },
    ],
    outputs: [
      { id: 'result', type: 'number', label: 'Result' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'expression', type: 'text', label: 'Expression', default: 'a + b', props: { placeholder: 'e.g., sin(t) * a + b' } },
    ],
  })

  nodesStore.register({
    id: 'template',
    name: 'Template',
    version: '1.0.0',
    category: 'code',
    description: 'String template with variable interpolation',
    icon: 'text-cursor-input',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'a', type: 'any', label: 'A' },
      { id: 'b', type: 'any', label: 'B' },
      { id: 'c', type: 'any', label: 'C' },
      { id: 'd', type: 'any', label: 'D' },
    ],
    outputs: [
      { id: 'output', type: 'string', label: 'Output' },
    ],
    controls: [
      { id: 'template', type: 'text', label: 'Template', default: 'Value: {{a}}', props: { placeholder: 'Use {{varname}} for interpolation' } },
    ],
  })

  nodesStore.register({
    id: 'counter',
    name: 'Counter',
    version: '1.0.0',
    category: 'code',
    description: 'Increment/decrement counter with min/max',
    icon: 'list-ordered',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'increment', type: 'trigger', label: 'Increment' },
      { id: 'decrement', type: 'trigger', label: 'Decrement' },
      { id: 'reset', type: 'trigger', label: 'Reset' },
      { id: 'set', type: 'number', label: 'Set Value' },
    ],
    outputs: [
      { id: 'count', type: 'number', label: 'Count' },
      { id: 'normalized', type: 'number', label: 'Normalized' },
      { id: 'atMin', type: 'boolean', label: 'At Min' },
      { id: 'atMax', type: 'boolean', label: 'At Max' },
    ],
    controls: [
      { id: 'min', type: 'number', label: 'Min', default: 0 },
      { id: 'max', type: 'number', label: 'Max', default: 100 },
      { id: 'step', type: 'number', label: 'Step', default: 1 },
      { id: 'wrap', type: 'toggle', label: 'Wrap Around', default: false },
    ],
  })

  nodesStore.register({
    id: 'toggle',
    name: 'Toggle',
    version: '1.0.0',
    category: 'code',
    description: 'Flip-flop toggle with set/reset',
    icon: 'toggle-left',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'trigger', type: 'trigger', label: 'Toggle' },
      { id: 'set', type: 'trigger', label: 'Set' },
      { id: 'reset', type: 'trigger', label: 'Reset' },
    ],
    outputs: [
      { id: 'value', type: 'boolean', label: 'Value' },
      { id: 'inverted', type: 'boolean', label: 'Inverted' },
      { id: 'number', type: 'number', label: 'Number' },
    ],
    controls: [
      { id: 'initial', type: 'toggle', label: 'Initial Value', default: false },
    ],
  })

  nodesStore.register({
    id: 'sample-hold',
    name: 'Sample & Hold',
    version: '1.0.0',
    category: 'code',
    description: 'Capture and hold value on trigger',
    icon: 'clipboard',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'input', type: 'any', label: 'Input' },
      { id: 'trigger', type: 'trigger', label: 'Sample' },
    ],
    outputs: [
      { id: 'output', type: 'any', label: 'Output' },
    ],
    controls: [],
  })

  nodesStore.register({
    id: 'value-delay',
    name: 'Value Delay',
    version: '1.0.0',
    category: 'code',
    description: 'Delay value by N frames',
    icon: 'timer',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'input', type: 'any', label: 'Input' },
    ],
    outputs: [
      { id: 'output', type: 'any', label: 'Output' },
    ],
    controls: [
      { id: 'frames', type: 'number', label: 'Frames', default: 1, props: { min: 1, max: 300 } },
    ],
  })

  nodesStore.register({
    id: 'smooth',
    name: 'Smooth',
    version: '1.0.0',
    category: 'math',
    description: 'Smooth value changes over time',
    icon: 'trending-up',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'value', type: 'number', label: 'Value' },
    ],
    outputs: [
      { id: 'result', type: 'number', label: 'Result' },
    ],
    controls: [
      { id: 'factor', type: 'slider', label: 'Factor', default: 0.1, props: { min: 0.01, max: 1, step: 0.01 } },
    ],
  })

  nodesStore.register({
    id: 'select',
    name: 'Select',
    version: '1.0.0',
    category: 'logic',
    description: 'Select one of multiple inputs by index',
    icon: 'list',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'index', type: 'number', label: 'Index' },
      { id: 'a', type: 'any', label: 'A' },
      { id: 'b', type: 'any', label: 'B' },
      { id: 'c', type: 'any', label: 'C' },
      { id: 'd', type: 'any', label: 'D' },
    ],
    outputs: [
      { id: 'result', type: 'any', label: 'Result' },
    ],
    controls: [],
  })

  // ============================================================================
  // Subflow Nodes (Internal - used inside subflows)
  // ============================================================================

  nodesStore.register({
    id: 'subflow-input',
    name: 'Subflow Input',
    version: '1.0.0',
    category: 'subflows',
    description: 'Input port for a subflow',
    icon: 'log-in',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [
      { id: 'value', type: 'any', label: 'Value' },
    ],
    controls: [
      { id: 'portName', type: 'text', label: 'Port Name', default: 'input' },
      { id: 'portType', type: 'select', label: 'Type', default: 'any', props: { options: ['any', 'number', 'string', 'boolean', 'trigger', 'audio', 'texture', 'data'] } },
      { id: 'defaultValue', type: 'text', label: 'Default', default: '' },
    ],
  })

  nodesStore.register({
    id: 'subflow-output',
    name: 'Subflow Output',
    version: '1.0.0',
    category: 'subflows',
    description: 'Output port for a subflow',
    icon: 'log-out',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'value', type: 'any', label: 'Value' },
    ],
    outputs: [],
    controls: [
      { id: 'portName', type: 'text', label: 'Port Name', default: 'output' },
      { id: 'portType', type: 'select', label: 'Type', default: 'any', props: { options: ['any', 'number', 'string', 'boolean', 'trigger', 'audio', 'texture', 'data'] } },
    ],
  })

  // Note: The 'subflow' node type is dynamically created when instantiating subflows
  // Its inputs/outputs are defined by the subflow's subflowInputs/subflowOutputs

  // ============================================================================
  // 3D Nodes
  // ============================================================================

  // Scene 3D
  nodesStore.register({
    id: 'scene-3d',
    name: 'Scene 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Container for 3D objects',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'objects', type: 'object3d', label: 'Objects', multiple: true },
    ],
    outputs: [
      { id: 'scene', type: 'scene3d', label: 'Scene' },
    ],
    controls: [
      { id: 'backgroundColor', type: 'color', label: 'Background', default: '#000000' },
      { id: 'showGrid', type: 'toggle', label: 'Show Grid', default: false },
    ],
  })

  // Camera 3D
  nodesStore.register({
    id: 'camera-3d',
    name: 'Camera 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Perspective or orthographic camera',
    icon: 'camera',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
      { id: 'targetX', type: 'number', label: 'Target X' },
      { id: 'targetY', type: 'number', label: 'Target Y' },
      { id: 'targetZ', type: 'number', label: 'Target Z' },
    ],
    outputs: [
      { id: 'camera', type: 'camera3d', label: 'Camera' },
    ],
    controls: [
      { id: 'type', type: 'select', label: 'Type', default: 'perspective', props: { options: ['perspective', 'orthographic'] } },
      { id: 'fov', type: 'number', label: 'FOV', default: 50, props: { min: 10, max: 120 } },
      { id: 'near', type: 'number', label: 'Near', default: 0.1 },
      { id: 'far', type: 'number', label: 'Far', default: 1000 },
      { id: 'orthoSize', type: 'number', label: 'Ortho Size', default: 5 },
      { id: 'posX', type: 'number', label: 'Position X', default: 0 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 2 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 5 },
      { id: 'targetX', type: 'number', label: 'Target X', default: 0 },
      { id: 'targetY', type: 'number', label: 'Target Y', default: 0 },
      { id: 'targetZ', type: 'number', label: 'Target Z', default: 0 },
    ],
  })

  // Render 3D
  nodesStore.register({
    id: 'render-3d',
    name: 'Render 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Render 3D scene to texture',
    icon: 'image',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'scene', type: 'scene3d', label: 'Scene', required: true },
      { id: 'camera', type: 'camera3d', label: 'Camera', required: true },
    ],
    outputs: [
      { id: 'texture', type: 'texture', label: 'Texture' },
      { id: 'depth', type: 'texture', label: 'Depth' },
    ],
    controls: [
      { id: 'width', type: 'number', label: 'Width', default: 512, props: { min: 64, max: 2048 } },
      { id: 'height', type: 'number', label: 'Height', default: 512, props: { min: 64, max: 2048 } },
      { id: 'includeDepth', type: 'toggle', label: 'Include Depth', default: false },
    ],
  })

  // Box 3D
  nodesStore.register({
    id: 'box-3d',
    name: 'Box 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Create a box/cube mesh',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'width', type: 'number', label: 'Width' },
      { id: 'height', type: 'number', label: 'Height' },
      { id: 'depth', type: 'number', label: 'Depth' },
      { id: 'material', type: 'material3d', label: 'Material' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'width', type: 'number', label: 'Width', default: 1 },
      { id: 'height', type: 'number', label: 'Height', default: 1 },
      { id: 'depth', type: 'number', label: 'Depth', default: 1 },
      { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    ],
  })

  // Sphere 3D
  nodesStore.register({
    id: 'sphere-3d',
    name: 'Sphere 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Create a sphere mesh',
    icon: 'circle',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'radius', type: 'number', label: 'Radius' },
      { id: 'material', type: 'material3d', label: 'Material' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'radius', type: 'number', label: 'Radius', default: 0.5 },
      { id: 'widthSegments', type: 'number', label: 'Width Segs', default: 32, props: { min: 3, max: 64 } },
      { id: 'heightSegments', type: 'number', label: 'Height Segs', default: 16, props: { min: 2, max: 32 } },
      { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    ],
  })

  // Plane 3D
  nodesStore.register({
    id: 'plane-3d',
    name: 'Plane 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Create a plane mesh',
    icon: 'square',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'width', type: 'number', label: 'Width' },
      { id: 'height', type: 'number', label: 'Height' },
      { id: 'material', type: 'material3d', label: 'Material' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'width', type: 'number', label: 'Width', default: 1 },
      { id: 'height', type: 'number', label: 'Height', default: 1 },
      { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    ],
  })

  // Cylinder 3D
  nodesStore.register({
    id: 'cylinder-3d',
    name: 'Cylinder 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Create a cylinder mesh',
    icon: 'cylinder',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'radiusTop', type: 'number', label: 'Radius Top' },
      { id: 'radiusBottom', type: 'number', label: 'Radius Bottom' },
      { id: 'height', type: 'number', label: 'Height' },
      { id: 'material', type: 'material3d', label: 'Material' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'radiusTop', type: 'number', label: 'Radius Top', default: 0.5 },
      { id: 'radiusBottom', type: 'number', label: 'Radius Bottom', default: 0.5 },
      { id: 'height', type: 'number', label: 'Height', default: 1 },
      { id: 'radialSegments', type: 'number', label: 'Segments', default: 32, props: { min: 3, max: 64 } },
      { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    ],
  })

  // Torus 3D
  nodesStore.register({
    id: 'torus-3d',
    name: 'Torus 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Create a torus (donut) mesh',
    icon: 'circle-dot',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'radius', type: 'number', label: 'Radius' },
      { id: 'tube', type: 'number', label: 'Tube' },
      { id: 'material', type: 'material3d', label: 'Material' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'radius', type: 'number', label: 'Radius', default: 0.5 },
      { id: 'tube', type: 'number', label: 'Tube', default: 0.2 },
      { id: 'radialSegments', type: 'number', label: 'Radial Segs', default: 16, props: { min: 2, max: 32 } },
      { id: 'tubularSegments', type: 'number', label: 'Tubular Segs', default: 100, props: { min: 3, max: 200 } },
      { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    ],
  })

  // Transform 3D
  nodesStore.register({
    id: 'transform-3d',
    name: 'Transform 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Apply position, rotation, and scale',
    icon: 'move-3d',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'object', type: 'object3d', label: 'Object', required: true },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
      { id: 'rotX', type: 'number', label: 'Rot X' },
      { id: 'rotY', type: 'number', label: 'Rot Y' },
      { id: 'rotZ', type: 'number', label: 'Rot Z' },
      { id: 'scaleX', type: 'number', label: 'Scale X' },
      { id: 'scaleY', type: 'number', label: 'Scale Y' },
      { id: 'scaleZ', type: 'number', label: 'Scale Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
      { id: 'transform', type: 'transform3d', label: 'Transform' },
    ],
    controls: [
      { id: 'posX', type: 'number', label: 'Position X', default: 0 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 0 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
      { id: 'rotX', type: 'number', label: 'Rotation X', default: 0 },
      { id: 'rotY', type: 'number', label: 'Rotation Y', default: 0 },
      { id: 'rotZ', type: 'number', label: 'Rotation Z', default: 0 },
      { id: 'scaleX', type: 'number', label: 'Scale X', default: 1 },
      { id: 'scaleY', type: 'number', label: 'Scale Y', default: 1 },
      { id: 'scaleZ', type: 'number', label: 'Scale Z', default: 1 },
    ],
  })

  // Material 3D
  nodesStore.register({
    id: 'material-3d',
    name: 'Material 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Create a PBR material',
    icon: 'palette',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'colorMap', type: 'texture', label: 'Color Map' },
      { id: 'normalMap', type: 'texture', label: 'Normal Map' },
      { id: 'roughnessMap', type: 'texture', label: 'Roughness Map' },
      { id: 'metalnessMap', type: 'texture', label: 'Metalness Map' },
      { id: 'metalness', type: 'number', label: 'Metalness' },
      { id: 'roughness', type: 'number', label: 'Roughness' },
      { id: 'opacity', type: 'number', label: 'Opacity' },
    ],
    outputs: [
      { id: 'material', type: 'material3d', label: 'Material' },
    ],
    controls: [
      { id: 'type', type: 'select', label: 'Type', default: 'standard', props: { options: ['standard', 'basic', 'phong', 'physical'] } },
      { id: 'color', type: 'color', label: 'Color', default: '#808080' },
      { id: 'metalness', type: 'slider', label: 'Metalness', default: 0, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'roughness', type: 'slider', label: 'Roughness', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'opacity', type: 'slider', label: 'Opacity', default: 1, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'wireframe', type: 'toggle', label: 'Wireframe', default: false },
      { id: 'side', type: 'select', label: 'Side', default: 'front', props: { options: ['front', 'back', 'double'] } },
      { id: 'emissive', type: 'color', label: 'Emissive', default: '#000000' },
      { id: 'emissiveIntensity', type: 'number', label: 'Emissive Int.', default: 0, props: { min: 0, max: 10 } },
    ],
  })

  // Group 3D
  nodesStore.register({
    id: 'group-3d',
    name: 'Group 3D',
    version: '1.0.0',
    category: '3d',
    description: 'Combine multiple objects into a group',
    icon: 'layers',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'objects', type: 'object3d', label: 'Objects', multiple: true },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'posX', type: 'number', label: 'Position X', default: 0 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 0 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
    ],
  })

  // Ambient Light 3D
  nodesStore.register({
    id: 'ambient-light-3d',
    name: 'Ambient Light',
    version: '1.0.0',
    category: '3d',
    description: 'Uniform lighting from all directions',
    icon: 'sun',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'intensity', type: 'number', label: 'Intensity' },
    ],
    outputs: [
      { id: 'light', type: 'light3d', label: 'Light' },
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
      { id: 'intensity', type: 'slider', label: 'Intensity', default: 0.5, props: { min: 0, max: 2, step: 0.01 } },
    ],
  })

  // Directional Light 3D
  nodesStore.register({
    id: 'directional-light-3d',
    name: 'Directional Light',
    version: '1.0.0',
    category: '3d',
    description: 'Light from a specific direction (like sun)',
    icon: 'sun-dim',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'intensity', type: 'number', label: 'Intensity' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'light', type: 'light3d', label: 'Light' },
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
      { id: 'intensity', type: 'slider', label: 'Intensity', default: 1, props: { min: 0, max: 5, step: 0.01 } },
      { id: 'posX', type: 'number', label: 'Position X', default: 5 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 5 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 5 },
      { id: 'castShadow', type: 'toggle', label: 'Cast Shadow', default: true },
    ],
  })

  // Point Light 3D
  nodesStore.register({
    id: 'point-light-3d',
    name: 'Point Light',
    version: '1.0.0',
    category: '3d',
    description: 'Light that radiates in all directions from a point',
    icon: 'lightbulb',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'intensity', type: 'number', label: 'Intensity' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'light', type: 'light3d', label: 'Light' },
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
      { id: 'intensity', type: 'slider', label: 'Intensity', default: 1, props: { min: 0, max: 5, step: 0.01 } },
      { id: 'distance', type: 'number', label: 'Distance', default: 0, props: { min: 0 } },
      { id: 'decay', type: 'number', label: 'Decay', default: 2, props: { min: 0, max: 5 } },
      { id: 'posX', type: 'number', label: 'Position X', default: 0 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 2 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
      { id: 'castShadow', type: 'toggle', label: 'Cast Shadow', default: false },
    ],
  })

  // Spot Light 3D
  nodesStore.register({
    id: 'spot-light-3d',
    name: 'Spot Light',
    version: '1.0.0',
    category: '3d',
    description: 'Cone-shaped light like a spotlight',
    icon: 'flashlight',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'intensity', type: 'number', label: 'Intensity' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'light', type: 'light3d', label: 'Light' },
      { id: 'object', type: 'object3d', label: 'Object' },
    ],
    controls: [
      { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
      { id: 'intensity', type: 'slider', label: 'Intensity', default: 1, props: { min: 0, max: 5, step: 0.01 } },
      { id: 'distance', type: 'number', label: 'Distance', default: 0, props: { min: 0 } },
      { id: 'angle', type: 'slider', label: 'Angle', default: 30, props: { min: 1, max: 90, step: 1 } },
      { id: 'penumbra', type: 'slider', label: 'Penumbra', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
      { id: 'decay', type: 'number', label: 'Decay', default: 2, props: { min: 0, max: 5 } },
      { id: 'posX', type: 'number', label: 'Position X', default: 0 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 5 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
      { id: 'targetX', type: 'number', label: 'Target X', default: 0 },
      { id: 'targetY', type: 'number', label: 'Target Y', default: 0 },
      { id: 'targetZ', type: 'number', label: 'Target Z', default: 0 },
      { id: 'castShadow', type: 'toggle', label: 'Cast Shadow', default: true },
    ],
  })

  // GLTF Loader
  nodesStore.register({
    id: 'gltf-loader',
    name: 'GLTF Loader',
    version: '1.0.0',
    category: '3d',
    description: 'Load 3D models in GLTF/GLB format',
    icon: 'file-box',
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'url', type: 'string', label: 'URL' },
      { id: 'posX', type: 'number', label: 'Pos X' },
      { id: 'posY', type: 'number', label: 'Pos Y' },
      { id: 'posZ', type: 'number', label: 'Pos Z' },
    ],
    outputs: [
      { id: 'object', type: 'object3d', label: 'Object' },
      { id: 'loading', type: 'boolean', label: 'Loading' },
      { id: 'error', type: 'string', label: 'Error' },
    ],
    controls: [
      { id: 'url', type: 'text', label: 'URL', default: '' },
      { id: 'posX', type: 'number', label: 'Position X', default: 0 },
      { id: 'posY', type: 'number', label: 'Position Y', default: 0 },
      { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
      { id: 'scale', type: 'number', label: 'Scale', default: 1, props: { min: 0.001, max: 100 } },
    ],
  })
}

// Handle connections
onConnect((connection: Connection) => {
  addEdges([connection])
  if (flowsStore.activeFlow) {
    flowsStore.addEdge(
      connection.source,
      connection.sourceHandle ?? '',
      connection.target,
      connection.targetHandle ?? ''
    )
  }
})

// Handle node drag
onNodeDragStop(({ node }) => {
  flowsStore.updateNodePosition(node.id, node.position)
})

// Handle drop from sidebar
function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/clasp-node')
  if (!nodeType) return

  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return

  // Get drop position in flow coordinates
  const { left, top } = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = project({
    x: event.clientX - left,
    y: event.clientY - top,
  })

  // Record history before adding node
  const before = startBatch()

  // Add node
  flowsStore.addNode(nodeType, position, {
    label: definition.name,
    nodeType: nodeType,
    definition: definition,
  })

  endBatch(before, `Add ${definition.name} node`)
}

// Sync zoom with UI store
watch(
  () => uiStore.zoom,
  (zoom) => {
    const viewport = getViewport()
    setViewport({ ...viewport, zoom })
  }
)

// Fit view on pane ready
onPaneReady(() => {
  if (flowsStore.activeNodes.length > 0) {
    fitView({ padding: 0.2 })
  }
})

// Watch for selection changes from Vue Flow
watch(
  () => vueFlow.getSelectedNodes.value,
  (nodes) => {
    const selectedIds = nodes.map(n => n.id)
    uiStore.selectNodes(selectedIds)

    // Set inspected node to first selected (or clear if none)
    if (selectedIds.length === 1) {
      uiStore.setInspectedNode(selectedIds[0])
    } else if (selectedIds.length === 0) {
      uiStore.setInspectedNode(null)
    }
  }
)

// Handle pane click (clear selection)
onPaneClick(() => {
  uiStore.clearSelection()
  uiStore.setInspectedNode(null)
})

// Handle node click for inspection
onNodeClick(({ node, event }) => {
  // If not holding shift, inspect this node
  if (!event.shiftKey) {
    uiStore.setInspectedNode(node.id)
  }
})

// Handle node changes (including deletion)
function onNodesChange(changes: NodeChange[]) {
  const removals = changes.filter(c => c.type === 'remove')

  if (removals.length > 0) {
    // Record history before deletion
    const before = startBatch()

    for (const change of removals) {
      // Node was deleted, sync with our store
      flowsStore.removeNode(change.id)
      uiStore.removeFromSelection(change.id)
      if (uiStore.inspectedNode === change.id) {
        uiStore.setInspectedNode(null)
      }
    }

    endBatch(before, `Delete ${removals.length} node${removals.length > 1 ? 's' : ''}`)
  }
}

// Keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  // Ignore if typing in an input
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? event.metaKey : event.ctrlKey

  // Undo: Ctrl/Cmd + Z
  if (modifier && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    if (canUndo.value) {
      undo()
    }
    return
  }

  // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
  if ((modifier && event.key === 'z' && event.shiftKey) || (modifier && event.key === 'y')) {
    event.preventDefault()
    if (canRedo.value) {
      redo()
    }
    return
  }

  // Select All: Ctrl/Cmd + A
  if (modifier && event.key === 'a') {
    event.preventDefault()
    const allNodeIds = flowsStore.activeNodes.map(n => n.id)
    uiStore.selectNodes(allNodeIds)
    // Also select in Vue Flow
    flowsStore.activeNodes.forEach(n => {
      (n as { selected?: boolean }).selected = true
    })
    return
  }

  // Copy: Ctrl/Cmd + C
  if (modifier && event.key === 'c') {
    event.preventDefault()
    copySelectedNodes()
    return
  }

  // Cut: Ctrl/Cmd + X
  if (modifier && event.key === 'x') {
    event.preventDefault()
    cutSelectedNodes()
    return
  }

  // Paste: Ctrl/Cmd + V
  if (modifier && event.key === 'v') {
    event.preventDefault()
    pasteNodes()
    return
  }

  // Duplicate: Ctrl/Cmd + D
  if (modifier && event.key === 'd') {
    event.preventDefault()
    duplicateSelectedNodes()
    return
  }

  // Create Subflow from Selection: Ctrl/Cmd + G
  if (modifier && event.key === 'g') {
    event.preventDefault()
    createSubflowFromSelection()
    return
  }

  // Edit Subflow: Ctrl/Cmd + E (when a subflow instance is selected)
  if (modifier && event.key === 'e') {
    event.preventDefault()
    editSelectedSubflow()
    return
  }

  // Unpack Subflow: Ctrl/Cmd + Shift + G
  if (modifier && event.shiftKey && event.key === 'G') {
    event.preventDefault()
    unpackSelectedSubflow()
    return
  }

  // Delete selected nodes/edges: Delete or Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelected()
    return
  }
}

/**
 * Delete selected nodes and edges
 */
function deleteSelected() {
  const selectedNodeIds = uiStore.selectedNodes
  const selectedEdges = getSelectedEdges.value
  const selectedEdgeIds = selectedEdges.map(e => e.id)

  // Nothing selected
  if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return

  // Remove nodes from flow
  if (selectedNodeIds.length > 0) {
    flowsStore.removeNodes(selectedNodeIds)

    // Clean up exposed controls for deleted nodes
    const remainingNodeIds = flowsStore.activeNodes.map(n => n.id)
    uiStore.cleanupExposedControls(remainingNodeIds)

    // Clear selection
    uiStore.clearSelection()

    // Clear inspected node if it was deleted
    if (uiStore.inspectedNode && selectedNodeIds.includes(uiStore.inspectedNode)) {
      uiStore.setInspectedNode(null)
    }
  }

  // Remove selected edges
  if (selectedEdgeIds.length > 0) {
    flowsStore.removeEdges(selectedEdgeIds)
  }
}

/**
 * Copy selected nodes to clipboard
 */
function copySelectedNodes() {
  const selectedNodes = flowsStore.activeNodes.filter(n =>
    uiStore.selectedNodes.includes(n.id)
  )

  if (selectedNodes.length === 0) return

  // Calculate bounding box for offset calculation
  const minX = Math.min(...selectedNodes.map(n => n.position.x))
  const minY = Math.min(...selectedNodes.map(n => n.position.y))

  clipboard.value = {
    nodes: selectedNodes.map(n => ({
      nodeType: n.data?.nodeType as string,
      position: {
        x: n.position.x - minX,
        y: n.position.y - minY,
      },
      data: { ...n.data },
    })),
    copyOffset: { x: 20, y: 20 }, // Offset for pasted nodes
  }
}

/**
 * Cut selected nodes (copy + delete)
 */
function cutSelectedNodes() {
  copySelectedNodes()

  if (clipboard.value && clipboard.value.nodes.length > 0) {
    const before = startBatch()

    const nodeIds = uiStore.selectedNodes.slice()
    flowsStore.removeNodes(nodeIds)
    uiStore.clearSelection()

    endBatch(before, `Cut ${nodeIds.length} node${nodeIds.length > 1 ? 's' : ''}`)
  }
}

/**
 * Paste nodes from clipboard
 */
function pasteNodes() {
  if (!clipboard.value || clipboard.value.nodes.length === 0) return

  const before = startBatch()
  const newNodeIds: string[] = []

  // Get paste position (center of viewport or offset from original)
  const viewport = getViewport()
  const baseX = -viewport.x / viewport.zoom + 100
  const baseY = -viewport.y / viewport.zoom + 100

  for (const nodeData of clipboard.value.nodes) {
    const definition = nodesStore.getDefinition(nodeData.nodeType)
    if (!definition) continue

    const position = {
      x: baseX + nodeData.position.x + clipboard.value.copyOffset.x,
      y: baseY + nodeData.position.y + clipboard.value.copyOffset.y,
    }

    const node = flowsStore.addNode(nodeData.nodeType, position, {
      ...nodeData.data,
      label: definition.name,
      nodeType: nodeData.nodeType,
      definition: definition,
    })

    if (node) {
      newNodeIds.push(node.id)
    }
  }

  // Increase offset for next paste
  clipboard.value.copyOffset.x += 20
  clipboard.value.copyOffset.y += 20

  // Select pasted nodes
  uiStore.selectNodes(newNodeIds)
  flowsStore.activeNodes.forEach(n => {
    (n as { selected?: boolean }).selected = newNodeIds.includes(n.id)
  })

  endBatch(before, `Paste ${newNodeIds.length} node${newNodeIds.length > 1 ? 's' : ''}`)
}

/**
 * Duplicate selected nodes in place
 */
function duplicateSelectedNodes() {
  const selectedNodes = flowsStore.activeNodes.filter(n =>
    uiStore.selectedNodes.includes(n.id)
  )

  if (selectedNodes.length === 0) return

  const before = startBatch()
  const newNodeIds: string[] = []

  for (const sourceNode of selectedNodes) {
    const nodeType = sourceNode.data?.nodeType as string
    const definition = nodesStore.getDefinition(nodeType)
    if (!definition) continue

    const position = {
      x: sourceNode.position.x + 20,
      y: sourceNode.position.y + 20,
    }

    const node = flowsStore.addNode(nodeType, position, {
      ...sourceNode.data,
      label: definition.name,
      nodeType: nodeType,
      definition: definition,
    })

    if (node) {
      newNodeIds.push(node.id)
    }
  }

  // Select duplicated nodes
  uiStore.selectNodes(newNodeIds)
  flowsStore.activeNodes.forEach(n => {
    (n as { selected?: boolean }).selected = newNodeIds.includes(n.id)
  })

  endBatch(before, `Duplicate ${newNodeIds.length} node${newNodeIds.length > 1 ? 's' : ''}`)
}

/**
 * Create a subflow from selected nodes
 */
function createSubflowFromSelection() {
  const selectedNodeIds = uiStore.selectedNodes
  if (selectedNodeIds.length < 1) {
    showConnectionError('Select at least one node to create a subflow')
    return
  }

  // Prompt for subflow name
  const name = window.prompt('Enter name for the new subflow:', 'My Subflow')
  if (!name) return // User cancelled

  const before = startBatch()

  const result = flowsStore.createSubflowFromSelection(selectedNodeIds, name)

  if (result) {
    uiStore.clearSelection()
    uiStore.selectNodes([result.instanceNodeId])
    showConnectionError(`Created subflow "${name}"`) // Reusing the toast for feedback

    endBatch(before, `Create subflow "${name}"`)
  } else {
    showConnectionError('Failed to create subflow')
  }
}

/**
 * Edit the selected subflow (open it for editing)
 */
function editSelectedSubflow() {
  if (uiStore.selectedNodes.length !== 1) {
    showConnectionError('Select a single subflow instance to edit')
    return
  }

  const nodeId = uiStore.selectedNodes[0]
  const node = flowsStore.activeNodes.find(n => n.id === nodeId)

  if (!node || node.data?.nodeType !== 'subflow') {
    showConnectionError('Selected node is not a subflow')
    return
  }

  const subflowId = node.data.subflowId as string
  const subflow = flowsStore.getFlowById(subflowId)

  if (!subflow) {
    showConnectionError('Subflow not found')
    return
  }

  // Switch to the subflow for editing
  flowsStore.setActiveFlow(subflowId)
}

/**
 * Unpack a subflow instance back to its constituent nodes
 */
function unpackSelectedSubflow() {
  if (uiStore.selectedNodes.length !== 1) {
    showConnectionError('Select a single subflow instance to unpack')
    return
  }

  const nodeId = uiStore.selectedNodes[0]
  const node = flowsStore.activeNodes.find(n => n.id === nodeId)

  if (!node || node.data?.nodeType !== 'subflow') {
    showConnectionError('Selected node is not a subflow')
    return
  }

  const before = startBatch()

  const newNodeIds = flowsStore.unpackSubflowInstance(nodeId)

  if (newNodeIds && newNodeIds.length > 0) {
    uiStore.clearSelection()
    uiStore.selectNodes(newNodeIds)
    flowsStore.activeNodes.forEach(n => {
      (n as { selected?: boolean }).selected = newNodeIds.includes(n.id)
    })

    endBatch(before, `Unpack subflow`)
  } else {
    showConnectionError('Failed to unpack subflow')
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)

  // Initialize custom node loader (loads custom nodes from custom-nodes folder)
  try {
    const customNodeLoader = getCustomNodeLoader()
    await customNodeLoader.initialize()

    // Log any load errors
    const errors = customNodeLoader.getLoadErrors()
    if (errors.length > 0) {
      console.warn('Custom node load errors:', errors)
    }
  } catch (error) {
    console.error('Failed to initialize custom node loader:', error)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="editor-view">
    <VueFlow
      v-if="flowsStore.activeFlow"
      v-model:nodes="flowsStore.activeFlow.nodes"
      v-model:edges="flowsStore.activeFlow.edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :default-edge-options="{
        type: 'animated',
      }"
      :is-valid-connection="isValidConnection"
      :snap-to-grid="uiStore.snapToGrid"
      :snap-grid="[uiStore.gridSize, uiStore.gridSize]"
      :connection-line-style="{ stroke: 'var(--color-primary-400)', strokeWidth: 2 }"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :delete-key-code="'Delete'"
      :edges-updatable="true"
      :selectable-edges="true"
      fit-view-on-init
      class="flow-canvas"
      @dragover="onDragOver"
      @drop="onDrop"
      @nodes-change="onNodesChange"
    >
      <Background
        v-if="uiStore.showGrid"
        :gap="uiStore.gridSize"
        :size="1"
        pattern-color="var(--color-neutral-300)"
      />

      <Controls
        position="bottom-right"
        :show-zoom="true"
        :show-fit-view="true"
        :show-interactive="false"
      />

      <MiniMap
        v-if="uiStore.showMinimap"
        position="bottom-right"
        :style="{ marginBottom: '50px' }"
        :pannable="true"
        :zoomable="true"
        :node-color="getNodeMinimapColor"
      />

      <Panel position="top-right" class="canvas-panel">
        <div class="panel-info">
          <span>{{ flowsStore.activeNodes.length }} nodes</span>
          <span>{{ flowsStore.activeEdges.length }} connections</span>
        </div>
      </Panel>
    </VueFlow>

    <!-- Empty state -->
    <div
      v-if="flowsStore.activeNodes.length === 0"
      class="empty-state"
    >
      <p>Drag nodes from the sidebar to get started</p>
    </div>

    <!-- Connection error toast -->
    <Transition name="toast">
      <div v-if="connectionError" class="connection-error">
        {{ connectionError }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.editor-view {
  width: 100%;
  height: 100%;
  position: relative;
}

.flow-canvas {
  width: 100%;
  height: 100%;
  background: var(--canvas-background);
}

/* Override Vue Flow styles */
.flow-canvas :deep(.vue-flow__background) {
  background: var(--canvas-background);
}

.flow-canvas :deep(.vue-flow__controls) {
  box-shadow: var(--shadow-subtle);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-none);
}

.flow-canvas :deep(.vue-flow__controls-button) {
  background: var(--color-neutral-0);
  border: none;
  border-bottom: 1px solid var(--color-neutral-200);
}

.flow-canvas :deep(.vue-flow__controls-button:hover) {
  background: var(--color-neutral-100);
}

.flow-canvas :deep(.vue-flow__minimap) {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-none);
  box-shadow: var(--shadow-subtle);
}

.canvas-panel {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.panel-info {
  display: flex;
  gap: var(--space-4);
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-neutral-400);
  font-size: var(--font-size-base);
  pointer-events: none;
}

.connection-error {
  position: absolute;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-error);
  color: var(--color-neutral-0);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-offset);
  z-index: 100;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
