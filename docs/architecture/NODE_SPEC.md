# CLASP Flow - Node Specification

**Document Version**: 1.0
**Last Updated**: 2026-01-17

---

## Overview

This document defines the specification for creating nodes in CLASP Flow. Nodes are the fundamental building blocks of any flow, representing operations that transform, generate, or consume data.

---

## Node Definition Schema

### Complete Definition

```typescript
interface NodeDefinition {
  // Identity
  id: string;                    // Unique identifier (kebab-case)
  name: string;                  // Display name
  version: string;               // Semantic version
  author?: string;               // Author/creator

  // Classification
  category: NodeCategory;        // Category for organization
  tags?: string[];               // Search tags
  description: string;           // Brief description
  documentation?: string;        // Extended markdown documentation

  // Visual
  icon: string;                  // Lucide icon name or custom SVG
  color?: string;                // Override category color

  // Platform
  platforms: Platform[];         // Where node can run
  webFallback?: string;          // Alternative node ID for web

  // Ports
  inputs: PortDefinition[];      // Input ports
  outputs: PortDefinition[];     // Output ports

  // Controls
  controls: ControlDefinition[]; // User-adjustable parameters

  // Connection requirements (protocols it needs)
  connections?: NodeConnectionRequirement[];

  // Additional info displayed in the Info tab of the properties panel
  info?: NodeInfo;
}

interface NodeInfo {
  /** 2-4 sentence explanation of what this node does and when to use it. */
  overview: string;
  /** Short, actionable tips. One sentence each. */
  tips?: string[];
  /** Node IDs of nodes that complement this one. */
  pairsWith?: string[];
}

type NodeCategory =
  | 'debug'
  | 'inputs'
  | 'outputs'
  | 'timing'
  | 'math'
  | 'logic'
  | 'audio'
  | 'video'
  | 'visual'
  | 'shaders'
  | 'data'
  | 'ai'
  | 'code'
  | '3d'
  | 'connectivity'
  | 'clasp'
  | 'subflows'
  | 'string'
  | 'messaging'
  | 'custom';

type Platform = 'web' | 'electron';
```

### Port Definition

```typescript
interface PortDefinition {
  id: string;                    // Unique within node
  type: DataType;                // Data type
  label: string;                 // Display label
  description?: string;          // Tooltip text

  // Behavior
  required?: boolean;            // Must be connected (default: false)
  multiple?: boolean;            // Allow multiple connections (default: false)
  default?: any;                 // Default value when not connected

  // Validation
  min?: number;                  // For numeric types
  max?: number;                  // For numeric types
  options?: string[];            // For enum/select types
}

type DataType =
  | 'trigger'    // Event signal (no data)
  | 'number'     // Numeric value
  | 'string'     // Text
  | 'boolean'    // True/false
  | 'audio'      // AudioBuffer or stream
  | 'video'      // VideoFrame or stream
  | 'texture'    // WebGL texture
  | 'data'       // JSON object
  | 'array'      // Array of values
  | 'any';       // Any type (universal)
```

### Control Definition

```typescript
interface ControlDefinition {
  id: string;                    // Unique within node
  type: ControlType;             // Control widget type
  label: string;                 // Display label
  description?: string;          // Tooltip text

  // Value
  default?: any;                 // Default value

  // Behavior
  exposable?: boolean;           // Can appear in control panel
  bindable?: boolean;            // Can be overridden by input port

  // Type-specific properties
  props?: ControlProps;
}

type ControlType =
  | 'number'     // Numeric input
  | 'slider'     // Range slider
  | 'knob'       // Rotary knob
  | 'xy-pad'     // 2D position
  | 'select'     // Dropdown
  | 'toggle'     // Boolean switch
  | 'button'     // Trigger button
  | 'text'       // Text input
  | 'textarea'   // Multi-line text
  | 'code'       // Code editor
  | 'color'      // Color picker
  | 'file'       // File selector
  | 'image'      // Image preview
  | 'meter'      // Read-only meter
  | 'waveform'   // Audio waveform display
  | 'custom';    // Custom Vue component

interface ControlProps {
  // Number/Slider/Knob
  min?: number;
  max?: number;
  step?: number;
  unit?: string;

  // Select
  options?: SelectOption[];

  // Code
  language?: string;
  height?: number;

  // File
  accept?: string;
  multiple?: boolean;

  // Custom
  component?: string;
}

interface SelectOption {
  value: any;
  label: string;
  icon?: string;
}
```

---

## Example Node Definitions

### Simple: Constant Node

```json
{
  "id": "constant",
  "name": "Constant",
  "version": "1.0.0",
  "category": "inputs",
  "description": "Output a constant value",
  "icon": "hash",
  "platforms": ["web", "electron"],
  "inputs": [],
  "outputs": [
    {
      "id": "value",
      "type": "number",
      "label": "Value"
    }
  ],
  "controls": [
    {
      "id": "value",
      "type": "number",
      "label": "Value",
      "default": 0,
      "exposable": true
    }
  ],
}
```

### Medium: Map Range Node

```json
{
  "id": "map-range",
  "name": "Map Range",
  "version": "1.0.0",
  "category": "math",
  "description": "Remap a value from one range to another",
  "icon": "arrow-right-left",
  "platforms": ["web", "electron"],
  "inputs": [
    {
      "id": "value",
      "type": "number",
      "label": "Value",
      "required": true
    }
  ],
  "outputs": [
    {
      "id": "result",
      "type": "number",
      "label": "Result"
    }
  ],
  "controls": [
    {
      "id": "inMin",
      "type": "number",
      "label": "Input Min",
      "default": 0,
      "bindable": true
    },
    {
      "id": "inMax",
      "type": "number",
      "label": "Input Max",
      "default": 1,
      "bindable": true
    },
    {
      "id": "outMin",
      "type": "number",
      "label": "Output Min",
      "default": 0,
      "bindable": true
    },
    {
      "id": "outMax",
      "type": "number",
      "label": "Output Max",
      "default": 1,
      "bindable": true
    },
    {
      "id": "clamp",
      "type": "toggle",
      "label": "Clamp",
      "default": false
    }
  ],
}
```

### Complex: Audio Input Node

```json
{
  "id": "audio-input",
  "name": "Audio Input",
  "version": "1.0.0",
  "category": "audio",
  "description": "Capture audio from microphone or audio device",
  "icon": "mic",
  "platforms": ["web", "electron"],
  "inputs": [],
  "outputs": [
    {
      "id": "audio",
      "type": "audio",
      "label": "Audio"
    },
    {
      "id": "level",
      "type": "number",
      "label": "Level"
    },
    {
      "id": "bass",
      "type": "number",
      "label": "Bass"
    },
    {
      "id": "mid",
      "type": "number",
      "label": "Mid"
    },
    {
      "id": "treble",
      "type": "number",
      "label": "Treble"
    },
    {
      "id": "beat",
      "type": "trigger",
      "label": "Beat"
    }
  ],
  "controls": [
    {
      "id": "source",
      "type": "select",
      "label": "Source",
      "default": "default",
      "props": {
        "options": [
          { "value": "default", "label": "Default Device" }
        ]
      }
    },
    {
      "id": "gain",
      "type": "slider",
      "label": "Gain",
      "default": 1,
      "props": {
        "min": 0,
        "max": 2,
        "step": 0.01
      },
      "exposable": true
    },
    {
      "id": "fftSize",
      "type": "select",
      "label": "FFT Size",
      "default": 2048,
      "props": {
        "options": [
          { "value": 512, "label": "512" },
          { "value": 1024, "label": "1024" },
          { "value": 2048, "label": "2048" },
          { "value": 4096, "label": "4096" }
        ]
      }
    },
    {
      "id": "smoothing",
      "type": "slider",
      "label": "Smoothing",
      "default": 0.8,
      "props": {
        "min": 0,
        "max": 1,
        "step": 0.01
      }
    }
  ],
}
```

### Shader Node

```json
{
  "id": "shader",
  "name": "Shader",
  "version": "1.0.0",
  "category": "shaders",
  "description": "Custom GLSL fragment shader",
  "icon": "code",
  "platforms": ["web", "electron"],
  "inputs": [
    {
      "id": "texture0",
      "type": "texture",
      "label": "Texture 0"
    }
  ],
  "outputs": [
    {
      "id": "texture",
      "type": "texture",
      "label": "Output"
    }
  ],
  "controls": [
    {
      "id": "code",
      "type": "code",
      "label": "Fragment Shader",
      "default": "void main() {\n  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);\n}",
      "props": {
        "language": "glsl",
        "height": 300
      }
    },
    {
      "id": "width",
      "type": "number",
      "label": "Width",
      "default": 1920,
      "props": {
        "min": 1,
        "max": 4096
      }
    },
    {
      "id": "height",
      "type": "number",
      "label": "Height",
      "default": 1080,
      "props": {
        "min": 1,
        "max": 4096
      }
    }
  ],
}
```

---

## Node Executor Implementation

### Functional Executors

LATCH uses functional executors rather than class-based ones. Each executor is a function that receives an `ExecutionContext` and returns a `Map<string, unknown>` of outputs.

```typescript
// src/renderer/engine/ExecutionEngine.ts

interface ExecutionContext {
  nodeId: string;
  inputs: Map<string, unknown>;      // Values from connected input ports
  controls: Map<string, unknown>;    // Values from inline controls
  definition: NodeDefinition;
  deltaTime: number;
  totalTime: number;
  frameCount: number;
}

type NodeExecutorFn = (ctx: ExecutionContext) => Promise<Map<string, unknown>> | Map<string, unknown>;
```

### Registration

Executors are registered in `src/renderer/engine/executors/index.ts`:

```typescript
export const builtinExecutors: Record<string, NodeExecutorFn> = {
  constant: constantExecutor,
  compare: compareExecutor,
  // ... all executors
  ...audioExecutors,
  ...visualExecutors,
  ...claspExecutors,
  ...utilityExecutors,
  // etc.
}
```

### Control Fallback Pattern

When a node has both an input port and an inline control with the same ID, the input connection takes precedence:

```typescript
// Input connection overrides inline control value
const a = (ctx.inputs.get('a') as number) ?? (ctx.controls.get('a') as number) ?? 0;
```

This is the standard pattern used by compare, equals, and, or, gate, in-range, modulo, and other nodes.

### Example: Map Range Executor

```typescript
export const mapRangeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0;
  const inMin = (ctx.controls.get('inMin') as number) ?? 0;
  const inMax = (ctx.controls.get('inMax') as number) ?? 1;
  const outMin = (ctx.controls.get('outMin') as number) ?? 0;
  const outMax = (ctx.controls.get('outMax') as number) ?? 100;

  const normalized = inMax !== inMin ? (value - inMin) / (inMax - inMin) : 0;
  const result = normalized * (outMax - outMin) + outMin;

  return new Map([['result', result]]);
}
```

### Example: Compare Executor (with Control Fallback)

```typescript
export const compareExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? (ctx.controls.get('a') as number) ?? 0;
  const b = (ctx.inputs.get('b') as number) ?? (ctx.controls.get('b') as number) ?? 0;
  const operator = (ctx.controls.get('operator') as string) ?? '==';

  let result = false;
  switch (operator) {
    case '==': result = a === b; break;
    case '!=': result = a !== b; break;
    case '>':  result = a > b;   break;
    case '>=': result = a >= b;  break;
    case '<':  result = a < b;   break;
    case '<=': result = a <= b;  break;
  }

  return new Map([['result', result]]);
}
```

---

## Custom Node UI Components

Custom nodes use Vue Flow's `NodeProps` and manage their own handles. They are registered in `src/renderer/registry/components.ts` using `markRaw()` and listed in `specialNodeTypes` in `src/renderer/stores/flows.ts`.

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

function updateValue(key: string, value: unknown) {
  flowsStore.updateNodeData(props.id, { [key]: value })
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

### Registration

```typescript
// src/renderer/registry/components.ts
import { markRaw } from 'vue'
import { DispatchNode } from './logic/dispatch'

export const nodeTypes = {
  default: markRaw(BaseNode),
  dispatch: markRaw(DispatchNode),
  // ... other custom nodes
}

// src/renderer/stores/flows.ts
const specialNodeTypes = ['trigger', 'monitor', 'dispatch', /* ... */]
```

---

## Node Auto-Discovery

### Custom Nodes Folder Structure

```
custom-nodes/
├── my-color-mixer/
│   ├── definition.json       # Required: Node definition
│   ├── executor.ts           # Required: Executor class
│   ├── ui.vue               # Optional: Custom UI component
│   ├── icon.svg             # Optional: Custom icon
│   └── README.md            # Optional: Documentation
├── my-data-processor/
│   └── ...
```

### Auto-Discovery Logic

```typescript
// src/nodes/discovery.ts

export async function discoverCustomNodes(
  basePath: string
): Promise<NodeDefinition[]> {
  const nodes: NodeDefinition[] = [];

  // Only in Electron
  if (!window.electronAPI) {
    return nodes;
  }

  const folders = await window.electronAPI.listDirectory(basePath);

  for (const folder of folders) {
    const defPath = `${basePath}/${folder}/definition.json`;

    try {
      const content = await window.electronAPI.readFile(defPath);
      const definition = JSON.parse(content) as NodeDefinition;

      // Validate required fields
      if (!definition.id || !definition.name) {
        console.warn(`Invalid node definition in ${folder}`);
        continue;
      }

      // Mark as custom
      definition.category = 'custom';

      // Check for custom icon
      const iconPath = `${basePath}/${folder}/icon.svg`;
      if (await window.electronAPI.fileExists(iconPath)) {
        definition.icon = `custom:${folder}`;
      }

      nodes.push(definition);
    } catch (error) {
      console.warn(`Failed to load custom node from ${folder}:`, error);
    }
  }

  return nodes;
}
```

---

## Best Practices

### DO

1. **Use descriptive IDs**: `audio-frequency-analyzer` not `afa`
2. **Provide defaults**: Every control should have a sensible default
3. **Document thoroughly**: Include descriptions and tooltips
4. **Handle errors gracefully**: Don't crash on bad input
5. **Clean up resources**: Implement `dispose()` properly
6. **Use typed outputs**: Match declared types exactly
7. **Support both platforms**: Provide web fallbacks when possible

### DON'T

1. **Block the main thread**: Use workers for heavy computation
2. **Leak memory**: Release buffers, textures, streams
3. **Ignore dispose**: Always clean up in `dispose()`
4. **Hardcode values**: Use controls for configuration
5. **Assume platform**: Check capabilities before using

---

## Related Documents

- [Architecture](./ARCHITECTURE.md)
- [Execution Engine](./EXECUTION_ENGINE.md)
- [Master Plan](../plans/MASTER_PLAN.md)
