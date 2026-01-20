# LATCH Development Handoff

## Project Overview

LATCH (Live Art Tool for Creative Humans) is a node-based creative flow programming environment built on Vue 3 + Electron with 133+ nodes across 18 categories. It serves creative coders, VJs, installation artists, hardware hackers, and IoT makers.

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Desktop**: Electron
- **Audio**: Tone.js
- **3D/Shaders**: Three.js
- **AI/ML**: ONNX Runtime, MediaPipe Tasks Vision, Transformers.js
- **State**: Pinia stores
- **Testing**: Vitest (668 tests, 657 passing, 11 todo)

## Current Status

**Version**: 0.1.7
**Build**: Passing
**Tests**: 657 passed | 11 todo (668 total)
**Branch**: main

---

## Recent Session (2026-01-20) - Keyboard & Synth Nodes, Audio Restart Fix

### New Nodes Implemented

#### Keyboard Node (`registry/inputs/keyboard/`)
Virtual piano keyboard for MIDI note input with brutalist styling:
- **Styling**: Sharp edges, flat colors (cream keys, charcoal black keys, gray frame), no rounded corners
- **Features**: 25/49/61/88 key sizes, octave shift, velocity sensitivity, computer keyboard input
- **Outputs**: `note` (MIDI number), `velocity` (0-127), `gate` (boolean), `noteOn` (trigger)
- **Component**: `PianoKeyboard.vue` - reusable across flow view and control panel

**Files Created**:
- `components/controls/PianoKeyboard.vue` - Reusable brutalist piano component
- `registry/inputs/keyboard/definition.ts` - Node definition
- `registry/inputs/keyboard/KeyboardNode.vue` - Flow view component with header
- `registry/inputs/keyboard/index.ts` - Module exports

#### Synth Node (`registry/audio/_synth/`)
MIDI-driven polyphonic synthesizer using Tone.js:
- **Instruments**: Sine, Moog Bass, Piano, Organ, Pluck, Pad
- **Controls**: Volume, Attack, Decay, Sustain, Release (with RotaryKnob UI)
- **Instrument-specific**: Moog has filter cutoff/resonance/envelope, Pad has modulation index
- **Inputs**: `note`, `velocity`, `gate`, `trigger`
- **Output**: `audio` (Tone.js node for audio routing)

**Files Created**:
- `registry/audio/_synth/index.ts` - Node definition with instrument configs
- `registry/audio/_synth/SynthNode.vue` - Custom component with 3-column knobs grid

### Execution Engine Integration

Added executors for keyboard and synth nodes:

**Keyboard Executor** (`engine/executors/index.ts`):
- Outputs `note`, `velocity`, `gate`, `noteOn` from node controls
- Values set by Vue component on key press

**Synth Executor** (`engine/executors/audio.ts`):
- Receives note/velocity/gate from connected nodes
- Creates Tone.js synth voices (Synth, MonoSynth, FMSynth, AMSynth)
- Gate edge detection for note on/off
- Proper voice cleanup with release scheduling

### Control View Integration

- Added keyboard to `controlNodeTypes` in `ControlPanelView.vue`
- Keyboard renders with PianoKeyboard component
- Full note on/off handling in control view

### Priority-Based Auto-Layout (`stores/ui.ts`)

Added smart auto-layout system for control panel:
- `NODE_TYPE_PRIORITY` - Higher priority nodes placed first (main-output: 100, keyboard: 10)
- `NODE_TYPE_DEFAULT_SIZE` - Type-specific default dimensions
- `autoLayoutAll()` - Rearranges all controls by priority
- Keyboard special case: always placed at bottom, full width

### CRITICAL: Audio Restart Fix

**Problem**: Audio wouldn't restart after stopping and starting a flow.

**Root Cause**: Tone.js nodes become permanently unusable after `.dispose()`, but the caching system returned disposed nodes instead of creating new ones.

**Fixes Applied**:

1. **`getOrCreateNode()`** - Now checks if cached node is disposed:
   ```typescript
   if (node && (node as { disposed?: boolean }).disposed) {
     audioNodes.delete(nodeId)
     node = undefined
   }
   ```

2. **`disposeAllAudioNodes()`** - Now clears ALL state maps:
   - `synthState` - synth voices
   - `beatState` - beat detection
   - `playerState` - audio players (with disposal)
   - `svfState` - SVF filters (with disposal)
   - `pitchState` - pitch detection
   - `parametricEqState` - parametric EQ (with disposal)
   - `wavetableState` - wavetable oscillators (with disposal)

3. **`audioPlayerExecutor`** - Added disposed player detection to force reload

4. **`AudioManager.resume()`** - Resumes suspended AudioContext on restart

### Bug Fixes

- **Keyboard header width**: Extended to cover handles area with `background: #4b5563` on node
- **Synth node layout**: Made compact with 3-column knobs grid, reduced padding
- **Excessive logging**: Removed debug `console.log` from EqualizerNode, equalizer/trigger executors

### Files Modified

| File | Changes |
|------|---------|
| `engine/executors/audio.ts` | Synth executor, disposed node detection, state cleanup |
| `engine/executors/index.ts` | Keyboard executor, removed trigger logging |
| `registry/inputs/index.ts` | Export keyboard node |
| `registry/audio/index.ts` | Export synth node |
| `registry/components.ts` | Register KeyboardNode, SynthNode |
| `stores/flows.ts` | Added 'keyboard', 'synth' to specialNodeTypes |
| `composables/usePersistence.ts` | Added 'keyboard', 'synth' to specialNodeTypes |
| `stores/ui.ts` | Priority constants, auto-layout, default sizes |
| `views/ControlPanelView.vue` | Keyboard template, handlers |
| `services/audio/AudioManager.ts` | Added `resume()` method |
| `registry/debug/equalizer/EqualizerNode.vue` | Removed debug logging |

### RESOLVED: Texture Display in OUTPUT Nodes (2026-01-20)

**Problem**: Shaders and 3D renders would work in editor preview but show "No Input" in OUTPUT nodes.

**Root Cause**: Vue reactivity issue - `Object.fromEntries()` conversion in ExecutionEngine lost THREE.Texture identity, causing textures to not be retrievable from the reactive store.

**Solution**:
1. Added direct texture access methods to ExecutionEngine (`getNodeTexture()`, `getNodeOutputs()`, `getAllNodeOutputs()`)
2. MainOutputNode and TexturePreview now get textures directly from ExecutionEngine's internal Map (bypasses Vue reactivity)
3. Use `ThreeShaderRenderer.renderToCanvas()` for GPU-to-canvas display

**Key Files Modified**:
- `ExecutionEngine.ts` - Added direct Map access methods
- `MainOutputNode.vue` - Reads texture from engine directly, uses canvas 2D
- `TexturePreview.vue` - Same pattern as MainOutputNode

**Infrastructure Added** (for future 2D compositing):
- `UnifiedRenderer.ts` - PixiJS 8 + Three.js shared WebGL context
- `TextureBridge.ts` - Texture format conversion (Three ↔ PixiJS)

---

## Recent Session (2026-01-20) - MediaPipe Nodes & Function Editor

### New MediaPipe Nodes Implemented

Added three new MediaPipe-based AI nodes with custom Vue components:

| Node | Description | Outputs |
|------|-------------|---------|
| **Selfie Segmentation** | Separates person from background | mask, detected, loading |
| **Gesture Recognition** | Recognizes hand gestures (thumbs up, peace, fist, etc.) | gesture, confidence, landmarks, handedness |
| **Audio Classification** | Classifies audio (speech, music, animals, etc.) | category, confidence, isSpeech, isMusic |

**Files Created**:
- `registry/ai/mediapipe-segmentation/` - Definition, Vue component, index
- `registry/ai/mediapipe-gesture/` - Definition, Vue component, index
- `registry/ai/mediapipe-audio/` - Definition, Vue component, index

**MediaPipeService Extensions** (`services/ai/MediaPipeService.ts`):
- Added `loadImageSegmenter()` and `segmentImage()` methods
- Added `loadGestureRecognizer()` and `recognizeGestures()` methods
- Added `SegmentationResult` and `GestureResult` interfaces

### Function Node Custom UI

Added custom Vue component with embedded Monaco editor for the Function node:

- **FunctionNode.vue**: Collapsible Monaco editor directly in node
- **CodeEditorModal.vue**: Full-screen modal editor opened from Properties panel
- Monaco editor with JavaScript syntax highlighting, dark theme
- Help panel with available variables (`inputs.a`, `time`, `getState`/`setState`)
- Save/reset functionality with unsaved changes warning

**Files Created**:
- `registry/code/_function/FunctionNode.vue`
- `components/modals/CodeEditorModal.vue`

**Files Modified**:
- `stores/ui.ts` - Added `codeEditorOpen`, `codeEditorNodeId` state
- `components/layout/PropertiesPanel.vue` - Added "Open Code Editor" button
- `App.vue` - Registered CodeEditorModal

### Bug Fixes

#### Parametric EQ Touch/Click Offset
**Problem**: EQ band control points were offset from cursor position in the node (worked fine in Control Panel).

**Root Cause**: Canvas CSS size (`width: 100%`) differs from internal resolution (`props.width/height`). Mouse coordinates weren't scaled.

**Fix** (`components/controls/EQEditor.vue`):
```typescript
const scaleX = props.width / rect.width
const scaleY = props.height / rect.height
const x = (e.clientX - rect.left) * scaleX
const y = (e.clientY - rect.top) * scaleY
```

#### EQ Node Drag Prevention
**Problem**: Clicking EQ bands would drag the entire node instead of the individual control points.

**Fix**: Added `.stop` modifiers to canvas pointer events and `@mousedown.stop`/`@touchstart.stop` to prevent Vue Flow from capturing events.

#### MediaPipe Segmentation Mask Detection
**Problem**: Segmentation overlay wasn't showing - mask always appeared empty.

**Root Cause**: MediaPipe selfie segmenter outputs category 0 (background) or 1 (person), not 0 or 255. Check `maskData[i] > 128` was always false.

**Fix** (`MediaPipeSegmentationNode.vue`): Changed to `maskData[i] > 0`.

#### MediaPipe Overlay Text Cutoff
**Problem**: Status text on MediaPipe node overlays was being clipped at edges.

**Fix** (`registry/ai/utils/mediapipe-drawing.ts`):
- Added semi-transparent background to `drawLabel()` for readability
- Added `maxWidth` option with text truncation
- Updated all nodes to use proper margins (6px from edges)

### Multi-Hand Tracking Enhancement
Updated hand tracking to show all detected hands (not just the first):
- Added `allHands` output to `mediapipeHandExecutor`
- `MediaPipeHandNode.vue` iterates over all hands and draws each with handedness-based coloring

---

## Previous Session (2026-01-20)

### Attempted Texture Rendering Pipeline Fixes (PARTIAL SUCCESS)

**Problem**: Shaders rendered blank/black everywhere - both in shader editor preview AND output nodes showed "No Input".

**Partial Fix**: Shader editor preview now works. Main execution flow still broken.

**Root Cause**: After migrating to Three.js-based rendering (`ThreeShaderRenderer`), several components still used the OLD `ShaderRenderer`:
1. `MainOutputNode.vue` read from `ShaderRenderer.getCanvas()` while actual rendering went to `ThreeShaderRenderer`
2. AI executors didn't handle `THREE.Texture` inputs (only legacy `WebGLTexture`)
3. Shader editor preview animation loop wasn't starting (canvas inside `v-if` wasn't ready on `onMounted`)

**Fixes**:

| File | Issue | Fix |
|------|-------|-----|
| `MainOutputNode.vue` | Using wrong renderer | Changed from `getShaderRenderer()` to `getThreeShaderRenderer()`, added proper `THREE.Texture` handling |
| `ai.ts` | No `THREE.Texture` support | Added `isThreeTexture()` check and `threeTextureToImageData()` conversion function |
| `ai.ts` | Creating unnecessary WebGL context | Changed `isWebGLTexture()` and `webglTextureToImageData()` to use `ThreeShaderRenderer.getContext()` |
| `TexturePreview.vue` | Using legacy renderer for WebGLTexture | Changed to use `ThreeShaderRenderer.createTextureFromWebGL()` |
| `ShaderEditorModal.vue` | Animation loop not starting | Changed from `onMounted` to `watch(shaderEditorOpen)` with `nextTick` to wait for canvas |
| `ThreeShaderRenderer.ts` | `setSize()` called during render | Removed `setSize()` call in `render()` method - render targets already have correct size |
| `ShaderRenderer.ts` | No way to check if initialized | Added `hasShaderRenderer()` function to avoid creating renderer for cleanup |
| `visual.ts` | Creating legacy renderer for cleanup | Made legacy renderer cleanup conditional with `hasShaderRenderer()` |
| `App.vue` | Console spam from AI progress | Added 10% interval throttling to AI auto-load progress logs |

### Previous Shader System Fixes (same session)

**Problem**: Shaders would render blank/black with no visible error when compilation failed.

**Root Causes**:
1. Three.js logs shader compilation errors to console but doesn't throw exceptions
2. Shader cache key only used first 100 characters of code, causing stale shaders when edits occurred after char 100
3. `samplerCube` type was missing from several places in the shader pipeline

**Fixes** (`ThreeShaderRenderer.ts`, `visual.ts`, `ShaderPresets.ts`):
- Added console.error interception during shader compilation to capture Three.js error messages
- Changed shader cache key from `code.substring(0,100)` to djb2 hash of full code
- Added complete `samplerCube` support throughout shader system

---

## Previous Session (2026-01-19)

### Bugs Fixed

#### 1. MediaPipe Timestamp Mismatch Error
**Problem**: When playback stopped and restarted, MediaPipe nodes (Hand, Face, Pose, Object Detection) would fail with:
```
Packet timestamp mismatch on a calculator receiving from stream "norm_rect".
Current minimum expected timestamp is 48901901 but received 22900.
```

**Root Cause**: MediaPipe requires monotonically increasing timestamps. When playback restarts, `ctx.totalTime` resets to 0, causing timestamps to go backwards.

**Fix**: Added timestamp tracking and automatic landmarker reset in `MediaPipeService.ts`:
- Track last timestamp per task type
- Detect when timestamp goes backwards significantly
- Reset landmarker when timestamp resets (playback restart)
- Ensure timestamps are always monotonically increasing

**Files Modified**: `src/renderer/services/ai/MediaPipeService.ts`

#### 2. WebcamCapture OverconstrainedError
**Problem**: Repeated `OverconstrainedError` when starting webcam capture.

**Fix**: Changed `deviceId` constraint from `exact` to `ideal` in `WebcamCapture.ts:67-85`. This prevents errors when:
- The requested device is unavailable
- The device ID is 'default'
- Device enumeration hasn't completed yet

**Files Modified**: `src/renderer/services/visual/WebcamCapture.ts`

#### 3. Build Errors (TypeScript)
Fixed multiple TS errors across files:
- **AssetBrowser.vue**: Removed unused imports (`computed`, `watch`), prefixed unused params
- **useDeviceEnumeration.ts**: Removed unused `onUnmounted` import and subscription variables
- **MediaPipeService.ts**: Fixed `InstanceType` errors with MediaPipe's private constructors
- **AudioBufferService.ts**: Fixed interface and type casting issues for Tone.js integration

### Comprehensive Audits & Fixes Completed

Five parallel audit agents analyzed the codebase and identified 68+ issues across 42 files. **All critical and high-priority memory leak issues have been fixed** (see "Resource Management Fixes" section below). Lower-priority items (type safety, validation, edge cases) are documented in "Known Issues / Future Work".

| System | Critical/High Issues | Status |
|--------|---------------------|--------|
| Shader | displayMaterial leak, effectShaders not disposed | **FIXED** |
| BLE/Connectivity | Event listener accumulation, BLE characteristic handlers not removed | **FIXED** |
| MediaPipe/AI | disposedNodes tracking, STT cleanup, gcAIState | **FIXED** |
| Execution Engine | GC integration, disposal calls for all executors | **FIXED** |
| 3D | CanvasTexture leak, material disposal in mesh creators, GLTF URL change leak | **FIXED** |
| Audio | GC for all state maps (beat, SVF, pitch, parametricEQ, wavetable) | **FIXED** |
| Visual | Webcam snapshot cleanup, shader material cacheKey leak | **FIXED** |

---

## Key Architecture

### Node System
- **Registry**: `src/renderer/registry/` - Node definitions by category
- **Executors**: `src/renderer/engine/executors/` - Runtime behavior
- **Components**: `src/renderer/components/nodes/` - Vue components
- **Engine**: `src/renderer/engine/ExecutionEngine.ts` - Graph execution

### Services
- **Audio**: `src/renderer/services/audio/` - AudioManager, AudioBufferService
- **Visual**: `src/renderer/services/visual/` - WebcamCapture, ThreeShaderRenderer
- **AI**: `src/renderer/services/ai/` - AIInference, MediaPipeService
- **Connections**: `src/renderer/services/connections/` - BLE, Serial, MIDI, OSC, etc.

### Stores
- **flows.ts**: Graph state (nodes, edges, viewports)
- **runtime.ts**: Execution state
- **ui.ts**: UI state (panels, selection)
- **assets.ts**: Asset management

---

## Resource Management Fixes (2026-01-19)

Following a comprehensive audit of 68+ issues across 42 files, the following resource management fixes were implemented:

### Phase 1: Core Engine Integration (`ExecutionEngine.ts`)
- Added GC calls: `gcAudioState`, `gcVisualState`, `gcCodeState`, `gc3DState`, `gcConnectivityState`, `gcAIState`, `gcNodeMetrics`
- Added disposal calls: `disposeAllCodeNodes`, `disposeAll3DNodes`, `disposeAllConnectivityNodes`, `disposeAllAINodes`
- Integrated node metrics garbage collection into graph updates

### Phase 2: Connectivity Executor (`connectivity.ts`)
- Added `midiNoteOffTimeouts` Map to track MIDI timeouts
- Added `bleCharacteristicHandlers` Map to track BLE event listeners
- Nullify WebSocket/MQTT/OSC handlers before closing connections
- Proper BLE characteristic event listener cleanup (removeEventListener + stopNotifications)
- Full `gcConnectivityState()` function for orphaned network resources

### Phase 3: AI Executor (`ai.ts`)
- Added `disposedNodes` Set to prevent async callbacks on disposed nodes
- Added `gcAIState()` for cleaning up nodeCache, pendingOperations, sttState

### Phase 4: Visual/Shader Services
- `ShaderRenderer.ts`: Fixed framebuffer cleanup order (texture before framebuffer)
- `ThreeRenderer.ts`: Explicit depth texture disposal
- `ThreeShaderRenderer.ts`: Effect shaders and display material disposal
- `visual.ts`: Webcam snapshot and pending asset loads cleanup
- `visual.ts`: Fixed duplicate shader material key leak (cacheKey cleanup)

### Phase 5: 3D Executor (`3d.ts`)
- Added `canvasTextures` Map to track Three.js CanvasTexture instances
- Updated `convertToThreeTexture()` to cache and track canvas textures
- Updated `dispose3DNode()`, `disposeAll3DNodes()`, and `gc3DState()` to properly dispose canvas textures
- Fixed material disposal in all mesh creators (box, sphere, plane, cylinder, torus) - old materials now disposed when new material is assigned
- Fixed GLTF loader URL change leak:
  - Added `loadedGLTFUrls` Map to track loaded URL per node
  - Added `disposeGLTFGroup()` helper to properly traverse and dispose geometry/materials
  - GLTF loader now detects URL changes and disposes old model before loading new one
  - Updated disposal functions to use helper and clean up URL tracking

### Phase 6: Audio Services
- `AudioBufferService.ts`: Track owned MediaStream for proper track stopping

### Phase 7: Connection Adapters
- `WebSocketAdapter.ts`: Nullify handlers before close
- `BleAdapter.ts`: Track and remove `gattserverdisconnected` listener
- `MqttAdapter.ts`: Unsubscribe from topics before dispose (using `.keys()` for Map iteration)

### Phase 8: Vue Components
- `RotaryKnob.vue`: `onUnmounted` cleanup for mouse listeners
- `FlowTabs.vue`: Context menu listener cleanup
- `EditorView.vue`: `connectionErrorTimeout` cleanup

### Phase 9: Stores
- `runtime.ts`: Added `gcNodeMetrics()` method for cleaning up metrics of deleted nodes

---

## Session 2026-01-19 (Continued) - Lower Priority Audit Fixes

The following lower-priority items from the audit have been fixed:

### Shader System Fixes

| Item | Fix |
|------|-----|
| Regex recompiled every call | **FIXED** - Moved `UNIFORM_REGEX` and `BUILT_IN_UNIFORMS` to module-level constants |
| Animation frame cleanup edge case | **FIXED** - Added `isUnmounted` flag to prevent callbacks after unmount |
| No actual debounce implemented | **FIXED** - Added 300ms debounce to `handleCodeChange()` with proper cleanup |
| `samplerCube` not distinguished | **FIXED** - Added `samplerCube` as distinct type in `UniformDefinition` and parsing |
| Fragile name-based inference | **FIXED** - Added word-boundary matching to avoid false positives like "collideDamage" |
| **Shader errors render blank** | **FIXED** - Three.js logs errors but doesn't throw; added console.error interception to detect compilation failures |
| **Stale shader cache** | **FIXED** - Changed cache key from `code.substring(0,100)` to full code hash (djb2) to detect all code changes |
| `samplerCube` in `injectUniformDeclarations` | **FIXED** - Added missing case for samplerCube uniform injection |
| `samplerCube` uniform creation | **FIXED** - Added samplerCube handling in `ThreeShaderRenderer.compileShader()` |
| `ThreeShaderUniform` interface | **FIXED** - Added `samplerCube` to type union |

### 3D System Fixes

| Item | Fix |
|------|-----|
| Hardcoded 512x512 texture dimensions | **FIXED** - Added optional `width`/`height` parameters to `convertToThreeTexture()` |
| Group node clones every frame | **FIXED** - Added `groupState` tracking to only reclone when inputs change, proper material disposal |

### Audio System Fixes

| Item | Fix |
|------|-----|
| `autoCorrelate()` mutates input buffer | **FIXED** - Now copies to `processed` array before modifying |
| SVF drive toggle cleanup | **FIXED** - Properly disposes drive node when amount changes from >0 to 0 |
| Parametric EQ chain cleanup | **FIXED** - Added explicit chain disconnection in `disposeParametricEq()` |
| Oscillator volume no bounds | **FIXED** - Added `-96 dB` to `+6 dB` clamping |
| Audio player state on failed load | **FIXED** - Properly resets `state.player` to null on load errors |

---

## Known Issues / Future Work

### Architecture Improvements

1. **Race Conditions**: Graph updates and model loading have potential races (partially mitigated)
2. **Cache Size Limits**: Consider adding LRU eviction for unbounded caches (`textureDataCache`, `canvasTextureCache`)
3. **Error Handling**: Some error paths could be more robust with proper logging
4. **Type Safety**: Several unsafe `as` casts in executors could use runtime validation

---

## Development Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

---

## Contact

Project: LATCH - Live Art Tool for Creative Humans
Repository: lumencanvas/latch
