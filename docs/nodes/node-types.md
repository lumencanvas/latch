# Node Type Definitions

> Complete reference for LATCH's node system type definitions, registration patterns, and architecture.

## Table of Contents

- [Core Interfaces](#core-interfaces)
- [Data Types](#data-types)
- [Port Definitions](#port-definitions)
- [Control Definitions](#control-definitions)
- [Node Definition Structure](#node-definition-structure)
- [Registration System](#registration-system)
- [Component Architecture](#component-architecture)
- [Custom UI Patterns](#custom-ui-patterns)
- [Dynamic Ports and Controls](#dynamic-ports-and-controls)

---

## Core Interfaces

### NodeDefinition

The primary interface for defining a node. Located in `src/renderer/stores/nodes.ts`.

```typescript
interface NodeDefinition {
  id: string                    // Unique identifier (e.g., 'oscillator', 'shader')
  name: string                  // Display name (e.g., 'Oscillator', 'Shader')
  version: string               // Semver version (e.g., '1.0.0')
  category: NodeCategory        // Category for palette organization
  description: string           // Brief description shown in palette
  icon: string                  // Lucide icon name (e.g., 'waves', 'code')
  color?: string               // Optional custom color (hex)
  platforms: Platform[]         // Supported platforms: ['web', 'electron']
  webFallback?: string         // Fallback node ID for web-only features
  inputs: PortDefinition[]      // Input port definitions
  outputs: PortDefinition[]     // Output port definitions
  controls: ControlDefinition[] // Inline control definitions
  tags?: string[]              // Search tags
  connections?: NodeConnectionRequirement[]  // Required protocol connections
  info?: NodeInfo              // Educational info (overview, tips, pairsWith)
}
```

### NodeCategory

Categories for organizing nodes in the palette.

```typescript
type NodeCategory =
  | 'debug'        // Debugging and visualization
  | 'inputs'       // User input controls
  | 'outputs'      // Final output destinations
  | 'timing'       // Time-based nodes
  | 'math'         // Mathematical operations
  | 'logic'        // Boolean logic
  | 'audio'        // Audio synthesis/processing
  | 'video'        // Video processing
  | 'visual'       // Image/texture/shader
  | 'shaders'      // (Subset of visual)
  | 'data'         // Data manipulation
  | 'ai'           // Machine learning
  | 'code'         // Custom code
  | '3d'           // 3D rendering
  | 'connectivity' // Network/device
  | 'clasp'        // CLASP real-time protocol
  | 'subflows'     // Flow composition
  | 'string'       // String operations
  | 'messaging'    // Internal messaging
  | 'custom'       // User-defined
```

### Platform

```typescript
type Platform = 'web' | 'electron'
```

---

## Data Types

Data types define the kind of data that flows through ports. Each type has associated metadata for visualization.

```typescript
type DataType =
  // Basic types
  | 'trigger'     // One-shot event signal
  | 'number'      // Numeric value (float)
  | 'string'      // Text value
  | 'boolean'     // True/false
  | 'data'        // Arbitrary object
  | 'array'       // Array of values
  | 'any'         // Polymorphic (accepts any type)

  // Media types
  | 'audio'       // Web Audio API AudioNode
  | 'video'       // HTMLVideoElement
  | 'texture'     // WebGLTexture / Three.js Texture

  // 3D types (Three.js)
  | 'scene3d'     // THREE.Scene
  | 'object3d'    // THREE.Object3D
  | 'geometry3d'  // THREE.BufferGeometry
  | 'material3d'  // THREE.Material
  | 'camera3d'    // THREE.Camera
  | 'light3d'     // THREE.Light
  | 'transform3d' // Transform data { pos, rot, scale }
```

### Data Type Metadata

Visual metadata for each data type (colors, line styles).

```typescript
const dataTypeMeta: Record<DataType, { label: string; color: string; lineStyle: string }> = {
  trigger:    { label: 'Trigger',     color: '#F59E0B', lineStyle: 'solid' },
  number:     { label: 'Number',      color: '#2AAB8A', lineStyle: 'solid' },
  string:     { label: 'String',      color: '#8B5CF6', lineStyle: 'solid' },
  boolean:    { label: 'Boolean',     color: '#EF4444', lineStyle: 'dotted' },
  audio:      { label: 'Audio',       color: '#22C55E', lineStyle: 'solid' },
  video:      { label: 'Video',       color: '#3B82F6', lineStyle: 'solid' },
  texture:    { label: 'Texture',     color: '#EC4899', lineStyle: 'dashed' },
  data:       { label: 'Data',        color: '#6B7280', lineStyle: 'solid' },
  array:      { label: 'Array',       color: '#0EA5E9', lineStyle: 'solid' },
  any:        { label: 'Any',         color: '#D4D4D4', lineStyle: 'dotted' },
  scene3d:    { label: 'Scene 3D',    color: '#0EA5E9', lineStyle: 'solid' },
  object3d:   { label: 'Object 3D',   color: '#38BDF8', lineStyle: 'solid' },
  geometry3d: { label: 'Geometry 3D', color: '#7DD3FC', lineStyle: 'solid' },
  material3d: { label: 'Material 3D', color: '#BAE6FD', lineStyle: 'solid' },
  camera3d:   { label: 'Camera 3D',   color: '#0284C7', lineStyle: 'solid' },
  light3d:    { label: 'Light 3D',    color: '#FCD34D', lineStyle: 'solid' },
  transform3d:{ label: 'Transform 3D',color: '#A5F3FC', lineStyle: 'solid' },
}
```

---

## Port Definitions

### PortDefinition

Defines an input or output port on a node.

```typescript
interface PortDefinition {
  id: string           // Unique ID within the node (e.g., 'audio', 'frequency')
  type: DataType       // Data type this port accepts/produces
  label: string        // Display label (e.g., 'Audio', 'Freq')
  description?: string // Optional tooltip description
  required?: boolean   // If true, node won't execute without this input
  multiple?: boolean   // If true, accepts multiple connections (for arrays)
  default?: unknown    // Default value when not connected
}
```

### Example Port Definitions

```typescript
// Simple input ports
inputs: [
  { id: 'a', type: 'number', label: 'A' },
  { id: 'b', type: 'number', label: 'B' },
]

// Port with default value
inputs: [
  { id: 'frequency', type: 'number', label: 'Freq', default: 440 },
]

// Required port
inputs: [
  { id: 'audio', type: 'audio', label: 'Audio', required: true },
]

// Multiple connection port (for arrays)
inputs: [
  { id: 'objects', type: 'object3d', label: 'Objects', multiple: true },
]
```

---

## Control Definitions

### ControlDefinition

Defines an inline control within a node's body.

```typescript
interface ControlDefinition {
  id: string                      // Control ID (also key in node.data)
  type: string                    // Control type (see below)
  label: string                   // Display label
  description?: string            // Optional tooltip
  default?: unknown               // Default value
  exposable?: boolean             // Can be exposed to parent flow
  bindable?: boolean              // Can be bound to external source
  props?: Record<string, unknown> // Type-specific properties
}
```

### Control Types

| Type | Description | Props |
|------|-------------|-------|
| `number` | Numeric input | `min`, `max`, `step` |
| `slider` | Range slider | `min`, `max`, `step` |
| `toggle` | Boolean checkbox | - |
| `select` | Dropdown menu | `options` (array or object array) |
| `text` | Text input | `placeholder` |
| `color` | Color picker | - |
| `code` | Code editor | - |
| `asset-picker` | Asset selection | `assetType` |
| `data` | Hidden data storage | - |

### Control Examples

```typescript
controls: [
  // Number input
  { id: 'frequency', type: 'number', label: 'Frequency', default: 440 },

  // Slider with range
  { id: 'volume', type: 'slider', label: 'Volume', default: 0.5,
    props: { min: 0, max: 1, step: 0.01 } },

  // Toggle
  { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },

  // Select dropdown
  { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine',
    props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },

  // Select with device enumeration
  { id: 'device', type: 'select', label: 'Device', default: 'default',
    props: { deviceType: 'video-input' } },

  // Text input
  { id: 'url', type: 'text', label: 'URL', default: '',
    props: { placeholder: 'https://...' } },

  // Color picker
  { id: 'color', type: 'color', label: 'Color', default: '#808080' },

  // Code editor (opens in separate panel)
  { id: 'code', type: 'code', label: 'Code', default: 'return a + b' },

  // Exposable control (can be promoted to subflow input)
  { id: 'value', type: 'slider', label: 'Value', default: 0.5,
    exposable: true, props: { min: 0, max: 1 } },

  // Conditionally visible control (shown only when another control matches)
  { id: 'mode', type: 'select', label: 'Mode', default: 'simple',
    props: { options: ['simple', 'advanced'] } },
  { id: 'threshold', type: 'number', label: 'Threshold', default: 0.5,
    visibleWhen: { controlId: 'mode', value: 'advanced' } },
]
```

### visibleWhen

Controls can be conditionally shown based on other control values:

```typescript
interface VisibleWhen {
  controlId: string   // ID of the control to check
  value: unknown      // Value that makes this control visible
}
```

### NodeInfo

Additional educational information displayed in the Info tab of the properties panel and in the Node Explorer:

```typescript
interface NodeInfo {
  overview: string      // 2-4 sentence explanation of what this node does
  tips?: string[]       // Short, actionable tips (one sentence each)
  pairsWith?: string[]  // Node IDs of nodes that complement this one
}
```

Example:
```typescript
info: {
  overview: 'Compares two numeric values using a selectable operator and outputs a boolean result. Use this to create conditional logic in your flow.',
  tips: [
    'You can type values directly in the A and B controls without wiring constants.',
    'Feed the boolean result into a Gate or Switch node for conditional routing.',
  ],
  pairsWith: ['gate', 'switch', 'equals', 'in-range'],
}
```

### NodeConnectionRequirement

Declares that a node requires a specific protocol connection to function:

```typescript
interface NodeConnectionRequirement {
  protocol: string     // Protocol identifier (e.g., 'clasp', 'mqtt', 'osc')
  description?: string // Human-readable description of the requirement
}
```

---

## Node Definition Structure

### Complete Example

```typescript
// src/renderer/registry/audio/oscillator.ts
import type { NodeDefinition } from '../types'

export const oscillatorNode: NodeDefinition = {
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
    { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine',
      props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },
    { id: 'volume', type: 'number', label: 'Volume (dB)', default: -6 },
  ],
}
```

---

## Registration System

### Central Registry

Located at `src/renderer/registry/index.ts`.

```typescript
import { useNodesStore } from '@/stores/nodes'
import { inputNodes } from './inputs'
import { audioNodes } from './audio'
// ... other category imports

export const allNodes = [
  ...inputNodes,
  ...audioNodes,
  // ... all category arrays
]

export function initializeNodeRegistry() {
  const nodesStore = useNodesStore()
  for (const node of allNodes) {
    nodesStore.register(node)
  }
  console.log(`[Registry] Registered ${allNodes.length} nodes`)
}
```

### Category Index Pattern

Each category has an `index.ts` that exports:
1. Individual node definitions as named exports
2. An array of all nodes in the category

```typescript
// src/renderer/registry/audio/index.ts
export { oscillatorNode } from './oscillator'
export { gainNode } from './gain'
// ...

import { oscillatorNode } from './oscillator'
import { gainNode } from './gain'
// ...
import type { NodeDefinition } from '../types'

export const audioNodes: NodeDefinition[] = [
  oscillatorNode,
  gainNode,
  // ...
]
```

### NodesStore

The Pinia store that manages node registrations.

```typescript
// src/renderer/stores/nodes.ts
export const useNodesStore = defineStore('nodes', {
  state: () => ({
    definitions: new Map<string, NodeDefinition>(),
    components: new Map<string, Component>(),
    searchQuery: '',
    categoryFilter: null,
  }),

  actions: {
    register(definition: NodeDefinition, component?: Component) {
      this.definitions.set(definition.id, definition)
      if (component) {
        this.components.set(definition.id, component)
      }
    },
    unregister(id: string) { /* ... */ },
  },

  getters: {
    byCategory(): Map<NodeCategory, NodeDefinition[]> { /* ... */ },
    getDefinition: (state) => (id: string) => state.definitions.get(id),
    getComponent: (state) => (id: string) => state.components.get(id),
  }
})
```

---

## Component Architecture

### BaseNode

Most nodes use the default `BaseNode.vue` component which handles:
- Port rendering (handles on left/right edges)
- Control rendering (inline sliders, dropdowns, etc.)
- Texture preview (for visual nodes)
- Collapsible UI
- Label editing
- Category-based styling

Located at `src/renderer/components/nodes/BaseNode.vue`.

### Component Registry

Custom UI components are mapped in `src/renderer/registry/components.ts`:

```typescript
import { markRaw } from 'vue'
import BaseNode from '@/components/nodes/BaseNode.vue'
import { TriggerNode } from './inputs/trigger'
import { MonitorNode } from './debug/monitor'
// ...

export const nodeTypes = {
  default: markRaw(BaseNode),
  custom: markRaw(BaseNode),

  // Custom UI nodes
  trigger: markRaw(TriggerNode),
  monitor: markRaw(MonitorNode),
  oscilloscope: markRaw(OscilloscopeNode),
  // ...
}
```

---

## Custom UI Patterns

### File Structure

Custom UI nodes have a folder structure:

```
registry/inputs/trigger/
├── definition.ts    # NodeDefinition export
├── TriggerNode.vue  # Custom Vue component
└── index.ts         # Exports both
```

### index.ts Pattern

```typescript
// Export definition and component together
export { triggerNode } from './definition'
export { default as TriggerNode } from './TriggerNode.vue'
```

### Custom Component Structure

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { NodeProps, Handle, Position } from '@vue-flow/core'
import { useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const nodesStore = useNodesStore()
const flowsStore = useFlowsStore()

const definition = computed(() =>
  nodesStore.getDefinition(props.data?.nodeType as string)
)

function updateValue(value: unknown) {
  flowsStore.updateNodeData(props.id, { value })
}
</script>

<template>
  <div class="custom-node">
    <!-- Custom UI here -->
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </div>
</template>
```

---

## Dynamic Ports and Controls

Some nodes generate ports/controls dynamically based on configuration (e.g., Shader node).

### Dynamic Inputs

Stored in `node.data._dynamicInputs`:

```typescript
// In executor or node logic
flowsStore.updateNodeData(nodeId, {
  _dynamicInputs: [
    { id: 'u_brightness', type: 'number', label: 'Brightness' },
    { id: 'u_color', type: 'data', label: 'Color' },
  ]
})
```

### Dynamic Controls

Stored in `node.data._dynamicControls`:

```typescript
flowsStore.updateNodeData(nodeId, {
  _dynamicControls: [
    { id: 'u_brightness', type: 'slider', label: 'Brightness',
      default: 1, props: { min: 0, max: 2 } },
  ]
})
```

### Dynamic Outputs

Stored in `node.data._dynamicOutputs`:

```typescript
flowsStore.updateNodeData(nodeId, {
  _dynamicOutputs: [
    { id: 'out-0', type: 'any', label: '→ 1' },
    { id: 'out-1', type: 'any', label: '→ 2' },
  ]
})
```

This is used by the Dispatch node to create/remove output ports as conditions are added or removed.

### Merging in BaseNode

BaseNode merges static and dynamic ports at render time. The same pattern is used for inputs, outputs, and controls:

```typescript
const inputs = computed(() => {
  const staticInputs = definition.value?.inputs ?? []
  const dynamicInputs = (props.data?._dynamicInputs as PortDefinition[]) ?? []

  const staticIds = new Set(staticInputs.map(i => i.id))
  const mergedDynamic = dynamicInputs.filter(d => !staticIds.has(d.id))

  return [...staticInputs, ...mergedDynamic]
})

// Same pattern for outputs
const outputs = computed(() => {
  const staticOutputs = definition.value?.outputs ?? []
  const dynamicOutputs = (props.data?._dynamicOutputs as PortDefinition[]) ?? []

  const staticIds = new Set(staticOutputs.map(o => o.id))
  const mergedDynamic = dynamicOutputs.filter(d => !staticIds.has(d.id))

  return [...staticOutputs, ...mergedDynamic]
})
```

### Setting Dynamic Ports from Executors

Executors can signal dynamic port changes by returning special keys (`_dynamicInputs`, `_dynamicOutputs`, `_dynamicControls`) in their output map. The execution engine's `handleSpecialOutputs()` method detects these keys and updates `node.data` accordingly.

---

## Category Metadata

UI metadata for category display.

```typescript
const categoryMeta: Record<NodeCategory, { label: string; icon: string; color: string }> = {
  debug:        { label: 'Debug',       icon: 'bug',        color: '#8B5CF6' },
  inputs:       { label: 'Inputs',      icon: 'download',   color: '#22C55E' },
  outputs:      { label: 'Outputs',     icon: 'upload',     color: '#3B82F6' },
  timing:       { label: 'Timing',      icon: 'clock',      color: '#F97316' },
  math:         { label: 'Math',        icon: 'calculator', color: '#F59E0B' },
  logic:        { label: 'Logic',       icon: 'git-branch', color: '#EF4444' },
  audio:        { label: 'Audio',       icon: 'music',      color: '#22C55E' },
  video:        { label: 'Video',       icon: 'video',      color: '#3B82F6' },
  visual:       { label: 'Visual',      icon: 'image',      color: '#EC4899' },
  shaders:      { label: 'Shaders',     icon: 'code',       color: '#EC4899' },
  data:         { label: 'Data',        icon: 'database',   color: '#6B7280' },
  ai:           { label: 'AI (Local)',  icon: 'brain',      color: '#A855F7' },
  code:         { label: 'Code',        icon: 'terminal',   color: '#F59E0B' },
  '3d':         { label: '3D',          icon: 'box',        color: '#0EA5E9' },
  connectivity: { label: 'Connectivity',icon: 'plug',       color: '#2AAB8A' },
  clasp:        { label: 'CLASP',       icon: 'radio',      color: '#6366F1' },
  subflows:     { label: 'Subflows',    icon: 'layers',     color: '#7C3AED' },
  string:       { label: 'String',      icon: 'text',       color: '#10B981' },
  messaging:    { label: 'Messaging',   icon: 'send',       color: '#8B5CF6' },
  custom:       { label: 'Custom',      icon: 'puzzle',     color: '#6B7280' },
}
```

---

## Key File Locations

| Aspect | Location |
|--------|----------|
| Type Definitions | `src/renderer/stores/nodes.ts` |
| Node Registry | `src/renderer/registry/index.ts` |
| Category Arrays | `src/renderer/registry/{category}/index.ts` |
| Individual Nodes | `src/renderer/registry/{category}/{node}.ts` |
| Custom UI Components | `src/renderer/registry/{category}/{node}/` |
| Base Node Component | `src/renderer/components/nodes/BaseNode.vue` |
| Component Registry | `src/renderer/registry/components.ts` |
| Execution Handlers | `src/renderer/engine/executors/` |
