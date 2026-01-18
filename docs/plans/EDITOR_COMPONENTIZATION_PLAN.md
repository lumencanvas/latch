# EditorView Componentization Plan

**Status**: Awaiting Approval
**Priority**: Critical
**Estimated Scope**: EditorView.vue (3062 lines) → Multiple focused modules

---

## Executive Summary

The `EditorView.vue` file has grown to 3062 lines and contains:
- **2300+ lines** of inline node registry definitions (70+ nodes)
- **~500 lines** of event handlers and utility functions
- **~150 lines** of template and styles

This refactoring will extract each node into its own dedicated file, organized by category, and move reusable logic into composables, achieving **100% feature parity** while improving maintainability.

---

## Current File Structure Analysis

```
EditorView.vue (3062 lines)
├── Lines 1-82: Imports and setup
├── Lines 83-2394: registerDemoNodes() function (~2300 lines)
│   └── 70+ node definitions across 12 categories
├── Lines 2396-2513: Event handlers
│   ├── onConnect, onNodeDragStop
│   ├── onDragOver, onDrop
│   ├── watch for zoom, selection
│   └── onPaneClick, onNodeClick, onNodesChange
├── Lines 2516-2611: Keyboard shortcuts handler
├── Lines 2616-2873: Utility functions
│   ├── deleteSelected()
│   ├── copy/cut/paste/duplicate functions
│   └── subflow operations
├── Lines 2875-2896: Lifecycle hooks
├── Lines 2898-2969: Template
└── Lines 2972-3061: Scoped styles
```

---

## Proposed New Architecture

Each node gets its own file, organized by category. Nodes with custom UI components get a folder structure:

```
src/renderer/
├── registry/                              # NEW - Node definitions
│   ├── index.ts                           # Main registry initialization
│   ├── types.ts                           # Shared types (NodeDefinition)
│   ├── components.ts                      # Node type → Component mapping
│   │
│   ├── inputs/                            # Input nodes (6 nodes)
│   │   ├── index.ts                       # Category barrel export
│   │   ├── constant.ts                    # Simple node - just definition
│   │   ├── slider.ts
│   │   ├── audio-input.ts
│   │   │
│   │   ├── trigger/                       # Custom UI node - folder structure
│   │   │   ├── index.ts                   # Barrel export
│   │   │   ├── definition.ts              # Node definition
│   │   │   └── TriggerNode.vue            # Custom component (moved from components/nodes/)
│   │   │
│   │   ├── xy-pad/
│   │   │   ├── index.ts
│   │   │   ├── definition.ts
│   │   │   └── XYPadNode.vue
│   │   │
│   │   └── textbox/
│   │       ├── index.ts
│   │       ├── definition.ts
│   │       └── TextboxNode.vue
│   │
│   ├── debug/                             # Debug nodes (5 nodes)
│   │   ├── index.ts
│   │   ├── console.ts                     # Simple node
│   │   │
│   │   ├── monitor/                       # Custom UI nodes
│   │   │   ├── index.ts
│   │   │   ├── definition.ts
│   │   │   └── MonitorNode.vue
│   │   │
│   │   ├── oscilloscope/
│   │   │   ├── index.ts
│   │   │   ├── definition.ts
│   │   │   └── OscilloscopeNode.vue
│   │   │
│   │   ├── graph/
│   │   │   ├── index.ts
│   │   │   ├── definition.ts
│   │   │   └── GraphNode.vue
│   │   │
│   │   └── equalizer/
│   │       ├── index.ts
│   │       ├── definition.ts
│   │       └── EqualizerNode.vue
│   │
│   ├── math/                              # Math nodes (9 nodes)
│   │   ├── index.ts
│   │   ├── add.ts
│   │   ├── subtract.ts
│   │   ├── multiply.ts
│   │   ├── divide.ts
│   │   ├── clamp.ts
│   │   ├── abs.ts
│   │   ├── random.ts
│   │   ├── map-range.ts
│   │   └── smooth.ts
│   │
│   ├── timing/                            # Timing nodes (6 nodes)
│   │   ├── index.ts
│   │   ├── time.ts
│   │   ├── lfo.ts
│   │   ├── start.ts
│   │   ├── interval.ts
│   │   ├── delay.ts
│   │   └── timer.ts
│   │
│   ├── logic/                             # Logic nodes (7 nodes)
│   │   ├── index.ts
│   │   ├── compare.ts
│   │   ├── and.ts
│   │   ├── or.ts
│   │   ├── not.ts
│   │   ├── gate.ts
│   │   ├── switch.ts
│   │   └── select.ts
│   │
│   ├── audio/                             # Audio nodes (10 nodes)
│   │   ├── index.ts
│   │   ├── oscillator.ts
│   │   ├── audio-output.ts
│   │   ├── audio-analyzer.ts
│   │   ├── gain.ts
│   │   ├── filter.ts
│   │   ├── audio-delay.ts                 # Named to avoid conflict with timing/delay
│   │   ├── beat-detect.ts
│   │   ├── audio-player.ts
│   │   ├── envelope.ts
│   │   └── reverb.ts
│   │
│   ├── visual/                            # Visual nodes (9 nodes)
│   │   ├── index.ts
│   │   ├── shader.ts
│   │   ├── webcam.ts
│   │   ├── color.ts
│   │   ├── texture-display.ts
│   │   ├── blend.ts
│   │   ├── blur.ts
│   │   ├── color-correction.ts
│   │   ├── displacement.ts
│   │   └── transform-2d.ts
│   │
│   ├── ai/                                # AI nodes (6 nodes)
│   │   ├── index.ts
│   │   ├── text-generation.ts
│   │   ├── image-classification.ts
│   │   ├── sentiment-analysis.ts
│   │   ├── image-captioning.ts
│   │   ├── feature-extraction.ts
│   │   └── object-detection.ts
│   │
│   ├── connectivity/                      # Connectivity nodes (15 nodes)
│   │   ├── index.ts
│   │   ├── http-request.ts
│   │   ├── websocket.ts
│   │   ├── midi-input.ts
│   │   ├── midi-output.ts
│   │   ├── mqtt.ts
│   │   ├── osc.ts
│   │   ├── serial.ts
│   │   ├── ble.ts
│   │   ├── clasp-connection.ts
│   │   ├── clasp-subscribe.ts
│   │   ├── clasp-set.ts
│   │   ├── clasp-emit.ts
│   │   ├── clasp-get.ts
│   │   ├── clasp-stream.ts
│   │   └── clasp-bundle.ts
│   │
│   ├── data/                              # Data nodes (3 nodes)
│   │   ├── index.ts
│   │   ├── json-parse.ts
│   │   ├── json-stringify.ts
│   │   └── texture-to-data.ts
│   │
│   ├── code/                              # Code nodes (7 nodes)
│   │   ├── index.ts
│   │   ├── function.ts
│   │   ├── expression.ts
│   │   ├── template.ts
│   │   ├── counter.ts
│   │   ├── toggle.ts
│   │   ├── sample-hold.ts
│   │   └── value-delay.ts
│   │
│   ├── subflows/                          # Subflow nodes (2 nodes)
│   │   ├── index.ts
│   │   ├── subflow-input.ts
│   │   └── subflow-output.ts
│   │
│   ├── 3d/                                # 3D nodes (16 nodes)
│   │   ├── index.ts
│   │   ├── scene-3d.ts
│   │   ├── camera-3d.ts
│   │   ├── render-3d.ts
│   │   ├── box-3d.ts
│   │   ├── sphere-3d.ts
│   │   ├── plane-3d.ts
│   │   ├── cylinder-3d.ts
│   │   ├── torus-3d.ts
│   │   ├── transform-3d.ts
│   │   ├── material-3d.ts
│   │   ├── group-3d.ts
│   │   ├── ambient-light-3d.ts
│   │   ├── directional-light-3d.ts
│   │   ├── point-light-3d.ts
│   │   ├── spot-light-3d.ts
│   │   └── gltf-loader.ts
│   │
│   └── outputs/                           # Output nodes (1 node)
│       ├── index.ts
│       └── main-output/                   # Custom UI node
│           ├── index.ts
│           ├── definition.ts
│           └── MainOutputNode.vue
│
├── composables/
│   ├── useFlowHistory.ts              # EXISTS
│   ├── usePersistence.ts              # EXISTS
│   ├── useExecutionEngine.ts          # EXISTS
│   ├── useKeyboardShortcuts.ts        # NEW - Keyboard event handling
│   ├── useNodeClipboard.ts            # NEW - Copy/cut/paste/duplicate
│   ├── useSubflowOperations.ts        # NEW - Subflow create/edit/unpack
│   └── useEditorDragDrop.ts           # NEW - Drag/drop node handling
├── utils/
│   ├── connections.ts                 # EXISTS
│   ├── fuzzySearch.ts                 # EXISTS
│   └── minimapColors.ts               # NEW - getNodeMinimapColor helper
└── views/
    └── EditorView.vue                 # REFACTORED - ~300-400 lines
```

**Total: 98 node definitions + 14 category index files + 8 custom components = 120+ files in registry/**

---

## Node Structure Patterns

### Pattern 1: Simple Nodes (No Custom UI)

Most nodes use `BaseNode.vue` and just need a definition file:

```
registry/math/add.ts
```

```typescript
// registry/math/add.ts
import type { NodeDefinition } from '../types'

export const addNode: NodeDefinition = {
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
}
```

### Pattern 2: Custom UI Nodes (Special Components)

Nodes with custom visuals get a folder with definition + component:

```
registry/debug/oscilloscope/
├── index.ts           # Barrel export
├── definition.ts      # Node definition
└── OscilloscopeNode.vue  # Custom Vue component
```

```typescript
// registry/debug/oscilloscope/index.ts
export { oscilloscopeNode } from './definition'
export { default as OscilloscopeNode } from './OscilloscopeNode.vue'
```

```typescript
// registry/debug/oscilloscope/definition.ts
import type { NodeDefinition } from '../../types'

export const oscilloscopeNode: NodeDefinition = {
  id: 'oscilloscope',
  name: 'Oscilloscope',
  // ... definition
  component: 'oscilloscope',  // References the custom component type
}
```

### Nodes with Custom Components (8 total)

| Node | Category | Component |
|------|----------|-----------|
| trigger | inputs | TriggerNode.vue |
| xy-pad | inputs | XYPadNode.vue |
| textbox | inputs | TextboxNode.vue |
| monitor | debug | MonitorNode.vue |
| oscilloscope | debug | OscilloscopeNode.vue |
| graph | debug | GraphNode.vue |
| equalizer | debug | EqualizerNode.vue |
| main-output | outputs | MainOutputNode.vue |

### Component Registry

The `components.ts` file maps node types to Vue components:

```typescript
// registry/components.ts
import { markRaw } from 'vue'
import BaseNode from '@/components/nodes/BaseNode.vue'

// Import custom components from their node folders
import { TriggerNode } from './inputs/trigger'
import { XYPadNode } from './inputs/xy-pad'
import { TextboxNode } from './inputs/textbox'
import { MonitorNode } from './debug/monitor'
import { OscilloscopeNode } from './debug/oscilloscope'
import { GraphNode } from './debug/graph'
import { EqualizerNode } from './debug/equalizer'
import { MainOutputNode } from './outputs/main-output'

export const nodeTypes = {
  default: markRaw(BaseNode),
  custom: markRaw(BaseNode),
  trigger: markRaw(TriggerNode),
  'xy-pad': markRaw(XYPadNode),
  textbox: markRaw(TextboxNode),
  monitor: markRaw(MonitorNode),
  oscilloscope: markRaw(OscilloscopeNode),
  graph: markRaw(GraphNode),
  equalizer: markRaw(EqualizerNode),
  'main-output': markRaw(MainOutputNode),
}
```

This keeps EditorView.vue clean - it just imports `nodeTypes` from the registry.

### What Stays in `components/nodes/`

The following shared components remain in `src/renderer/components/nodes/`:

```
components/nodes/
├── BaseNode.vue          # Default renderer for all simple nodes
├── controls/             # Shared control components (slider, toggle, etc.)
│   ├── NumberControl.vue
│   ├── SliderControl.vue
│   ├── TextControl.vue
│   ├── SelectControl.vue
│   ├── ToggleControl.vue
│   ├── ColorControl.vue
│   └── CodeControl.vue
└── (empty - custom nodes moved to registry/)
```

The 8 custom node components (TriggerNode, MonitorNode, etc.) move TO the registry to be co-located with their definitions.

---

## Phase 1: Registry Extraction (Highest Priority)

### Objective
Extract the `registerDemoNodes()` function (2300+ lines) into individual node files.

### File Structure Per Node

Each node file exports its definition:

```typescript
// src/renderer/registry/inputs/constant.ts
import type { NodeDefinition } from '../types'

export const constantNode: NodeDefinition = {
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
}
```

### Category Index Files

Each category has an index that exports all nodes:

```typescript
// src/renderer/registry/inputs/index.ts
export { constantNode } from './constant'
export { sliderNode } from './slider'
export { triggerNode } from './trigger'
export { xyPadNode } from './xy-pad'
export { textboxNode } from './textbox'
export { audioInputNode } from './audio-input'

import type { NodeDefinition } from '../types'

export const inputNodes: NodeDefinition[] = [
  constantNode,
  sliderNode,
  triggerNode,
  xyPadNode,
  textboxNode,
  audioInputNode,
]
```

### Main Registry Index

```typescript
// src/renderer/registry/index.ts
import { useNodesStore } from '@/stores/nodes'
import { inputNodes } from './inputs'
import { debugNodes } from './debug'
import { mathNodes } from './math'
import { timingNodes } from './timing'
import { logicNodes } from './logic'
import { audioNodes } from './audio'
import { visualNodes } from './visual'
import { aiNodes } from './ai'
import { connectivityNodes } from './connectivity'
import { dataNodes } from './data'
import { codeNodes } from './code'
import { subflowNodes } from './subflows'
import { threeDNodes } from './3d'

const allNodes = [
  ...inputNodes,
  ...debugNodes,
  ...mathNodes,
  ...timingNodes,
  ...logicNodes,
  ...audioNodes,
  ...visualNodes,
  ...aiNodes,
  ...connectivityNodes,
  ...dataNodes,
  ...codeNodes,
  ...subflowNodes,
  ...threeDNodes,
]

export function initializeNodeRegistry() {
  const nodesStore = useNodesStore()

  for (const node of allNodes) {
    nodesStore.register(node)
  }
}

// Re-export for direct access if needed
export { allNodes }
export * from './types'
```

### Shared Types

```typescript
// src/renderer/registry/types.ts
export interface NodeInput {
  id: string
  type: string
  label: string
  required?: boolean
  multiple?: boolean
}

export interface NodeOutput {
  id: string
  type: string
  label: string
}

export interface NodeControl {
  id: string
  type: string
  label: string
  default?: unknown
  exposable?: boolean
  props?: Record<string, unknown>
}

export interface NodeDefinition {
  id: string
  name: string
  version: string
  category: string
  description: string
  icon: string
  platforms: string[]
  inputs: NodeInput[]
  outputs: NodeOutput[]
  controls: NodeControl[]
  color?: string
  tags?: string[]
}
```

### Complete Node File List by Category

| Category | Files |
|----------|-------|
| inputs/ | constant, slider, trigger, xy-pad, textbox, audio-input |
| debug/ | monitor, oscilloscope, graph, equalizer, console |
| math/ | add, subtract, multiply, divide, clamp, abs, random, map-range, smooth |
| timing/ | time, lfo, start, interval, delay, timer |
| logic/ | compare, and, or, not, gate, switch, select |
| audio/ | oscillator, audio-output, audio-analyzer, gain, filter, audio-delay, beat-detect, audio-player, envelope, reverb |
| visual/ | shader, webcam, color, texture-display, blend, blur, color-correction, displacement, transform-2d |
| outputs/ | main-output |
| ai/ | text-generation, image-classification, sentiment-analysis, image-captioning, feature-extraction, object-detection |
| connectivity/ | http-request, websocket, midi-input, midi-output, mqtt, osc, serial, ble, clasp-connection, clasp-subscribe, clasp-set, clasp-emit, clasp-get, clasp-stream, clasp-bundle |
| data/ | json-parse, json-stringify, texture-to-data |
| code/ | function, expression, template, counter, toggle, sample-hold, value-delay |
| subflows/ | subflow-input, subflow-output |
| 3d/ | scene-3d, camera-3d, render-3d, box-3d, sphere-3d, plane-3d, cylinder-3d, torus-3d, transform-3d, material-3d, group-3d, ambient-light-3d, directional-light-3d, point-light-3d, spot-light-3d, gltf-loader |

**Total: 98 individual node files across 14 categories**

> **Note**: The original code has a duplicate `delay` node ID - one in timing (value delay) and one in audio (echo effect). This is a bug - the audio version overwrites the timing version. During extraction, we'll rename them to `timing-delay` and `audio-delay` to fix this.

### Benefits of Per-Node Files

1. **Easy to locate** - Find any node instantly by name
2. **Minimal merge conflicts** - Contributors work on separate files
3. **Self-documenting** - Each file is a complete node specification
4. **Testable** - Can unit test individual node definitions
5. **Future-proof** - Easy to add node-specific logic, tests, or docs later
6. **IDE-friendly** - Better autocomplete and navigation

---

## Phase 2: Composables Extraction

### 2.1 `useKeyboardShortcuts.ts`

Extract keyboard handling logic (~100 lines).

```typescript
// src/renderer/composables/useKeyboardShortcuts.ts
export function useKeyboardShortcuts(options: {
  onUndo: () => void
  onRedo: () => void
  onSelectAll: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onDuplicate: () => void
  onDelete: () => void
  onCreateSubflow: () => void
  onEditSubflow: () => void
  onUnpackSubflow: () => void
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
}) {
  // Implementation
  function handleKeyDown(event: KeyboardEvent) { ... }

  onMounted(() => window.addEventListener('keydown', handleKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeyDown))
}
```

### 2.2 `useNodeClipboard.ts`

Extract copy/cut/paste/duplicate logic (~150 lines).

```typescript
// src/renderer/composables/useNodeClipboard.ts
export function useNodeClipboard() {
  const clipboard = ref<ClipboardData | null>(null)

  function copySelectedNodes() { ... }
  function cutSelectedNodes() { ... }
  function pasteNodes() { ... }
  function duplicateSelectedNodes() { ... }

  return {
    clipboard,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
    duplicateSelectedNodes,
  }
}
```

### 2.3 `useSubflowOperations.ts`

Extract subflow-related operations (~100 lines).

```typescript
// src/renderer/composables/useSubflowOperations.ts
export function useSubflowOperations(options: {
  showFeedback: (message: string) => void
}) {
  function createSubflowFromSelection() { ... }
  function editSelectedSubflow() { ... }
  function unpackSelectedSubflow() { ... }

  return {
    createSubflowFromSelection,
    editSelectedSubflow,
    unpackSelectedSubflow,
  }
}
```

### 2.4 `useEditorDragDrop.ts`

Extract drag/drop handling (~50 lines).

```typescript
// src/renderer/composables/useEditorDragDrop.ts
export function useEditorDragDrop() {
  function onDragOver(event: DragEvent) { ... }
  function onDrop(event: DragEvent) { ... }

  return { onDragOver, onDrop }
}
```

---

## Phase 3: Utility Extraction

### 3.1 `src/renderer/utils/minimapColors.ts`

```typescript
import { useNodesStore, categoryMeta, type NodeCategory } from '@/stores/nodes'

export function getNodeMinimapColor(node: { data?: Record<string, unknown> }): string {
  const nodesStore = useNodesStore()
  const nodeType = node.data?.nodeType as string | undefined
  if (!nodeType) return 'var(--color-neutral-400)'

  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return 'var(--color-neutral-400)'

  const category = definition.category as NodeCategory
  return categoryMeta[category]?.color ?? 'var(--color-neutral-400)'
}
```

---

## Final EditorView.vue Structure

After refactoring, EditorView.vue will be approximately **300-400 lines**:

```vue
<script setup lang="ts">
// ~40 lines: Imports
import { ref, onMounted, watch, markRaw } from 'vue'
import { VueFlow, useVueFlow, Panel } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
// ... component imports
import { initializeNodeRegistry } from '@/registry'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useNodeClipboard } from '@/composables/useNodeClipboard'
import { useSubflowOperations } from '@/composables/useSubflowOperations'
import { useEditorDragDrop } from '@/composables/useEditorDragDrop'
import { getNodeMinimapColor } from '@/utils/minimapColors'

// ~20 lines: Store setup and node types
const flowsStore = useFlowsStore()
const uiStore = useUIStore()
const nodesStore = useNodesStore()
const nodeTypes = { ... }
const edgeTypes = { ... }

// ~5 lines: Initialize registry
initializeNodeRegistry()
if (!flowsStore.activeFlow) {
  flowsStore.createFlow('My First Flow')
}

// ~30 lines: Connection validation and error display
const connectionError = ref<string | null>(null)
function showConnectionError(message: string) { ... }
function isValidConnection(connection: Connection): boolean { ... }

// ~20 lines: Composable setup
const { clipboard, copySelectedNodes, cutSelectedNodes, pasteNodes, duplicateSelectedNodes } = useNodeClipboard()
const { createSubflowFromSelection, editSelectedSubflow, unpackSelectedSubflow } = useSubflowOperations({ showFeedback: showConnectionError })
const { onDragOver, onDrop } = useEditorDragDrop()

// ~30 lines: Vue Flow event handlers
onConnect((connection) => { ... })
onNodeDragStop(({ node }) => { ... })
// ... other handlers

// ~20 lines: Keyboard shortcuts
useKeyboardShortcuts({
  onUndo: undo,
  onRedo: redo,
  onCopy: copySelectedNodes,
  // ... other bindings
})

// ~20 lines: Lifecycle and custom node loader
onMounted(async () => { ... })
</script>

<template>
  <!-- ~70 lines: Same template, no changes needed -->
</template>

<style scoped>
/* ~90 lines: Same styles, no changes needed */
</style>
```

---

## Implementation Order

### Step 1: Registry Extraction (Do First)

**1a. Setup Phase:**
1. Create `src/renderer/registry/` directory structure with all category folders
2. Create `types.ts` with shared type definitions
3. Create `components.ts` with node type → component mapping (initially importing from old locations)

**1b. Extract Simple Nodes (no custom UI):**
Start with categories that have no custom components:
1. subflows (2 nodes) - smallest, good warmup
2. data (3 nodes)
3. timing (6 nodes)
4. ai (6 nodes)
5. logic (7 nodes)
6. code (7 nodes)
7. math (9 nodes)
8. visual (9 nodes)
9. audio (10 nodes)
10. connectivity (15 nodes)
11. 3d (16 nodes) - largest

**1c. Extract Custom UI Nodes (with components):**
These require moving Vue components too:
1. outputs/main-output (1 node + MainOutputNode.vue)
2. inputs/trigger (+ TriggerNode.vue)
3. inputs/xy-pad (+ XYPadNode.vue)
4. inputs/textbox (+ TextboxNode.vue)
5. debug/monitor (+ MonitorNode.vue)
6. debug/oscilloscope (+ OscilloscopeNode.vue)
7. debug/graph (+ GraphNode.vue)
8. debug/equalizer (+ EqualizerNode.vue)

**1d. Finalize:**
1. Create main `registry/index.ts` that imports and initializes all
2. Update `components.ts` to import from new locations
3. Update EditorView.vue to use `initializeNodeRegistry()` and import `nodeTypes`
4. Delete old component files from `components/nodes/`
5. Test thoroughly - every node type must work

### Step 2: Composables Extraction
1. Create `useNodeClipboard.ts` (copy/paste is well-isolated)
2. Create `useSubflowOperations.ts`
3. Create `useEditorDragDrop.ts`
4. Create `useKeyboardShortcuts.ts`
5. Update EditorView.vue to use composables
6. Test all keyboard shortcuts and operations

### Step 3: Utility Extraction
1. Create `minimapColors.ts`
2. Update EditorView.vue imports
3. Test minimap coloring

### Step 4: Final Cleanup
1. Remove dead code from EditorView.vue
2. Verify line count is ~300-400
3. Run full test suite
4. Verify all features work identically

---

## Testing Checklist

Before and after each phase, verify:

### Node Operations
- [ ] Create each node type from sidebar drag
- [ ] Delete nodes (Delete/Backspace key)
- [ ] Move nodes (drag)
- [ ] Copy/Paste nodes (Cmd/Ctrl+C, Cmd/Ctrl+V)
- [ ] Cut nodes (Cmd/Ctrl+X)
- [ ] Duplicate nodes (Cmd/Ctrl+D)
- [ ] Select all (Cmd/Ctrl+A)
- [ ] Undo/Redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)

### Connections
- [ ] Connect compatible nodes
- [ ] Reject incompatible connections (error toast appears)
- [ ] Delete connections

### Subflows
- [ ] Create subflow from selection (Cmd/Ctrl+G)
- [ ] Edit subflow (Cmd/Ctrl+E)
- [ ] Unpack subflow (Cmd/Ctrl+Shift+G)

### UI
- [ ] MiniMap shows correct node colors by category
- [ ] Grid background works
- [ ] Zoom controls work
- [ ] Node count in panel accurate
- [ ] Empty state shows when no nodes

### Custom UI Nodes (8 nodes with special components)
- [ ] Trigger - button click fires, visual feedback works
- [ ] XY Pad - drag interaction, raw/normalized outputs
- [ ] Textbox - resizable, text input works
- [ ] Monitor - displays values with type-based coloring
- [ ] Oscilloscope - renders waveforms (number and audio modes)
- [ ] Graph - plots X/Y data, add/remove series buttons work
- [ ] Equalizer - renders FFT bars, color modes work
- [ ] Main Output - preview renders, expand toggle works

### Category-Specific Nodes
- [ ] Input nodes (slider, constant) update values
- [ ] Debug nodes (console) log correctly
- [ ] Audio nodes produce sound
- [ ] Visual nodes render textures
- [ ] 3D nodes render scenes
- [ ] AI nodes run inference
- [ ] Connectivity nodes connect to external services

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking node registration | Each category tested individually before moving to next |
| Missing node imports | TypeScript will catch missing exports |
| Composable scope issues | Each composable tested in isolation |
| Feature regression | Comprehensive testing checklist above |

---

## Estimated File Sizes After Refactoring

| File Type | Count | Lines Each | Total Lines |
|-----------|-------|------------|-------------|
| EditorView.vue | 1 | ~350 | 350 |
| registry/index.ts | 1 | ~40 | 40 |
| registry/types.ts | 1 | ~40 | 40 |
| Category index.ts files | 14 | ~20 | 280 |
| Individual node files | 98 | ~25 avg | 2450 |
| useKeyboardShortcuts.ts | 1 | ~100 | 100 |
| useNodeClipboard.ts | 1 | ~150 | 150 |
| useSubflowOperations.ts | 1 | ~100 | 100 |
| useEditorDragDrop.ts | 1 | ~50 | 50 |
| minimapColors.ts | 1 | ~20 | 20 |

**Total**: ~3560 lines across 120 focused files (vs. 3062 lines in 1 monolith)

The small increase is due to:
- Import/export boilerplate in each file
- Category index files for clean barrel exports
- Shared types file

This overhead is a worthwhile trade-off for the maintainability gains.

---

## Approval Requested

Please review this plan and confirm:
1. The proposed directory structure works for the project
2. The phase order is acceptable
3. The testing checklist covers all features

Once approved, I will begin Phase 1: Registry Extraction.
