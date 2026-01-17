# CLASP Flow - Session Handoff Document

**Purpose**: This document ensures continuity when starting new sessions or clearing context. It provides the essential information needed to quickly resume work on CLASP Flow.

---

## Quick Context

**Project**: CLASP Flow - Visual flow programming environment for creatives
**Organization**: LumenCanvas (2026)
**Repository**: `/Users/obsidian/Projects/lumencanvas/clasp-flow`
**Type**: Web + Electron application
**Stack**: Vue 3, TypeScript, Vue Flow, Pinia, Vite, Electron Forge

---

## Current Status

### Phase: 0 - Foundation ✅ COMPLETE
### Next Step: Phase 1 - Core Editor

**Last Action Completed**:
- Full project scaffolding with Vite + Vue 3 + TypeScript
- Electron Forge integration configured
- Design system implemented (tokens, base, components CSS)
- Vue Flow integrated with custom BaseNode component
- Pinia stores created (flows, nodes, runtime, ui)
- Layout components built (AppHeader, AppSidebar, StatusBar)
- Views implemented (EditorView, ControlPanelView, SettingsView)
- Testing infrastructure set up (Vitest with 16 passing tests)
- GitHub Actions CI/CD workflows created
- TypeScript compilation verified (no errors)
- Web build verified (produces optimized bundle)

**What Needs to Happen Next** (Phase 1 - Core Editor):
1. Enhance node drag-and-drop with proper positioning
2. Implement connection validation by data type
3. Add node selection and multi-select
4. Build undo/redo history system
5. Set up flow persistence with IndexedDB (Dexie.js)
6. Add copy/paste/duplicate functionality
7. Implement keyboard shortcuts
8. Build node search in sidebar

---

## Key Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Master Plan | `docs/plans/MASTER_PLAN.md` | Complete project roadmap, phases, node types |
| Architecture | `docs/architecture/ARCHITECTURE.md` | Technical architecture, file structure, APIs |
| Design System | `design-system (1).html` | UI components, colors, typography |
| Screenshots | `Screen Shot 2026-01-17*.png` | Inspiration for node editor UI |
| This Handoff | `docs/handoff/SESSION_HANDOFF.md` | Session continuity |

---

## Project Vision (Quick Summary)

CLASP Flow combines:
- **TouchDesigner**: Real-time visuals, shaders, video
- **PureData/Max**: Audio synthesis, MIDI, signals
- **Node-RED**: Data flow, IoT, protocols
- **nodes.io**: Web-based creative coding

Key Features:
- Runs in browser AND Electron (with hardware access)
- Shader nodes with GLSL editor (Shadertoy compatible)
- Audio input/output with analysis, beat detection, synthesis
- Video input/processing with ffmpeg.wasm
- AI nodes (Transformers.js for browser-based ML)
- IoT nodes (MQTT, Serial, BLE, OSC)
- Function nodes (JavaScript) and Blockly visual coding
- Custom node drop-in system
- Export flows as standalone apps
- Control panel view for live performance

---

## Technology Decisions (Locked In)

### Core
- **Framework**: Vue 3 + Composition API
- **Language**: TypeScript (strict)
- **Build**: Vite
- **Desktop**: Electron Forge
- **Node Editor**: Vue Flow
- **State**: Pinia
- **Storage**: IndexedDB (Dexie.js)

### Audio
- **Synthesis**: Tone.js
- **Analysis**: Meyda.js + web-audio-beat-detector
- **Core**: Web Audio API

### Video/Graphics
- **2D**: Canvas 2D, WebGL2
- **Shaders**: GLSL (WebGL2), WGSL (WebGPU where available)
- **Processing**: ffmpeg.wasm

### AI
- **Runtime**: Transformers.js (ONNX Runtime)
- **Capabilities**: Text, speech, vision models in browser

### Styling
- **System**: Custom CSS with design tokens (from design-system.html)
- **Icons**: Lucide
- **Font**: JetBrains Mono

---

## Design System Key Points

From `design-system (1).html`:

### Colors
```css
--color-primary-400: #2AAB8A;  /* Main teal */
--color-neutral-800: #2D2D2D;  /* Dark surfaces */
--color-neutral-0: #FFFFFF;    /* Light surfaces */
--color-success: #22C55E;
--color-warning: #F59E0B;
--color-error: #EF4444;
```

### Style Rules
- Sharp corners (border-radius: 0)
- Offset box shadows (3-4px solid)
- Monospace typography (JetBrains Mono)
- Uppercase labels with letter-spacing
- Dark sidebar/header with light content areas

### Connection Lines (Enhanced from screenshots)
- Color-coded by data type
- Animated when data flows
- Dashed for intermittent, solid for continuous
- Thickness varies by signal type (audio/video thicker)

---

## Data Types & Colors

| Type | Color | Style | Use |
|------|-------|-------|-----|
| trigger | #F59E0B | Thin solid | Events/bangs |
| number | #2AAB8A | Solid | Numeric values |
| string | #8B5CF6 | Solid | Text |
| boolean | #EF4444 | Dotted | True/false |
| audio | #22C55E | Thick solid | Audio buffers |
| video | #3B82F6 | Thick solid | Video frames |
| texture | #EC4899 | Dashed | WebGL textures |
| data | #6B7280 | Solid | JSON objects |
| any | #FFFFFF | Dotted | Universal |

---

## Immediate TODOs for Next Session

```markdown
## Phase 1 Tasks - Core Editor
- [ ] Connection type validation (prevent incompatible connections)
- [ ] Node selection state (single and multi-select with Shift+click)
- [ ] Undo/redo with command pattern
- [ ] IndexedDB persistence for flows (Dexie.js)
- [ ] Copy/paste/duplicate nodes (Ctrl+C, Ctrl+V, Ctrl+D)
- [ ] Delete selected nodes (Delete/Backspace)
- [ ] Keyboard shortcuts system
- [ ] Node search with fuzzy matching
- [ ] Context menu for nodes and canvas
- [ ] Node inspector panel for selected node
```

---

## Commands to Get Started

```bash
# Navigate to project
cd /Users/obsidian/Projects/lumencanvas/clasp-flow

# Start development server
npm run dev

# Run tests
npm run test

# Build for web
npm run build:web

# Start Electron dev mode
npm run electron:dev

# Type check
npx vue-tsc --noEmit

# Lint
npm run lint
```

---

## Key Architectural Patterns

### Node Definition
```typescript
interface NodeDefinition {
  id: string;
  name: string;
  category: string;
  platforms: ('web' | 'electron')[];
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  controls: ControlDefinition[];
  executor: string;
  ui?: string;  // Custom Vue component
}
```

### Node Executor
```typescript
abstract class BaseNodeExecutor {
  abstract execute(inputs: Map<string, any>): Promise<Map<string, any>>;
}
```

### Platform Abstraction
```typescript
// Detect platform and provide appropriate services
const platform = detectPlatform(); // 'web' | 'electron'
const services = createServices(platform);
```

---

## Important URLs

- CLASP Protocol: https://clasp.to, https://github.com/lumencanvas/clasp
- Vue Flow: https://vueflow.dev/
- Tone.js: https://tonejs.github.io/
- Transformers.js: https://huggingface.co/docs/transformers.js/
- ffmpeg.wasm: https://ffmpegwasm.netlify.app/

---

## Questions Answered

1. **Why Vue over React?** - Preference for Vue ecosystem, native composition API patterns
2. **Why Vue Flow over React Flow?** - Native Vue 3 support, similar features
3. **Why not use Node-RED directly?** - Need custom UI, shader nodes, audio synthesis not available
4. **Why both Web and Electron?** - Web for accessibility, Electron for hardware access

---

## Session Log

| Date | Session | Accomplishments |
|------|---------|-----------------|
| 2026-01-17 | Initial Planning | Research complete, master plan created, architecture documented |
| 2026-01-17 | Phase 0 Implementation | Full project scaffolding, all core infrastructure built, 16 tests passing, web build verified |

---

## Resumption Prompt

When starting a new session, you can use this prompt:

> I'm continuing work on CLASP Flow. Please read the handoff document at `docs/handoff/SESSION_HANDOFF.md` and the master plan at `docs/plans/MASTER_PLAN.md`. The current status should be at the top of the handoff document. Let's continue from where we left off.

---

*Keep this document updated at the end of each session with the current status and any decisions made.*
