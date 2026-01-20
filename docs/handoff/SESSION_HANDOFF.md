# LATCH - Session Handoff Document

**Purpose**: This document ensures continuity when starting new sessions or clearing context. It provides the essential information needed to quickly resume work on LATCH.

---

## Quick Context

**Project**: LATCH - Live Art Tool for Creative Humans
**Organization**: LumenCanvas (2026)
**Repository**: `lumencanvas/latch` (GitHub)
**Local Path**: `/Users/obsidian/Projects/lumencanvas/latch`
**Demo**: https://latch.design
**Type**: Web + Electron application
**Stack**: Vue 3, TypeScript, Vue Flow, Pinia, Vite, Electron Forge

---

## Current Status

### Phase: 9 Complete - 3D System + Polish + Full Feature Set
### Next Step: Phase 10 - Polish & Export
### Latest Release: v0.1.3

### Latest Session Accomplishments (Texture Display Fix, PixiJS Infrastructure)

**Fixed Texture Display in OUTPUT Nodes (Critical Bug)**
- **Problem**: Shaders and 3D renders worked in editor preview but showed "No Input" in OUTPUT nodes
- **Root Cause**: Vue reactivity issue - `Object.fromEntries()` in ExecutionEngine lost THREE.Texture identity
- **Solution**:
  1. Added direct texture access methods to ExecutionEngine (`getNodeTexture()`, `getNodeOutputs()`, `getAllNodeOutputs()`)
  2. MainOutputNode and TexturePreview now get textures directly from ExecutionEngine's internal Map
  3. Use `ThreeShaderRenderer.renderToCanvas()` for GPU-to-canvas display

**Added PixiJS 8 Infrastructure (for future 2D compositing)**
- Created `UnifiedRenderer.ts` - Hybrid PixiJS 8 + Three.js with shared WebGL context
- Created `TextureBridge.ts` - Texture format conversion between Three.js and PixiJS
- Added context loss handling with callback system
- Added PixiJS 8 dependency (`pixi.js@^8.7.0`)

**Files Created:**
- `src/renderer/services/visual/UnifiedRenderer.ts` - Shared WebGL context manager
- `src/renderer/services/visual/TextureBridge.ts` - Texture format bridge

**Files Modified:**
- `src/renderer/engine/ExecutionEngine.ts` - Added direct Map access methods
- `src/renderer/registry/outputs/main-output/MainOutputNode.vue` - Uses canvas 2D with direct engine access
- `src/renderer/components/preview/TexturePreview.vue` - Same pattern as MainOutputNode
- `src/renderer/services/visual/ThreeShaderRenderer.ts` - Added shared renderer support
- `src/renderer/engine/executors/visual.ts` - Added TextureBridge GC call

---

### Previous Session Accomplishments (Shader Fix, BLE Enhancement, MediaPipe, Tests):

**Critical Shader Preview Bug Fix:**
- Root cause: Preset shader code used uniforms without `uniform` declarations - definitions were in preset metadata, not the code
- Fix: Created `injectUniformDeclarations()` in `ShaderPresets.ts` that prepends uniform declarations to preset code
- When a preset is selected, uniforms are now injected into the code before storing
- This makes `parseUniformsFromCode()` find the uniforms correctly when the shader editor opens
- Round-trip now works: preset → inject uniforms → store → parse → compile with uniforms

**BLE Enhancement System:**
- Created `BleAdapter.ts` - full BLE adapter with scanning, service discovery, characteristic operations
- Created `BleProfileRegistry.ts` - registry of standard BLE profiles (Heart Rate, Battery, Environmental Sensing, Cycling, Running)
- Created 3 new BLE nodes:
  - `ble-scanner.ts` - Scan for nearby BLE devices
  - `ble-device.ts` - Connect to and manage BLE device
  - `ble-characteristic.ts` - Read/write/subscribe to BLE characteristics
- Added executors for all BLE nodes in `connectivity.ts`
- Supports multiple data formats: uint8, int16, float32, utf8, raw

**MediaPipe Integration:**
- Created `MediaPipeService.ts` - centralized service for vision tasks (hand, face, pose, object detection)
- Created 4 new MediaPipe nodes:
  - `mediapipe-hand.ts` - Hand landmark detection with gesture recognition
  - `mediapipe-face.ts` - Face mesh with blendshapes and head rotation
  - `mediapipe-pose.ts` - Body pose estimation
  - `mediapipe-object.ts` - Object detection
- Added helper functions: `extractFingerTips()`, `recognizeGesture()`, `extractHeadRotation()`, `calculateFaceBox()`, `extractBlendshapeValues()`
- Added executors in `ai.ts` for all MediaPipe nodes
- Added `@mediapipe/tasks-vision` dependency

**Comprehensive Test Suite:**
- Created `tests/unit/services/visual/ShaderPresets.test.ts` - 47 tests for shader system
  - Tests uniform parsing (all GLSL types)
  - Tests uniform injection
  - Tests round-trip (inject → parse)
  - Tests preset management
- Created `tests/unit/services/ble/BleProfileRegistry.test.ts` - 37 tests for BLE profiles
  - Tests service/characteristic lookup
  - Tests data parsing (heart rate, battery, temperature, humidity, cycling, running)
  - Tests device type detection
- Created `tests/unit/services/ai/MediaPipeService.test.ts` - 24 tests for MediaPipe helpers
  - Tests gesture recognition (7 gesture types)
  - Tests face box calculation
  - Tests head rotation extraction
  - Tests blendshape extraction
- Total: 668 tests passing (657 passed, 11 todo)

**Shader UX Design Document:**
- Created `docs/shader-ux-design.md` following Smart Node Design Philosophy
- Analyzed current state and proposed improvements:
  - Error State Visibility - show compilation errors inline
  - Visual Preset Picker - thumbnail grid instead of dropdown
  - Preset vs Custom Mode - clear distinction
  - Quick Uniform Tweaking - enhanced slider controls

**Files Created:**
- `src/renderer/services/connections/adapters/BleAdapter.ts` - BLE adapter
- `src/renderer/services/ble/BleProfileRegistry.ts` - BLE profile registry
- `src/renderer/registry/connectivity/ble-scanner.ts` - BLE scanner node
- `src/renderer/registry/connectivity/ble-device.ts` - BLE device node
- `src/renderer/registry/connectivity/ble-characteristic.ts` - BLE characteristic node
- `src/renderer/services/ai/MediaPipeService.ts` - MediaPipe service
- `src/renderer/registry/ai/mediapipe-hand.ts` - Hand tracking node
- `src/renderer/registry/ai/mediapipe-face.ts` - Face mesh node
- `src/renderer/registry/ai/mediapipe-pose.ts` - Pose estimation node
- `src/renderer/registry/ai/mediapipe-object.ts` - Object detection node
- `tests/unit/services/visual/ShaderPresets.test.ts` - Shader tests
- `tests/unit/services/ble/BleProfileRegistry.test.ts` - BLE tests
- `tests/unit/services/ai/MediaPipeService.test.ts` - MediaPipe tests
- `docs/shader-ux-design.md` - Shader UX design document

**Files Modified:**
- `src/renderer/services/visual/ShaderPresets.ts` - Added `injectUniformDeclarations()` function
- `src/renderer/engine/executors/visual.ts` - Uses `injectUniformDeclarations()` when loading presets
- `src/renderer/engine/executors/connectivity.ts` - Added BLE executors
- `src/renderer/engine/executors/ai.ts` - Added MediaPipe executors
- `src/renderer/registry/connectivity/index.ts` - Registered BLE nodes
- `src/renderer/registry/ai/index.ts` - Registered MediaPipe nodes
- `package.json` - Added `@mediapipe/tasks-vision` dependency

---

### Previous Session Accomplishments (AI Auto-Load, Control Panel Fixes):

**AI Model Auto-Load on Startup:**
- Added ability to configure AI models to load automatically when the app starts
- New "Load on startup" toggle per model in AI Model Manager
- Settings persisted to IndexedDB alongside other app settings
- Auto-load runs in background after app initialization (non-blocking)
- Persists selected models per task, WebGPU preference, and cache settings

**Files Modified for AI Auto-Load:**
- `src/renderer/services/database.ts` - Added AI settings to AppSettings interface:
  - `aiAutoLoadModels: string[]` - models to auto-load
  - `aiSelectedModels: Record<string, string>` - persisted model selections
  - `aiUseWebGPU: boolean`, `aiUseBrowserCache: boolean`
- `src/renderer/services/ai/AIInference.ts` - Added auto-load methods:
  - `loadSettingsFromStorage()` / `saveSettingsToStorage()`
  - `addAutoLoadModel()` / `removeAutoLoadModel()` / `isAutoLoadEnabled()`
  - `autoLoadModels()` - loads all configured models
- `src/renderer/components/modals/AIModelManagerModal.vue` - Added UI toggle
- `src/renderer/App.vue` - Calls auto-load on app initialization

**Control Panel Oscilloscope Fix:**
- Fixed oscilloscope in Control Panel view not matching Flow Editor
- Issue: Control Panel only handled signal mode, ignored audio mode
- Now checks `_mode` from node metrics (audio vs signal)
- Audio mode: draws waveform from `_input_waveform` data, shows "AUDIO" label
- Signal mode: accumulates history and shows numeric value
- Updated grid styling to match flow editor (8 vertical divisions, green-tinted grid)

---

### Previous Session Accomplishments (Shader Node Dynamic Ports Overhaul):

**Complete Shader Node Rewrite - Dynamic Uniform-to-Port System:**

The shader node was completely broken - uniforms declared in GLSL code had no way to receive values because ports were static. This has been fixed with a dynamic port generation system.

**New Architecture:**
- Uniforms declared in shader code automatically become input ports
- Ports update when code is saved in the shader editor
- Presets automatically update ports when selected
- Values flow from input ports → shader uniforms seamlessly

**Files Created/Modified:**
- `src/renderer/services/visual/ShaderPresets.ts` - Robust GLSL parser
  - Handles precision qualifiers, comments, all GLSL types
  - Smart defaults based on uniform names (colors get white, scale gets 1.0, etc.)
  - `parseUniformsFromCode()`, `generateInputsFromUniforms()`, `generateControlsFromUniforms()`
  - `uniformTypeToDataType()` maps GLSL types to node port types

- `src/renderer/stores/flows.ts` - Dynamic port mutation API
  - `updateNodeDynamicInputs()` - Store dynamic inputs in node.data._dynamicInputs
  - `updateNodeDynamicControls()` - Store dynamic controls in node.data._dynamicControls
  - `getNode()` - Helper to get node by ID

- `src/renderer/registry/visual/shader.ts` - Minimal static definition
  - Only static ports: iChannel0-3 (texture inputs) + texture output
  - All other inputs are dynamic based on shader code

- `src/renderer/engine/executors/visual.ts` - Dynamic uniform handling
  - Reads values from dynamic inputs
  - Handles type conversions (hex colors → vec3, arrays → vec types)
  - Signals port updates when presets change via special outputs

- `src/renderer/engine/ExecutionEngine.ts` - Special output handler
  - `handleSpecialOutputs()` watches for `_dynamicInputs`, `_dynamicControls`, `_preset_code`
  - Automatically updates node data when executor signals changes

- `src/renderer/components/nodes/BaseNode.vue` - Dynamic port rendering
  - Merges static definition ports with dynamic ports from node.data
  - Inputs: `definition.inputs + node.data._dynamicInputs`
  - Controls: `definition.controls + node.data._dynamicControls`

- `src/renderer/components/modals/ShaderEditorModal.vue` - Live uniform detection
  - Shows detected uniforms in real-time as you type
  - "Dynamic Inputs" panel shows what ports will be created
  - On save: parses code, generates ports, updates node

**How It Works Now:**
```glsl
// Write this in your shader:
uniform float u_brightness;    // → Creates number input port
uniform vec3 u_tint;           // → Creates color/data input port
uniform sampler2D u_overlay;   // → Creates texture input port
```
The node automatically gets input handles for these uniforms that can be connected to other nodes!

**Key Design Decisions:**
1. Dynamic ports stored in `node.data` (not modifying shared NodeDefinition)
2. BaseNode merges static + dynamic ports in computed properties
3. Executor signals via special `_` prefixed outputs (not direct store access)
4. Engine handles `_dynamicInputs` outputs and updates node data
5. Preset changes trigger automatic port regeneration

---

### Previous Session Accomplishments (Monitor Node, Debug Panel, STT Fix):

**Monitor Node Enhancements:**
- Added resizable capability with drag handle in bottom-right corner
- Stores width/height in node data via `flowsStore.updateNodeData()`
- Added clear button in header to reset displayed value
- Minimum size constraints (140px width, 80px height)

**Debug Panel Tab:**
- Added new Debug panel as a tab in the Properties Panel area
- Tab bar with "Properties" and "Debug" tabs (Settings/Bug icons)
- Created `DebugPanel.vue` component with collapsible sections:
  - **Runtime Status**: FPS, target FPS, frame count, uptime, active nodes, connections
  - **Errors**: Error list with timestamps, click-to-highlight node, clear button
  - **Node Performance**: Sorted by execution time, shows errors per node, clear metrics button
- Automatically switches to Properties tab when a node is inspected
- Follows project design language with consistent styling

**Vue Vnode Warning Fix:**
- Fixed "Invalid vnode type when creating vnode: undefined" warnings in PropertiesPanel
- Changed `<template v-else>` to `<div v-else>` wrapper (Vue 3 vnode issue)
- Removed unused icon imports from DebugPanel.vue

**Files Created:**
- `src/renderer/components/debug/DebugPanel.vue` - Debug panel component

**Files Modified:**
- `src/renderer/registry/debug/monitor/MonitorNode.vue` - Resize handle, clear button, dimension storage
- `src/renderer/components/layout/PropertiesPanel.vue` - Tab bar, debug panel integration

---

### Previous Session Accomplishments (STT Pipeline Fix, Type Conversion System, Stability):

**Speech-to-Text Pipeline Fix:**
- STT node was broken - Audio Input outputs Tone.js nodes but STT executor expected Float32Array
- Rewrote `speechRecognitionExecutor` to detect Tone.js audio nodes and use AudioBufferService
- Each STT node now gets its own AudioBufferServiceImpl instance
- AudioBufferService captures audio, resamples from 44.1kHz/48kHz to 16kHz (Whisper requirement)
- Added `isToneAudioNode()` type guard for audio input detection
- Added silent gain node to AudioBufferService to prevent audio playback through speakers

**AI Image Nodes Type Conversion System:**
- Image Classification, Image Captioning, and Object Detection could receive WebGLTexture from visual nodes
- These executors expected ImageData or HTMLCanvasElement - caused runtime failures
- Added comprehensive type conversion system to ai.ts:
  - `isImageData()`, `isHTMLCanvasElement()`, `isHTMLVideoElement()`, `isWebGLTexture()` type guards
  - `webglTextureToImageData()` - reads pixels from WebGL texture via framebuffer
  - `videoElementToImageData()` - captures frame from video element
  - `canvasElementToImageData()` - gets ImageData from canvas
  - `convertToImageData()` - unified converter handling all input types
- Exported `getShaderRenderer` from visual.ts for texture access

**Electron Startup Fix:**
- Editor wouldn't show until clicking - route race condition
- `isEditorView` computed depended on `route.name === 'editor'` but router hadn't resolved yet
- Added `await router.isReady()` in onMounted before checking route
- Added `isRouterReady` ref that defaults `isEditorView` to true before router resolves

**AudioBufferService Fix:**
- `createScriptProcessor is not a function` error on Tone.js rawContext
- Solution: Access UserMedia._stream directly for microphone input
- For other Tone.js nodes: use MediaStreamDestination as a bridge
- Create own fresh `new AudioContext()` which has createScriptProcessor available
- MediaStream crosses contexts by design - this is the proper way to bridge audio contexts
- Properly disconnects and cleans up Tone.js bridge on disconnect()

**flows.ts Defensive Checks:**
- Fixed 6 locations with unsafe non-null assertions: `nodeIdMap.get(edge.source)!`
- Changed to defensive checks with `continue` for missing nodes
- Prevents potential crashes during flow operations

**Device Enumeration for Audio/Video Nodes:**
- Created `useDeviceEnumeration.ts` composable for dynamic device listing
- Updated BaseNode.vue and PropertiesPanel.vue to use dynamic device options
- Node definitions now use `props: { deviceType: 'video-input' | 'audio-input' | 'audio-output' }`
- Webcam, Webcam Snapshot, and Audio Input nodes now show actual available devices
- Subscribes to service updates and `devicechange` events for live updates

**Test Fixes:**
- Fixed Float32Array precision failures in AudioBufferService tests and STT executor tests
- Changed `toBe(0.1)` to `toBeCloseTo(0.1, 5)` for floating-point comparisons
- All 549 tests passing

**Files Created:**
- `src/renderer/composables/useDeviceEnumeration.ts` - Device enumeration composable

**Files Modified:**
- `src/renderer/engine/executors/ai.ts` - STT rewrite, image type conversion system
- `src/renderer/engine/executors/visual.ts` - Export getShaderRenderer
- `src/renderer/services/audio/AudioBufferService.ts` - Silent gain, AudioContext fix
- `src/renderer/App.vue` - Router ready check for Electron
- `src/renderer/stores/flows.ts` - Defensive null checks
- `src/renderer/components/nodes/BaseNode.vue` - Dynamic device select options
- `src/renderer/components/layout/PropertiesPanel.vue` - Dynamic device select options
- `src/renderer/registry/visual/webcam.ts` - deviceType prop
- `src/renderer/registry/visual/webcam-snapshot.ts` - deviceType prop
- `src/renderer/registry/inputs/audio-input.ts` - deviceType prop
- `tests/unit/services/audio/AudioBufferService.test.ts` - Float32Array precision fix
- `tests/unit/executors/ai-stt.test.ts` - Float32Array precision fix

---

### Previous Session Accomplishments (Deep Audit, GPU Fixes, AI Cache):

**Deep Audit - GPU Memory Leak Fixes:**
- `ShaderRenderer.resize()` now properly calls `gl.deleteFramebuffer()` and `gl.deleteTexture()` before clearing Maps
- Added `deleteFramebuffer(id)` and `deleteTexture(texture)` methods to ShaderRenderer
- `gcVisualState()` now properly deletes GPU textures before removing from Maps
- `disposeVisualNode()` cleans up all GPU resources (textures, framebuffers)
- Fixed `ThreeRenderer.disposeNode()` key matching to prevent "node1" matching "node10"

**WebGL Context Loss Handling:**
- Added `webglcontextlost` and `webglcontextrestored` event handlers to ShaderRenderer
- Clears shader/framebuffer caches on context loss, reinitializes on restore
- Added `isContextLost()` method for checking state

**AI Model Cache Controls:**
- Added "Cache Models" toggle in AI Model Manager
- Added "Clear Cache" button to fix corrupted IndexedDB/LevelDB storage
- Fixed bug where clearing cache didn't update service state (`_loadedModels`, `_modelInfo`)
- Cache settings passed to Web Worker via message passing

**ExecutionEngine Control Defaults Fix:**
- Fixed controls not using definition defaults when node.data doesn't have explicit values
- Now properly merges definition defaults with actual node.data values
- UI showed default values but executor received empty - now both are consistent

**Test Environment Setup:**
- Added `tests/setup.ts` with Worker mock for happy-dom environment
- Added matchMedia mock for tests
- No more "Worker is not defined" errors in test output

**Files Created:**
- `tests/setup.ts` - NEW: Vitest setup with browser API mocks

**Files Modified:**
- `src/renderer/services/visual/ShaderRenderer.ts` - GPU cleanup, context loss handling
- `src/renderer/services/visual/ThreeRenderer.ts` - Fixed disposeNode key matching
- `src/renderer/engine/executors/visual.ts` - gcVisualState GPU texture cleanup
- `src/renderer/services/ai/AIInference.ts` - Cache control methods, clearModelCache fix
- `src/renderer/services/ai/ai.worker.ts` - setCache/clearCache message handlers
- `src/renderer/components/modals/AIModelManagerModal.vue` - Cache toggle and clear button
- `src/renderer/engine/ExecutionEngine.ts` - Control defaults from definition
- `vitest.config.ts` - Added setupFiles

---

### Previous Session Accomplishments (AI Complete, New Nodes, Loading Indicator):

**All 8 AI Model Types Now Have Nodes:**
| Model Task | Node | Status |
|------------|------|--------|
| text-generation | Text Generate | ✅ |
| text2text-generation | Text Transform | ✅ NEW |
| image-classification | Image Classification | ✅ |
| object-detection | Object Detection | ✅ |
| automatic-speech-recognition | Speech to Text | ✅ NEW |
| sentiment-analysis | Sentiment Analysis | ✅ |
| feature-extraction | Text Embeddings | ✅ |
| image-to-text | Image Captioning | ✅ |

**New AI Nodes Created:**
- **Speech to Text** (`speech-recognition.ts`) - Transcribes audio using Whisper models
- **Text Transform** (`text-transformation.ts`) - Summarize/translate/paraphrase with T5/Flan models

**AI Worker Chat Model Fix:**
- TinyLlama and other chat models now use correct messages format
- Detection for: chat, instruct, llama, -it- (Gemma), phi- models
- Audio transcription fixed (Float32Array reconstruction from serialized data)

**Loading Indicator on Nodes:**
- All AI nodes now show spinning loader in header during inference
- Uses Lucide `Loader2` icon with CSS animation
- Polls execution engine every 100ms for `loading` output

**Files Created:**
- `src/renderer/registry/ai/speech-recognition.ts` - NEW: Speech to text node
- `src/renderer/registry/ai/text-transformation.ts` - NEW: Text transform node

**Files Modified:**
- `src/renderer/services/ai/ai.worker.ts` - Chat model detection, audio fix
- `src/renderer/engine/executors/ai.ts` - Added speech/text transform executors
- `src/renderer/registry/ai/index.ts` - Registered new nodes
- `src/renderer/components/nodes/BaseNode.vue` - Added loading indicator

---

### Previous Session Accomplishments (AI Web Workers, Node Fixes, Full Audit):

**AI Web Worker Implementation:**
- Created dedicated Web Worker for all Transformers.js inference (`ai.worker.ts`)
- All AI inference now runs off the main thread - UI stays responsive
- Worker handles model loading, inference, and cleanup
- Progress tracking still works via message passing
- Main bundle reduced from 6.3MB to 5.4MB (Transformers.js only in worker)

**AI Node Fixes - Missing Trigger Inputs:**
- Added trigger input to `sentiment-analysis` node
- Added trigger input to `feature-extraction` node
- Added trigger input to `image-classification` node
- Added trigger input to `object-detection` node
- These nodes were missing triggers but executors expected them

**Texture-to-Data Node - Implemented Missing Executor:**
- Node definition existed but executor was missing - now implemented
- Reads pixels from WebGL texture via framebuffer
- Flips image vertically (WebGL textures are upside-down)
- Supports ImageData, base64, or blob output formats
- Supports trigger-based or continuous capture modes
- Enables webcam/shader → AI node pipeline

**Delay Executor Key Collision Fixed:**
- Audio delay and timing delay both used key `delay`
- Audio delay was shadowing timing delay
- Renamed audio delay to `audio-delay` in both node definition and executor

**AI Executor Improvements:**
- Removed `setTimeout(0)` workarounds (no longer needed with worker)
- Added `hasTriggerValue()` helper for consistent trigger detection
- All AI nodes now accept flexible trigger values (boolean, number, string, truthy)
- Still tracks pending operations to prevent duplicate requests

**Files Created:**
- `src/renderer/services/ai/ai.worker.ts` - NEW: AI inference Web Worker

**Files Modified:**
- `src/renderer/services/ai/AIInference.ts` - Rewritten for worker communication
- `src/renderer/engine/executors/ai.ts` - Simplified for worker-based inference
- `src/renderer/engine/executors/visual.ts` - Added texture-to-data executor
- `src/renderer/engine/executors/audio.ts` - Renamed delay to audio-delay
- `src/renderer/registry/ai/sentiment-analysis.ts` - Added trigger input
- `src/renderer/registry/ai/feature-extraction.ts` - Added trigger input
- `src/renderer/registry/ai/image-classification.ts` - Added trigger input
- `src/renderer/registry/ai/object-detection.ts` - Added trigger input
- `src/renderer/registry/audio/audio-delay.ts` - Renamed id to audio-delay

---

### Previous Session Accomplishments (Repo Migration, CI/CD, AI Fixes):

**Repository Migration:**
- Moved from `virgilvox/clasp-flow` to `lumencanvas/latch`
- Updated all package.json, forge.config.ts, and registry references
- Database renamed to LatchDB

**Demo & CI/CD:**
- Demo deployed at https://latch.design (GitHub Pages)
- CI workflow deploys web build on every push to main
- Release workflow creates GitHub releases on version tags
- Separate macOS builds for Apple Silicon (arm64) and Intel (x64)
- Uses `macos-15-intel` runner for Intel builds

**Sample Flow:**
- Sample flow loads automatically on first visit
- Flows marked dirty after import to persist to IndexedDB
- Prevents "flow disappears on refresh" issue

**App Naming:**
- App renamed from "Latch" to "LATCH"
- Updated forge.config.ts, README download links, xattr instructions
- Download artifacts: LATCH-mac-arm64.zip, LATCH-mac-x64.zip, LATCH-win.zip, LATCH-linux.zip, LATCH-linux.deb

**Electron Preload Fix:**
- Fixed preload script not found error (`index.mjs` → `index.js`)
- electron.vite.config.ts now outputs CommonJS format for preload
- Added ignore patterns to exclude source files from asar

**Trigger Node Fixes:**
- Trigger node can now connect to trigger-type inputs regardless of outputType setting
- Connection validation special-cases Trigger node in `connections.ts`

**AI Text Generation Fix:**
- AI executor now uses trigger value as prompt when it's a string
- Priority: 1) prompt input, 2) trigger value (if string), 3) control value
- Accepts any truthy value as trigger (not just `true` or `1`)

**UI Improvements:**
- All node palette categories collapsed by default
- GitHub icon button in header linking to repo

**Files Modified:**
- `package.json` - name: latch
- `forge.config.ts` - name: LATCH, ignore patterns
- `electron.vite.config.ts` - preload outputs CommonJS index.js
- `src/main/index.ts` - appUserModelId
- `src/renderer/services/database.ts` - LatchDB
- `src/renderer/stores/flows.ts` - loadSampleFlowIfFirstVisit, mark dirty
- `src/renderer/utils/connections.ts` - Trigger node special case
- `src/renderer/engine/executors/ai.ts` - use trigger value as prompt
- `src/renderer/components/layout/AppSidebar.vue` - all categories collapsed
- `src/renderer/components/layout/AppHeader.vue` - GitHub icon
- `.github/workflows/ci.yml` - deploy-web job, architecture matrix
- `.github/workflows/release.yml` - LATCH naming, arm64/x64 builds
- `README.md` - demo link, downloads, xattr for LATCH

---

### Previous Session Accomplishments (Connection Manager, CI Fixes, Netlify):

**Connection Manager System:**
- Created modular connection manager service with adapter pattern
- MQTT adapter with full config: transport (ws/wss/mqtt/mqtts), host, port, TLS, auth, protocol version, will messages
- OSC adapter using osc-js over WebSocket
- HTTP adapter for REST API connections
- Auto-registration of built-in connection types on first manager access
- Platform-aware transport options (browser vs Electron)

**Electron Build Fix:**
- Created `src/renderer/index.html` for electron-vite (expects HTML in that location)
- Updated `electron.vite.config.ts` with proper root and rollupOptions
- Fixed absolute path issue (`/src/...` → `./src/...`)
- All CI builds now pass: Linux, macOS, Windows

**Netlify Deployment:**
- Added `netlify.toml` with build command and publish directory
- SPA redirect rule for Vue Router

**CI/Lint Fixes:**
- Fixed MonacoEditor.vue unnecessary regex escapes
- Fixed code.ts Function type eslint error
- Commented out unused variables to pass typecheck

**Files Created/Modified:**
- `src/renderer/services/connections/` - Connection manager system
- `src/renderer/services/connections/adapters/MqttAdapter.ts` - Full MQTT support
- `src/renderer/services/connections/adapters/OscAdapter.ts` - NEW
- `src/renderer/services/connections/adapters/HttpAdapter.ts` - NEW
- `src/renderer/index.html` - NEW: Electron renderer entry
- `electron.vite.config.ts` - Fixed renderer config
- `netlify.toml` - NEW: Netlify deployment config

---

### Previous Session (Shader Node, Wire Colors, Import/Export, Logo):

**Shader Node Improvements:**
- Created ShaderPresets.ts with 17 built-in shaders:
  - Generators: gradient, noise, plasma, circles, waves, voronoi
  - Effects: chromatic-aberration, pixelate, vignette, glitch, edge-detect, kaleidoscope
  - Utility: solid-color, uv-debug, passthrough
  - Artistic: watercolor, halftone
- Preset selector dropdown in node UI
- Uniform auto-detection from GLSL code (`parseUniformsFromCode()`)
- Custom vertex shader support
- 4 texture inputs (iChannel0-3 / u_texture0-3)
- Better error handling

**Wire Colors by Data Type:**
- Wires now colored by their data type using dataTypeMeta colors
- Selection highlights with animated chase effect on connected edges
- Chase animation flows in direction of data flow
- Chase uses same color as wire (brighter version)

**Import/Export System:**
- Export button downloads all flows as JSON file
- Import button opens file picker to restore flows
- Save button exports + marks flow as saved
- Added `exportAllFlows()`, `importFlows()`, `promptImport()` to flows store

**Webcam Fix:**
- Fixed webcam node showing 3D scene content instead of webcam feed
- TexturePreview now prioritizes video element output over WebGL texture

**Equalizer/Oscilloscope Fix:**
- Fixed Tone.js import (was using non-existent `window.Tone`)

**AI Fix:**
- Fixed image captioning model URL to `Xenova/blip-image-captioning-base`

**Logo & README:**
- Updated public/icon.svg with new LATCH logo
- Created public/logo-dark.svg for README display
- Added logo and screenshots to README.md
- Screenshots: flow.png, control.png, local-models.png, connection-manager.png
- Added CLASP Integration section explaining the protocol, nodes, and Bridge app
- Updated Connectivity features and Node Categories to include CLASP

**Files Created/Modified:**
- `src/renderer/services/visual/ShaderPresets.ts` - NEW: Shader preset library
- `src/renderer/registry/visual/shader.ts` - Updated with preset selector
- `src/renderer/engine/executors/visual.ts` - Updated shaderExecutor
- `src/renderer/components/edges/AnimatedEdge.vue` - Wire colors & chase animation
- `src/renderer/stores/flows.ts` - Import/export functions
- `src/renderer/components/layout/AppHeader.vue` - Wired up save/export/import
- `src/renderer/components/preview/TexturePreview.vue` - Webcam fix
- `src/renderer/engine/executors/index.ts` - Tone.js import fix
- `src/renderer/services/ai/AIInference.ts` - Fixed model URL
- `public/icon.svg` - New logo
- `public/logo-dark.svg` - Logo with dark background for README
- `README.md` - Added logo and screenshots

---

### Previous Session (Trigger Fixes, Flow Rename, Executor Cleanup):

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
| `src/renderer/services/database.ts` | Added AI settings to AppSettings (aiAutoLoadModels, aiSelectedModels, etc.) |
| `src/renderer/services/ai/AIInference.ts` | Added auto-load methods, settings persistence |
| `src/renderer/components/modals/AIModelManagerModal.vue` | Added "Load on startup" toggle per model |
| `src/renderer/App.vue` | Added AI auto-load initialization on app start |
| `src/renderer/views/ControlPanelView.vue` | Fixed oscilloscope to handle audio mode |
| `src/renderer/registry/inputs/_knob/` | NEW - Custom KnobNode component for flow editor |
| `src/renderer/registry/audio/_envelope-visual/` | NEW - Custom EnvelopeVisualNode component |
| `src/renderer/registry/audio/_parametric-eq/` | NEW - Custom ParametricEqNode component |
| `src/renderer/registry/audio/_wavetable/` | NEW - Custom WavetableNode component |
| `src/renderer/registry/components.ts` | Registered new custom node types |
| `src/renderer/composables/usePersistence.ts` | Added new node types to specialNodeTypes |
| `src/renderer/stores/flows.ts` | Added new node types to specialNodeTypes |

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
cd /Users/obsidian/Projects/lumencanvas/latch

# Start development server
npm run dev

# Run tests
npm run test

# Type check
npm run typecheck

# Build for web
npm run build:web

# Build Electron
npm run build:electron

# Package Electron app
npm run package

# Create release artifacts
npm run make

# Start Electron dev mode
npm run dev:electron
```

---

## Known Issues

| Issue | Description | Workaround |
|-------|-------------|------------|
| Large bundle size | Main bundle is 5.4MB | Consider code splitting |

## Immediate TODOs for Next Session

```markdown
## High Priority
- [ ] Test AI nodes with Web Worker (text gen, image classification, etc.)
- [ ] Test connection manager with real MQTT/OSC servers
- [ ] Test texture-to-data → AI node pipeline

## Testing
- [ ] Test shader node with all 17 presets
- [ ] Test wire color matching
- [ ] Test import/export round-trip
- [ ] Test webcam node display
- [ ] Test Netlify deployment

## Features Pending
- [ ] Video file player node (use ffmpeg.wasm)
- [ ] Connection manager UI (modal for managing connections)
- [ ] Node development documentation for custom nodes

## Completed
- [x] AI Web Workers - all inference runs off main thread
- [x] texture-to-data executor implemented
- [x] AI node trigger inputs fixed
- [x] Audio delay / timing delay collision fixed
- [x] Break up EditorView.vue - Node registry extracted to src/renderer/registry/
- [x] Shader node improvements with presets and uniform detection
- [x] Wire colors by data type
- [x] Import/export functionality
- [x] OSC protocol support (adapter created)
- [x] MQTT protocol support (adapter with full config)
- [x] HTTP protocol support (REST adapter)
- [x] Electron build CI fix
- [x] Netlify deployment config
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
| 2026-01-18 | Registry Extraction | Extracted 94 node definitions to src/renderer/registry/, reduced EditorView from 3062 to 776 lines |
| 2026-01-18 | Wire Colors & UX | Wire colors by data type, selection chase animation, import/export, webcam fix, equalizer Tone.js fix |
| 2026-01-18 | Shader & Logo | 17 shader presets, uniform auto-detection, vertex shader support, new LATCH logo, README with screenshots |
| 2026-01-18 | Connection Manager | MQTT/OSC/HTTP adapters, Electron build fix, Netlify config, CI passing |
| 2026-01-18 | Repo Migration & CI/CD | Moved to lumencanvas/latch, demo at latch.design, sample flow on first visit, GitHub releases |
| 2026-01-18 | LATCH Rename & Builds | Renamed to LATCH, separate arm64/x64 macOS builds, preload script fix |
| 2026-01-18 | AI & Trigger Fixes | Trigger connects to trigger inputs, AI uses trigger value as prompt |
| 2026-01-18 | AI Web Workers & Audit | Web Worker for AI inference, fixed missing triggers on AI nodes, texture-to-data executor, audio-delay collision fix |
| 2026-01-18 | STT & Type Safety | Fixed STT pipeline (Tone.js→AudioBufferService→16kHz), AI image type conversion, Electron startup fix, flows.ts null checks, device enumeration for audio/video selects |
| 2026-01-19 | Monitor & Debug | Resizable Monitor node with clear button, Debug panel tab in Properties Panel with runtime stats, errors, and performance metrics |
| 2026-01-19 | Shader Dynamic Ports | Complete shader node overhaul - uniforms in GLSL code automatically become input ports, robust parser, dynamic port mutation API, engine hooks for port updates |
| 2026-01-19 | AI Auto-Load & Fixes | AI model auto-load on startup feature, Control Panel oscilloscope audio mode fix, custom node UI for knob/envelope/EQ/wavetable nodes |
| 2026-01-19 | Shader Fix, BLE, MediaPipe | Fixed shader preview (uniform injection), BLE adapter + 3 nodes, MediaPipe service + 4 nodes, 108 new tests (668 total), shader UX design doc |

---

## Resumption Prompt

When starting a new session, you can use this prompt:

> I'm continuing work on LATCH (Live Art Tool for Creative Humans). Please read the handoff document at `docs/handoff/SESSION_HANDOFF.md` and the master plan at `docs/plans/MASTER_PLAN.md`. The current status should be at the top of the handoff document. Let's continue from where we left off.

---

*Keep this document updated at the end of each session with the current status and any decisions made.*
