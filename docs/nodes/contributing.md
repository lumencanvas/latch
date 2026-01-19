# Contributing Nodes

> Guide for creating new nodes in LATCH.

## Table of Contents

- [Quick Start](#quick-start)
- [File Structure](#file-structure)
- [Creating a Simple Node](#creating-a-simple-node)
- [Creating a Custom UI Node](#creating-a-custom-ui-node)
- [Node Definition Reference](#node-definition-reference)
- [Writing Executors](#writing-executors)
- [Best Practices](#best-practices)
- [Testing Your Node](#testing-your-node)

---

## Quick Start

1. Choose the appropriate category for your node
2. Create the node definition file in `src/renderer/registry/{category}/`
3. Export from the category's `index.ts`
4. Write the executor in `src/renderer/engine/executors/`
5. Test in the application

---

## File Structure

### Simple Node (BaseNode UI)

Most nodes use the default BaseNode component:

```
src/renderer/registry/{category}/
├── index.ts              # Category exports
├── your-node.ts          # Node definition
└── ...
```

### Custom UI Node

Nodes with custom interfaces need a folder:

```
src/renderer/registry/{category}/your-node/
├── index.ts              # Exports definition + component
├── definition.ts         # NodeDefinition
└── YourNode.vue          # Custom Vue component
```

---

## Creating a Simple Node

### Step 1: Create the Definition

Create `src/renderer/registry/math/lerp.ts`:

```typescript
import type { NodeDefinition } from '../types'

export const lerpNode: NodeDefinition = {
  id: 'lerp',
  name: 'Lerp',
  version: '1.0.0',
  category: 'math',
  description: 'Linear interpolation between two values',
  icon: 'git-merge',
  platforms: ['web', 'electron'],

  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 't', type: 'number', label: 'T' },
  ],

  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],

  controls: [
    { id: 'a', type: 'number', label: 'A', default: 0 },
    { id: 'b', type: 'number', label: 'B', default: 1 },
    { id: 't', type: 'slider', label: 'T', default: 0.5,
      props: { min: 0, max: 1, step: 0.01 } },
  ],
}
```

### Step 2: Export from Category Index

Add to `src/renderer/registry/math/index.ts`:

```typescript
// Add export
export { lerpNode } from './lerp'

// Add import
import { lerpNode } from './lerp'

// Add to array
export const mathNodes: NodeDefinition[] = [
  // ... existing nodes
  lerpNode,
]
```

### Step 3: Write the Executor

Add to `src/renderer/engine/executors/math.ts`:

```typescript
case 'lerp': {
  const a = getInput('a') ?? getData('a') ?? 0
  const b = getInput('b') ?? getData('b') ?? 1
  const t = getInput('t') ?? getData('t') ?? 0.5

  const result = a + (b - a) * t

  setOutput('result', result)
  break
}
```

---

## Creating a Custom UI Node

### Step 1: Create the Folder Structure

```
src/renderer/registry/inputs/color-wheel/
├── index.ts
├── definition.ts
└── ColorWheelNode.vue
```

### Step 2: Write the Definition

`definition.ts`:

```typescript
import type { NodeDefinition } from '../../types'

export const colorWheelNode: NodeDefinition = {
  id: 'color-wheel',
  name: 'Color Wheel',
  version: '1.0.0',
  category: 'inputs',
  description: 'Pick colors from a wheel interface',
  icon: 'palette',
  platforms: ['web', 'electron'],

  inputs: [],

  outputs: [
    { id: 'color', type: 'data', label: 'Color' },
    { id: 'r', type: 'number', label: 'R' },
    { id: 'g', type: 'number', label: 'G' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 'h', type: 'number', label: 'H' },
    { id: 's', type: 'number', label: 'S' },
    { id: 'l', type: 'number', label: 'L' },
  ],

  controls: [
    { id: 'hue', type: 'number', label: 'Hue', default: 0 },
    { id: 'saturation', type: 'number', label: 'Saturation', default: 1 },
    { id: 'lightness', type: 'number', label: 'Lightness', default: 0.5 },
  ],
}
```

### Step 3: Create the Vue Component

`ColorWheelNode.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

const definition = computed(() =>
  nodesStore.getDefinition(props.data?.nodeType as string)
)

const hue = computed(() => props.data?.hue ?? 0)
const saturation = computed(() => props.data?.saturation ?? 1)
const lightness = computed(() => props.data?.lightness ?? 0.5)

const colorStyle = computed(() =>
  `hsl(${hue.value * 360}, ${saturation.value * 100}%, ${lightness.value * 100}%)`
)

function updateHue(event: MouseEvent) {
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left - rect.width / 2
  const y = event.clientY - rect.top - rect.height / 2
  const angle = Math.atan2(y, x)
  const normalizedHue = (angle + Math.PI) / (2 * Math.PI)

  flowsStore.updateNodeData(props.id, { hue: normalizedHue })
}
</script>

<template>
  <div class="color-wheel-node" :class="{ selected: props.selected }">
    <div class="node-header">
      <span class="node-title">{{ definition?.name }}</span>
    </div>

    <div class="node-body">
      <div
        class="wheel"
        @click="updateHue"
      >
        <div
          class="preview"
          :style="{ backgroundColor: colorStyle }"
        />
      </div>
    </div>

    <!-- Output handles -->
    <Handle
      v-for="output in definition?.outputs"
      :key="output.id"
      type="source"
      :position="Position.Right"
      :id="output.id"
    />
  </div>
</template>

<style scoped>
.color-wheel-node {
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: 8px;
  min-width: 150px;
}

.node-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--node-border);
}

.node-body {
  padding: 12px;
}

.wheel {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: conic-gradient(
    hsl(0, 100%, 50%),
    hsl(60, 100%, 50%),
    hsl(120, 100%, 50%),
    hsl(180, 100%, 50%),
    hsl(240, 100%, 50%),
    hsl(300, 100%, 50%),
    hsl(360, 100%, 50%)
  );
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style>
```

### Step 4: Create the Index

`index.ts`:

```typescript
export { colorWheelNode } from './definition'
export { default as ColorWheelNode } from './ColorWheelNode.vue'
```

### Step 5: Register the Component

Add to `src/renderer/registry/components.ts`:

```typescript
import { ColorWheelNode } from './inputs/color-wheel'

export const nodeTypes = {
  // ... existing entries
  'color-wheel': markRaw(ColorWheelNode),
}
```

### Step 6: Export from Category

Add to `src/renderer/registry/inputs/index.ts`:

```typescript
export { colorWheelNode, ColorWheelNode } from './color-wheel'

import { colorWheelNode } from './color-wheel'

export const inputNodes: NodeDefinition[] = [
  // ... existing
  colorWheelNode,
]
```

---

## Node Definition Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (kebab-case) |
| `name` | `string` | Display name |
| `version` | `string` | Semver version |
| `category` | `NodeCategory` | Category for palette |
| `description` | `string` | Brief description |
| `icon` | `string` | Lucide icon name |
| `platforms` | `Platform[]` | `['web', 'electron']` |
| `inputs` | `PortDefinition[]` | Input ports |
| `outputs` | `PortDefinition[]` | Output ports |
| `controls` | `ControlDefinition[]` | Inline controls |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `color` | `string` | Custom node color (hex) |
| `tags` | `string[]` | Search tags |
| `webFallback` | `string` | Fallback node for web-only features |

### Port Definition

```typescript
interface PortDefinition {
  id: string           // Unique within node
  type: DataType       // Data type
  label: string        // Display label
  description?: string // Tooltip
  required?: boolean   // Node won't execute without this
  multiple?: boolean   // Accept multiple connections
  default?: unknown    // Default value
}
```

### Control Definition

```typescript
interface ControlDefinition {
  id: string           // Control ID (key in node.data)
  type: ControlType    // Control type
  label: string        // Display label
  default?: unknown    // Default value
  exposable?: boolean  // Can be exposed to parent flow
  props?: object       // Type-specific props
}
```

### Control Types

| Type | Props | Description |
|------|-------|-------------|
| `number` | `min`, `max`, `step` | Numeric input |
| `slider` | `min`, `max`, `step` | Range slider |
| `toggle` | - | Boolean checkbox |
| `select` | `options`, `deviceType` | Dropdown |
| `text` | `placeholder` | Text input |
| `color` | - | Color picker |
| `code` | - | Code editor |
| `asset-picker` | `assetType` | Asset selector |

### Data Types

| Type | Description | Use Case |
|------|-------------|----------|
| `trigger` | One-shot event | Buttons, events |
| `number` | Float value | Parameters, math |
| `string` | Text | Labels, URLs |
| `boolean` | True/false | Toggles, conditions |
| `audio` | AudioNode | Audio processing |
| `video` | HTMLVideoElement | Video sources |
| `texture` | WebGLTexture | Visual processing |
| `data` | Any object | Structured data |
| `array` | Array | Lists, collections |
| `any` | Polymorphic | Generic nodes |
| `scene3d` | THREE.Scene | 3D scenes |
| `object3d` | THREE.Object3D | 3D objects |
| `geometry3d` | THREE.BufferGeometry | 3D geometry |
| `material3d` | THREE.Material | 3D materials |
| `camera3d` | THREE.Camera | 3D cameras |
| `light3d` | THREE.Light | 3D lights |
| `transform3d` | Transform data | 3D transforms |

---

## Writing Executors

Executors contain the runtime logic for nodes. Located in `src/renderer/engine/executors/`.

### Basic Pattern

```typescript
// In the appropriate executor file
case 'your-node-id': {
  // Get inputs (port connections override control values)
  const inputA = getInput('a') ?? getData('a') ?? defaultValue

  // Get control-only values
  const mode = getData('mode') ?? 'default'

  // Perform computation
  const result = doSomething(inputA, mode)

  // Set outputs
  setOutput('result', result)
  break
}
```

### Available Functions

| Function | Description |
|----------|-------------|
| `getInput(id)` | Get connected input value |
| `getData(id)` | Get control/stored data value |
| `setOutput(id, value)` | Set output port value |
| `getState(key, default)` | Get persistent state |
| `setState(key, value)` | Set persistent state |

### Handling Different Categories

**Math/Logic** - Pure computation:
```typescript
case 'add': {
  const a = getInput('a') ?? getData('a') ?? 0
  const b = getInput('b') ?? getData('b') ?? 0
  setOutput('result', a + b)
  break
}
```

**Audio** - Web Audio API:
```typescript
case 'gain': {
  const audio = getInput('audio')
  const gainValue = getInput('gain') ?? getData('gain') ?? 1

  if (!audio) break

  // Create or get cached GainNode
  let gainNode = getState('gainNode')
  if (!gainNode) {
    gainNode = audioContext.createGain()
    setState('gainNode', gainNode)
  }

  gainNode.gain.value = gainValue
  audio.connect(gainNode)

  setOutput('audio', gainNode)
  break
}
```

**Visual** - Three.js/WebGL:
```typescript
case 'blur': {
  const texture = getInput('texture')
  const radius = getInput('radius') ?? getData('radius') ?? 5

  if (!texture) break

  const result = applyBlurShader(texture, radius)
  setOutput('texture', result)
  break
}
```

---

## Best Practices

### Naming Conventions

- **Node ID**: `kebab-case` (e.g., `map-range`, `audio-input`)
- **Port IDs**: `camelCase` (e.g., `audioIn`, `resultValue`)
- **Control IDs**: `camelCase` (e.g., `frequency`, `waveform`)
- **File names**: `kebab-case.ts` matching node ID

### Default Values

Always provide sensible defaults:

```typescript
controls: [
  // Good - useful defaults
  { id: 'frequency', type: 'number', default: 440 },
  { id: 'volume', type: 'slider', default: 0.5, props: { min: 0, max: 1 } },

  // Bad - no defaults
  { id: 'value', type: 'number' },
]
```

### Input/Control Overlap

When an input port has a matching control, the input takes precedence:

```typescript
// Definition
inputs: [{ id: 'frequency', type: 'number', label: 'Freq' }],
controls: [{ id: 'frequency', type: 'number', label: 'Frequency', default: 440 }],

// Executor - input overrides control
const freq = getInput('frequency') ?? getData('frequency') ?? 440
```

### Icon Selection

Use [Lucide icons](https://lucide.dev/icons/). Common choices:

| Use Case | Icons |
|----------|-------|
| Audio | `music`, `volume-2`, `mic`, `waves` |
| Visual | `image`, `camera`, `palette`, `layers` |
| Math | `calculator`, `plus`, `minus`, `percent` |
| Logic | `git-branch`, `git-compare`, `toggle-left` |
| Timing | `clock`, `timer`, `play`, `pause` |
| Data | `database`, `braces`, `hash` |
| Network | `globe`, `radio`, `plug`, `wifi` |

### Version Management

- Start at `1.0.0`
- Increment patch for bug fixes: `1.0.1`
- Increment minor for new features: `1.1.0`
- Increment major for breaking changes: `2.0.0`

---

## Testing Your Node

### Manual Testing

1. Start the dev server: `npm run dev`
2. Find your node in the palette
3. Add it to the canvas
4. Connect inputs and verify outputs
5. Test edge cases (null inputs, extreme values)

### Checklist

- [ ] Node appears in correct category
- [ ] Icon displays correctly
- [ ] All inputs accept connections
- [ ] All outputs produce values
- [ ] Controls have correct types and ranges
- [ ] Default values work
- [ ] Node handles missing inputs gracefully
- [ ] No console errors during execution
- [ ] Works in both web and Electron (if applicable)

---

## Adding to Documentation

After creating your node, add it to the documentation:

1. Add entry to `docs/nodes/README.md` in the appropriate category table
2. Add full documentation to `docs/nodes/{category}.md`

Documentation template:

```markdown
## Node Name

Brief description.

| Property | Value |
|----------|-------|
| **ID** | `node-id` |
| **Icon** | `icon-name` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `portId` | `type` | Description |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `portId` | `type` | Description |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `controlId` | `type` | `default` | props | Description |

### Implementation
Explain what the node does and any libraries/APIs it uses.
```

---

## Need Help?

- Check existing nodes in the same category for patterns
- Review [node-types.md](./node-types.md) for type definitions
- Look at custom UI nodes for Vue component patterns
- Search the codebase for similar functionality
