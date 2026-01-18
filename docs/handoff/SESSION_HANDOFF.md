# LATCH - Session Handoff Document

**Purpose**: This document ensures continuity when starting new sessions or clearing context. It provides the essential information needed to quickly resume work on LATCH.

---

## Quick Context

**Project**: LATCH - Live Art Tool for Creative Humans
**Organization**: LumenCanvas (2026)
**Repository**: `/Users/obsidian/Projects/lumencanvas/clasp-flow`
**Type**: Web + Electron application
**Stack**: Vue 3, TypeScript, Vue Flow, Pinia, Vite, Electron Forge

---

## Current Status

### Phase: 9 Complete - 3D System + Polish + UX/Debug Node Improvements
### Next Step: EditorView Componentization & Registry Extraction

### Latest Session Accomplishments (Trigger Fixes, Flow Rename, Executor Cleanup):

**Trigger Node Fix - Edge Detection:**
- Trigger now only outputs when button is pressed (rising edge detection)
- Returns empty `Map()` when not firing - no output at all
- Prevents trigger from firing on flow start or continuously

**Flow Rename:**
- Already had right-click context menu with Rename option
- Added double-click on tab name to trigger rename modal
- Rename modal with input field, Enter to confirm, Escape to cancel

**Executor Output Cleanup - Proper Value Holding:**
- `Monitor` - now holds last received value (doesn't go blank)
- `Gate` - holds last value that passed through when open
- `Delay` - holds last delayed value that fired
- `Start` - only outputs on first frame, nothing after
- `Interval` - only outputs when interval elapses, nothing between

**Files Modified:**
- `src/renderer/engine/executors/index.ts` - Fixed trigger, monitor, gate, delay, start, interval executors
- `src/renderer/components/layout/FlowTabs.vue` - Added double-click rename

---

### Previous Session (XY Pad, Equalizer, Audio Fixes):

**XY Pad Executor Fix:**
- Added `xyPadExecutor` to builtinExecutors registry
- XY Pad now outputs rawX, rawY, normX, normY values correctly

**Equalizer Persistence Fix:**
- Added `graph`, `equalizer`, `textbox` to specialNodeTypes in `usePersistence.ts`
- Now saved flows correctly restore custom node types on load

**Audio System Initialization:**
- Added `audioManager.initialize()` call in `useExecutionEngine.start()`
- Now audio system initializes when play button is pressed (user gesture)

---

### Previous Session Accomplishments (Memory Leaks, AI Fixes, UI Polish):

**Memory Leak Fixes:**
- Fixed nested `onUnmounted` anti-pattern in AppSidebar, AppHeader, AIModelManagerModal
- Subscription cleanup now uses module-scope variables with top-level onUnmounted
- Added click-outside handler cleanup for custom dropdown

**AI System Fixes:**
- Fixed progress bar showing 6395% - now properly tracks per-file progress
- AI executors rewritten to be non-blocking (require pre-loaded models)
- Fixed trigger detection: only `true` or `1` triggers AI nodes (not just any truthy value)

**MiniMap Enhancement:**
- Nodes in MiniMap now colored by their category color
- Uses `getNodeMinimapColor()` function in EditorView

**Category Dropdown Redesign:**
- Custom dropdown replacing native select in AppSidebar
- Color badges next to each category name
- Rainbow gradient badge for "All Categories"
- Click-outside closes dropdown

**Equalizer Node Improvement:**
- Static "NO SIGNAL" display when not receiving audio
- Live FFT visualization when running with audio input
- Fixed: Added `equalizer` and `graph` to specialNodeTypes in flows.ts (was rendering as BaseNode)

**Bug Fix - Custom Node Types:**
- `equalizer` and `graph` were missing from `specialNodeTypes` array in flows.ts
- This caused them to render as BaseNode instead of their custom components
- Fix: Added to specialNodeTypes list alongside monitor, oscilloscope, etc.
- NOTE: Fixed persistence migration to also remap these types on load

**3D Rendering Fix:**
- Issue: 3D scenes rendered black because WebGL textures can't be shared between contexts
- ThreeRenderer and ShaderRenderer have separate WebGL contexts
- Fix: Added `renderToCanvas()` method to ThreeRenderer
- Fix: Updated mainOutputExecutor to accept HTMLCanvasElement and convert to texture
- Added default directional light (intensity 0.8) + ambient light (intensity 0.6) to scenes
- Lights connect to Scene 3D's "objects" input (not a separate "lights" input)

**AI Web Workers Plan:**
- Created detailed implementation plan at `docs/plans/AI_WEB_WORKERS_PLAN.md`
- Moves Transformers.js inference to dedicated Web Worker
- Prevents UI freezing during model inference
- Uses message passing with transferable objects for images

**AI Executors Updated:**
- All AI executors now use `setTimeout(0)` to defer to next event loop tick
- Text generation now REQUIRES explicit trigger (won't auto-run on text change)
- Increased default throttle intervals for image operations (60-120 frames)
- Executors are no longer async functions - they return immediately

---

### Previous Session Accomplishments (UX Polish & Debug Nodes):

**Node Label Editing:**
- Double-click on node title in BaseNode to edit label
- Label editing in PropertiesPanel with pencil icon
- Properly stops event propagation to allow editing without triggering drag

**Compact Node Design:**
- Nodes with many properties (math, logic, 3d, audio categories) now use compact design
- Shows category color fill with centered icon instead of full controls
- Control nodes excluded: slider, trigger, xy-pad, constant, lfo, monitor, oscilloscope

**Handle Consistency & Collapsed Nodes:**
- XYPadNode refactored to use same handles-column pattern as BaseNode
- All handles use consistent port-label styling with hover behavior
- Collapsed nodes now show only header (fixed white body issue)
- Collapsed nodes stack all handles at same position (appear as single handle per side)

**Properties Panel Improvements:**
- Added color picker control type support
- Added toggle button in AppHeader to reopen properties panel when closed
- Fixed reactivity - panel now updates when node properties change directly on nodes

**New Debug Nodes:**
- **Oscilloscope**: Now accepts both number signals AND audio input (universal signal viewer)
  - Auto-detects mode based on connected input
  - Uses Tone.js Waveform analyzer for audio
  - Shows "AUDIO" or signal value indicator
- **Equalizer**: Audio frequency spectrum visualization
  - Animated bar display with FFT data
  - Controls: bar count (8-32), color mode (gradient/spectrum/solid), smoothing
  - Color modes: gradient (green→red), spectrum (rainbow), solid (cyan)
- **Graph**: Flexible X/Y plotter
  - Starts with 1 point (x, y), can add up to 8 series via +/- buttons
  - Display modes: line (connected) or scatter (dots with trail)
  - Auto-scaling, grid overlay, point history for trail effects
  - Color-coded series (green, blue, amber, red, purple, pink, teal, orange)

---

## New/Modified Files This Session

| File | Changes |
|------|---------|
| `src/renderer/components/nodes/BaseNode.vue` | Label editing, compact nodes, collapsed CSS fixes |
| `src/renderer/components/nodes/XYPadNode.vue` | Refactored to handles-column pattern |
| `src/renderer/components/nodes/OscilloscopeNode.vue` | Added audio input, dual-mode display |
| `src/renderer/components/nodes/GraphNode.vue` | NEW - Flexible X/Y plotter |
| `src/renderer/components/nodes/EqualizerNode.vue` | NEW - Audio frequency visualizer |
| `src/renderer/components/layout/PropertiesPanel.vue` | Color picker, label editing, deep watch for reactivity |
| `src/renderer/components/layout/AppHeader.vue` | Properties panel toggle button |
| `src/renderer/engine/executors/index.ts` | Updated oscilloscopeExecutor, added graphExecutor, equalizerExecutor |
| `src/renderer/views/EditorView.vue` | Registered Graph, Equalizer nodes, updated Oscilloscope inputs |

---

## Previous Session Summary (3D System + Polish)

**3D System (Phase 9):**
- ThreeRenderer.ts service with WebGL rendering
- 17 new 3D nodes: Scene, Camera, Render, primitives, lights, materials, transforms
- 7 new data types: scene3d, object3d, geometry3d, material3d, camera3d, light3d, transform3d
- Texture-to-3D pipeline with convertToThreeTexture() helper

**Rebrand & Polish:**
- Renamed from "CLASP Flow" to "LATCH" (Live Art Tool for Creative Humans)
- LATCH logo (brackets with diagonal latch bar, orange accents)
- Animated loading screen with bracket drawing animation
- Monitor/Trigger/XYPad node fixes for persistence
- Console node only logs on value change

---

## Key Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Master Plan | `docs/plans/MASTER_PLAN.md` | Complete project roadmap, phases, node types |
| UI Redesign Plan | `docs/plans/UI_REDESIGN_PLAN.md` | UI enhancement design document |
| AI Web Workers Plan | `docs/plans/AI_WEB_WORKERS_PLAN.md` | Plan for moving AI to Web Workers |
| Architecture | `docs/architecture/ARCHITECTURE.md` | Technical architecture, file structure, APIs |
| This Handoff | `docs/handoff/SESSION_HANDOFF.md` | Session continuity |

---

## Project Architecture Summary

### Debug Nodes (Visual)
| Node | Purpose | Inputs | Features |
|------|---------|--------|----------|
| Monitor | Display any value | any | Color-coded type display, passthrough |
| Oscilloscope | Waveform viewer | number, audio | Dual-mode, canvas-based, TIME/AMP controls |
| Equalizer | Frequency spectrum | audio | FFT bars, gradient/spectrum/solid colors |
| Graph | X/Y plotter | x0/y0 to x7/y7 | Dynamic series, line/scatter, auto-scale |

### Custom Node Components
| Component | Purpose |
|-----------|---------|
| BaseNode.vue | Standard node with handles-column pattern, compact mode, label editing |
| TriggerNode.vue | Large trigger button with output modes |
| XYPadNode.vue | 2D touch/mouse input with raw/normalized outputs |
| MonitorNode.vue | Value display with type-based coloring |
| OscilloscopeNode.vue | Canvas waveform for signals/audio |
| GraphNode.vue | Canvas X/Y plotter with multiple series |
| EqualizerNode.vue | Canvas FFT bar display |
| MainOutputNode.vue | Final output preview with expand toggle |

---

## Data Flow Patterns

### Signal Visualization
```
[LFO] ──(number)──→ [Oscilloscope/Graph]
```

### Audio Visualization
```
[Oscillator] ──(audio)──→ [Oscilloscope]  (waveform)
[Oscillator] ──(audio)──→ [Equalizer]     (spectrum)
```

### 3D Pipeline
```
[Box 3D] ──(object3d)──→ [Scene 3D] ──(scene3d)──→ [Render 3D] ──(texture)──→ [Main Output]
[Light] ────(object3d)──→ [Scene 3D]                     ↑
[Camera 3D] ──(camera3d)─────────────────────────────────┘
```

---

## How to Use 3D Nodes

The 3D system requires a specific setup to render anything. Here's the minimum required:

### Minimum Setup for 3D Rendering

You need **exactly 3 essential nodes** connected in the right order:

1. **Scene 3D** - Container for all 3D objects
2. **Camera 3D** - Viewpoint for rendering
3. **Render 3D** - Outputs the final texture

```
                                    ┌─────────────┐
                                    │  Camera 3D  │
                                    │  posY: 2    │
                                    │  posZ: 5    │
                                    └──────┬──────┘
                                           │ camera
                                           ▼
┌──────────┐ object   ┌────────────┐ scene ┌────────────┐ texture ┌─────────────┐
│  Box 3D  │─────────▶│  Scene 3D  │──────▶│  Render 3D │────────▶│ Main Output │
└──────────┘          └────────────┘       └────────────┘         └─────────────┘
```

### Step-by-Step Instructions

1. **Create Scene 3D node** (3D > Scene)
   - This is the container for all 3D objects
   - Optional: Enable "Show Grid" to see the ground plane
   - Optional: Change background color

2. **Create Camera 3D node** (3D > Camera)
   - Set position: posX=0, posY=2, posZ=5 (default is good)
   - Connect `camera` output → `camera` input of Render 3D

3. **Create Render 3D node** (3D > Render)
   - Connect `scene` input ← `scene` output of Scene 3D
   - Connect `camera` input ← `camera` output of Camera 3D
   - Set width/height for resolution (512x512 default)
   - Connect `texture` output → Main Output

4. **Add objects** (3D > Primitives)
   - Create Box, Sphere, Cylinder, Torus, or Plane
   - Connect `object` output → `objects` input of Scene 3D
   - Objects at origin (0,0,0) will be visible if camera is positioned correctly

### Adding Lights

Without explicit lights, Scene 3D adds a default ambient light. For better lighting:

```
┌─────────────────┐ object
│ Directional     │────────▶ Scene 3D (objects input)
│ Light 3D        │
│ posX:5 posY:5   │
└─────────────────┘
```

- **Ambient Light**: Even lighting everywhere
- **Directional Light**: Sun-like, casts shadows
- **Point Light**: Bulb-like, radiates from position
- **Spot Light**: Cone-shaped, like a flashlight

### Adding Materials

Connect a Material 3D node to change object appearance:

```
┌───────────────┐ material  ┌──────────┐ object  ┌────────────┐
│  Material 3D  │──────────▶│  Box 3D  │────────▶│  Scene 3D  │
│  color: red   │           └──────────┘         └────────────┘
│  metalness: 1 │
└───────────────┘
```

Material properties:
- **type**: standard, basic, phong, physical
- **color**: Hex color
- **metalness**: 0-1 (for standard/physical)
- **roughness**: 0-1 (shiny to matte)
- **wireframe**: Show as wireframe
- **colorMap**: Connect a texture input

### Transforming Objects

Use Transform 3D to position, rotate, and scale:

```
┌──────────┐ object  ┌──────────────┐ object  ┌────────────┐
│  Box 3D  │────────▶│ Transform 3D │────────▶│  Scene 3D  │
└──────────┘         │ rotY: 45     │         └────────────┘
                     │ scaleX: 2    │
                     └──────────────┘
```

Or animate with LFO:

```
┌───────┐ value  ┌──────────────┐
│  LFO  │───────▶│ Transform 3D │──▶ rotY input
└───────┘        └──────────────┘
```

### Grouping Objects

Use Group 3D to combine multiple objects:

```
┌──────────┐ object
│  Box 3D  │────────┐
└──────────┘        │
                    ▼ objects
┌───────────┐ object  ┌──────────┐ object  ┌────────────┐
│  Sphere   │────────▶│ Group 3D │────────▶│  Scene 3D  │
└───────────┘         └──────────┘         └────────────┘
```

### Loading 3D Models

Use GLTF Loader for external models:

```
┌─────────────┐ object  ┌────────────┐
│ GLTF Loader │────────▶│  Scene 3D  │
│ url: *.glb  │         └────────────┘
└─────────────┘
```

### Common Issues

| Problem | Solution |
|---------|----------|
| Black screen | Check Camera 3D is connected AND positioned (posZ: 5) |
| Nothing visible | Objects at origin; ensure camera isn't at same position |
| No lighting | Add Directional Light or Ambient Light |
| Objects too small | Increase scale or move camera closer (posZ: 2) |
| Objects clipped | Adjust camera near/far planes |

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
- **Analysis**: Meyda.js + web-audio-beat-detector + Tone.FFT/Waveform
- **Core**: Web Audio API

### Video/Graphics
- **2D**: Canvas 2D, WebGL2
- **3D**: Three.js
- **Shaders**: GLSL (WebGL2)
- **Processing**: ffmpeg.wasm

### AI
- **Runtime**: Transformers.js (ONNX Runtime)

### Styling
- **System**: Custom CSS with design tokens
- **Icons**: Lucide
- **Font**: JetBrains Mono

---

## Commands to Get Started

```bash
# Navigate to project
cd /Users/obsidian/Projects/lumencanvas/clasp-flow

# Start development server
npm run dev

# Run tests
npm run test

# Type check
npm run typecheck

# Build for web
npm run build

# Start Electron dev mode
npm run electron:dev
```

---

## Known Issues

| Issue | Description | Workaround |
|-------|-------------|------------|
| AI freezes UI | Transformers.js runs on main thread | Implement Web Workers (plan created) |
| EditorView monolith | 2700+ line file with inline node registry | Needs componentization |

## Immediate TODOs for Next Session

```markdown
## CRITICAL - Code Architecture
- [ ] Break up EditorView.vue (2700+ lines) into proper components
- [ ] Extract node registry into separate file(s)
- [ ] Create proper separation of concerns
- [ ] Ensure 100% feature parity after refactor

## High Priority
- [ ] Implement AI Web Workers (see docs/plans/AI_WEB_WORKERS_PLAN.md)

## Testing
- [ ] Test trigger edge detection
- [ ] Test flow rename (double-click and context menu)
- [ ] Test monitor value persistence

## Features Pending
- [ ] Video file player node (use ffmpeg.wasm)
- [ ] Node development documentation for custom nodes
```

---

## Session Log

| Date | Session | Accomplishments |
|------|---------|-----------------|
| 2026-01-17 | Initial - Phase 0-4 | Full project setup, execution engine, audio, visual, persistence |
| 2026-01-17 | Phase 5-7 | AI integration, connectivity, code nodes, subflows, control panel, multi-flow tabs |
| 2026-01-17 | Phase 8 | Custom node loader system |
| 2026-01-17 | Phase 9 | 3D system with Three.js |
| 2026-01-17 | Polish & Rebrand | LATCH rebrand, logo, loading screen, node fixes |
| 2026-01-17 | UX Fixes | Handle positioning, control data flow, Oscilloscope node |
| 2026-01-17 | Debug Nodes & UX | Label editing, compact nodes, collapsed node fixes, Graph node, Equalizer node, Oscilloscope audio support, Properties panel reactivity |
| 2026-01-17 | Stability & Polish | Memory leak fixes, AI executor fixes (non-blocking, progress bar), MiniMap colors, category dropdown colors, Equalizer demo animation, 3D documentation |
| 2026-01-17 | 3D & AI Fixes | Fixed 3D black rendering (WebGL context sharing), AI Web Workers plan, AI executors with setTimeout defer, custom node type fixes |
| 2026-01-17 | XY Pad & Audio | Fixed XY Pad executor missing, fixed Equalizer persistence, added audioManager initialization on play |
| 2026-01-17 | Trigger & Cleanup | Trigger edge detection, flow rename UI, executor output cleanup (monitor/gate/delay hold values) |

---

## Resumption Prompt

When starting a new session, you can use this prompt:

> I'm continuing work on LATCH (Live Art Tool for Creative Humans). Please read the handoff document at `docs/handoff/SESSION_HANDOFF.md` and the master plan at `docs/plans/MASTER_PLAN.md`. The current status should be at the top of the handoff document. Let's continue from where we left off.

---

*Keep this document updated at the end of each session with the current status and any decisions made.*
