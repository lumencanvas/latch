# CLASP Flow - Master Project Plan

**Project**: CLASP Flow - The Ultimate Creative Flow Programming Engine
**Organization**: LumenCanvas
**Version**: 0.1.0
**Last Updated**: 2026-01-17
**Status**: Phase 0 Complete - Ready for Phase 1

---

## Executive Summary

CLASP Flow is an ambitious open-source visual flow/node programming environment that combines the best features of TouchDesigner, PureData, Max/MSP, Node-RED, and nodes.io. It runs as both a web application and an Electron desktop app, enabling creative professionals to build complex audio-visual pipelines, IoT integrations, AI workflows, and interactive experiences through an intuitive node-based interface.

### Key Differentiators
- **Dual Runtime**: Web browser + Electron (with hardware access)
- **Universal Data Flow**: Video, audio, shaders, data, IoT, AI - all interconnected
- **Beginner-Friendly, Expert-Capable**: Simple to start, unlimited depth
- **WASM-Powered**: Leverage ffmpeg, AI models, and custom binaries
- **Future-Proof**: CLASP protocol integration, containerization support

---

## Table of Contents

1. [Vision & Goals](#vision--goals)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Project Phases](#project-phases)
5. [Node Categories](#node-categories)
6. [Key Features](#key-features)
7. [Design System](#design-system)
8. [Testing Strategy](#testing-strategy)
9. [Build & Deployment](#build--deployment)
10. [Risk Assessment](#risk-assessment)
11. [Progress Tracking](#progress-tracking)

---

## Vision & Goals

### Mission Statement
Create the most powerful, accessible, and extensible visual programming environment for creatives, enabling anyone from beginners to experts to build complex audio-visual experiences, IoT systems, and AI-powered applications.

### Primary Goals
1. **Accessibility**: Zero-code entry point for beginners
2. **Power**: Unlimited capability for advanced users
3. **Performance**: Real-time audio/video processing at 60fps
4. **Extensibility**: Drop-in custom nodes, WASM modules, Blockly scripts
5. **Portability**: Web + Desktop with graceful capability degradation
6. **Community**: Open-source with strong ecosystem support

### Target Users
- Visual artists and VJs
- Audio engineers and musicians
- Creative coders and generative artists
- IoT developers and hardware hackers
- AI/ML experimenters
- Educators and students
- Live performance artists

---

## Technology Stack

### Core Framework
| Layer | Technology | Rationale |
|-------|------------|-----------|
| UI Framework | Vue 3 + TypeScript | Reactive, component-based, excellent DX |
| Node Editor | Vue Flow | Native Vue 3, React Flow feature parity |
| State Management | Pinia | Official Vue store, TypeScript support |
| Styling | Tailwind CSS + Custom CSS | Design system tokens, rapid iteration |
| Build Tool | Vite | Fast HMR, native ESM, excellent plugin ecosystem |
| Desktop | Electron Forge | Official tooling, multi-platform builds |

### Execution Engine
| Component | Technology | Purpose |
|-----------|------------|---------|
| Graph Engine | Custom TypeScript | Flow execution, cycle detection, topological sort |
| Worker Pool | Web Workers | Parallel node execution |
| Audio Engine | Tone.js + Web Audio API | Synthesis, effects, scheduling |
| Audio Analysis | Meyda.js + web-audio-beat-detector | Feature extraction, BPM detection |
| Video Processing | ffmpeg.wasm | Encoding, decoding, filters |
| Graphics | WebGL2 + WebGPU (where available) | Shaders, 3D rendering |
| AI/ML | Transformers.js + ONNX Runtime | Browser-based inference |

### Communication & I/O
| Protocol | Web Support | Electron Support |
|----------|-------------|------------------|
| HTTP/REST | Full | Full |
| WebSocket | Full | Full |
| MQTT | Full (via ws) | Full (native TCP) |
| OSC | Limited | Full |
| MIDI | Web MIDI API | Full |
| Serial | Web Serial API (Chrome) | Full (serialport) |
| BLE | Web Bluetooth API | Full |
| File System | Limited (File System Access API) | Full |

### Storage
| Type | Technology | Use Case |
|------|------------|----------|
| Local State | IndexedDB (Dexie.js) | Flows, assets, cache |
| Settings | localStorage | User preferences |
| Cloud Sync | Optional (future) | Cross-device sync |

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLASP Flow App                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Editor    │  │   Control   │  │      Landing/Home       │ │
│  │    View     │  │    Panel    │  │         View            │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                     │                │
│  ┌──────┴────────────────┴─────────────────────┴──────────────┐ │
│  │                    Vue 3 + Vue Flow UI Layer               │ │
│  └────────────────────────────┬───────────────────────────────┘ │
│                               │                                 │
│  ┌────────────────────────────┴───────────────────────────────┐ │
│  │                      Pinia State Store                     │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐  │ │
│  │  │  Flows  │ │  Nodes  │ │ Runtime │ │    Settings     │  │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘  │ │
│  └────────────────────────────┬───────────────────────────────┘ │
│                               │                                 │
│  ┌────────────────────────────┴───────────────────────────────┐ │
│  │                    Execution Engine                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │    Graph    │  │   Worker    │  │    Message Bus      │ │ │
│  │  │  Scheduler  │  │    Pool     │  │   (EventEmitter)    │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  └────────────────────────────┬───────────────────────────────┘ │
│                               │                                 │
│  ┌────────────────────────────┴───────────────────────────────┐ │
│  │                    Node Registry                            │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │ │
│  │  │ Audio  │ │ Video  │ │Shaders │ │  Data  │ │  Custom  │ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │ │
│  └────────────────────────────┬───────────────────────────────┘ │
│                               │                                 │
│  ┌────────────────────────────┴───────────────────────────────┐ │
│  │                Platform Abstraction Layer                   │ │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐  │ │
│  │  │   Web Capabilities  │  │   Electron Capabilities     │  │ │
│  │  │   - Web APIs        │  │   - Node.js APIs            │  │ │
│  │  │   - WASM            │  │   - Native modules          │  │ │
│  │  │   - Workers         │  │   - File system             │  │ │
│  │  └─────────────────────┘  └─────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Node System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Node Definition                          │
├──────────────────────────────────────────────────────────────┤
│  {                                                            │
│    "id": "audio-input",                                       │
│    "name": "Audio Input",                                     │
│    "category": "inputs",                                      │
│    "icon": "microphone",                                      │
│    "description": "Capture audio from microphone/device",     │
│    "platforms": ["web", "electron"],                          │
│    "inputs": [],                                              │
│    "outputs": [                                               │
│      { "id": "audio", "type": "audio", "label": "Audio" },   │
│      { "id": "level", "type": "number", "label": "Level" },  │
│      { "id": "beat", "type": "trigger", "label": "Beat" }    │
│    ],                                                         │
│    "controls": [                                              │
│      { "id": "source", "type": "select", "label": "Source" } │
│    ],                                                         │
│    "executor": "AudioInputNode",                              │
│    "ui": "AudioInputNodeUI" // Optional custom component      │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
```

### Data Types & Connection Colors

| Data Type | Color | Line Style | Description |
|-----------|-------|------------|-------------|
| `trigger` | `#F59E0B` (Warning/Orange) | Solid thin | Event/bang signals |
| `number` | `#2AAB8A` (Primary/Teal) | Solid | Numeric values |
| `string` | `#8B5CF6` (Purple) | Solid | Text data |
| `boolean` | `#EF4444` (Red) | Dotted | True/false |
| `audio` | `#22C55E` (Green) | Thick solid | Audio buffers |
| `video` | `#3B82F6` (Blue) | Thick solid | Video frames |
| `texture` | `#EC4899` (Pink) | Dashed | WebGL textures |
| `data` | `#6B7280` (Gray) | Solid | Generic JSON |
| `any` | `#FFFFFF` (White) | Dotted | Universal connector |

### Connection Animation States
- **Idle**: Static line
- **Active (data flowing)**: Animated dash/pulse moving along line
- **Error**: Red highlight, pulsing
- **Selected**: Thicker stroke, glow effect

---

## Project Phases

### Phase 0: Foundation ✅ COMPLETE
**Goal**: Project setup, architecture, core infrastructure

- [x] Project scaffolding (Vite + Vue 3 + TypeScript)
- [x] Electron integration with Forge
- [x] Design system implementation (tokens.css, base.css, components.css)
- [x] Vue Flow integration and customization (BaseNode component)
- [x] Core state management (Pinia stores: flows, nodes, runtime, ui)
- [x] Node registry system (with demo nodes)
- [x] Platform abstraction layer (web/electron detection)
- [x] Testing infrastructure (Vitest - 16 tests passing)
- [x] CI/CD pipeline (GitHub Actions - ci.yml, release.yml)
- [x] Documentation structure
- [x] Layout components (AppHeader, AppSidebar, StatusBar)
- [x] Core views (EditorView, ControlPanelView, SettingsView)

### Phase 1: Core Editor (Current)
**Goal**: Functional node editor with basic nodes

- [x] Node canvas with zoom/pan (Vue Flow)
- [x] Node palette/library sidebar (AppSidebar)
- [ ] Node search functionality (fuzzy matching)
- [ ] Connection drawing and validation (type checking)
- [ ] Node selection and multi-select
- [ ] Copy/paste/duplicate nodes
- [ ] Undo/redo system
- [x] Mini-map component (Vue Flow MiniMap)
- [ ] Keyboard shortcuts
- [x] Basic nodes: Debug, Monitor, Constant, Math (demo nodes registered)

### Phase 2: Data Flow
**Goal**: Working execution engine with data types

- [ ] Graph execution (topological sort)
- [ ] Data type validation
- [ ] Connection type checking
- [ ] Worker thread execution
- [ ] Flow controls (start/stop/pause)
- [ ] Real-time value inspection
- [ ] Error handling and display
- [ ] Performance monitoring
- [ ] Logic nodes: Compare, Switch, Gate
- [ ] Math nodes: Add, Multiply, MapRange, Clamp

### Phase 3: Audio System
**Goal**: Full audio input/output/synthesis

- [ ] Audio context management
- [ ] Audio Input node (microphone)
- [ ] Audio Output node (speakers)
- [ ] Audio Player node (files)
- [ ] Audio Analysis node (Meyda integration)
- [ ] Beat Detection node
- [ ] Oscillator node (basic synth)
- [ ] Envelope node (ADSR)
- [ ] Filter node (LP, HP, BP)
- [ ] Effects nodes (delay, reverb, distortion)
- [ ] Audio visualization worker

### Phase 4: Visual System
**Goal**: Video and shader processing

- [ ] Video Input node (webcam)
- [ ] Video Player node (files)
- [ ] Display Output node
- [ ] Shader node (GLSL editor)
- [ ] Shadertoy compatibility layer
- [ ] Uniform detection and binding
- [ ] Texture node
- [ ] Blend modes node
- [ ] Color adjustment nodes
- [ ] ffmpeg.wasm integration
- [ ] Video export

### Phase 5: Connectivity
**Goal**: External communication protocols

- [ ] HTTP Request node
- [ ] WebSocket node
- [ ] MQTT node
- [ ] OSC node (web-limited)
- [ ] MIDI Input/Output nodes (Web MIDI)
- [ ] Serial node (Web Serial / Electron)
- [ ] BLE node (Web Bluetooth / Electron)
- [ ] CLASP protocol integration

### Phase 6: AI Integration
**Goal**: Browser-based AI capabilities

- [ ] Transformers.js integration
- [ ] Text generation node
- [ ] Text embedding node
- [ ] Image classification node
- [ ] Object detection node
- [ ] Speech-to-text node
- [ ] Text-to-speech node
- [ ] Custom ONNX model node
- [ ] WASM binary execution node

### Phase 7: Advanced Features
**Goal**: Power-user features

- [ ] Function node (JavaScript execution)
- [ ] Blockly integration node
- [ ] Subflows (node groups)
- [ ] Custom node creation wizard
- [ ] Node auto-discovery from folder
- [ ] Control panel view
- [ ] Multi-flow support
- [ ] Flow linking

### Phase 8: 3D System
**Goal**: 3D graphics capabilities

- [ ] 3D Scene node
- [ ] 3D Camera node
- [ ] 3D Geometry nodes (primitives)
- [ ] 3D Transform node
- [ ] 3D Material node
- [ ] 3D Light nodes
- [ ] GLTF/GLB loader node
- [ ] 3D to 2D render node

### Phase 9: Polish & Export
**Goal**: Production-ready experience

- [ ] Mobile responsive UI
- [ ] Touch gesture support
- [ ] Dark/light theme
- [ ] Accessibility (a11y)
- [ ] Flow export/import
- [ ] Standalone runtime export
- [ ] Example flows library
- [ ] Tutorial system
- [ ] User documentation
- [ ] Landing page

### Phase 10: Distribution
**Goal**: Public release

- [ ] GitHub Actions multi-platform builds
- [ ] Auto-update system (Electron)
- [ ] NPM package for embeddable editor
- [ ] Landing website
- [ ] Community guidelines
- [ ] Contributor documentation
- [ ] Alpha release
- [ ] Beta testing
- [ ] v1.0 release

---

## Node Categories

### Debug
- **Monitor**: Display any value
- **Console**: Log to console
- **Meter**: Visual value meter

### Inputs
- **Audio Input**: Microphone/device capture
- **MIDI Input**: MIDI device messages
- **Video Input**: Webcam capture
- **MQTT Input**: MQTT subscription
- **OSC Input**: OSC messages (Electron)
- **Serial Input**: Serial port (Chrome/Electron)
- **BLE Input**: Bluetooth LE data
- **Trigger**: Manual trigger button
- **Slider**: Value 0-1
- **XY Pad**: 2D position input
- **Toggle**: Boolean switch
- **Knob**: Rotary control
- **LFO**: Low-frequency oscillator
- **Time**: Current time values
- **Constant**: Static value

### Outputs
- **Display**: Render visual output
- **Audio Output**: Play audio
- **MIDI Output**: Send MIDI
- **MQTT Output**: MQTT publish
- **OSC Output**: OSC messages (Electron)
- **Serial Output**: Serial write
- **BLE Output**: Bluetooth write
- **Layer Property**: Modify shader layer
- **Shader Uniform**: Set shader uniform
- **Effect Property**: Modify effect
- **Filter Property**: Modify filter

### Math
- **Add**: Sum values
- **Subtract**: Difference
- **Multiply**: Product
- **Divide**: Quotient
- **Map Range**: Remap value range
- **Clamp**: Constrain value
- **Smooth**: Smooth changes
- **Expression**: Math expression eval
- **Random**: Random number
- **Noise**: Perlin/Simplex noise

### Logic
- **Compare**: >, <, ==, etc.
- **And**: Logical AND
- **Or**: Logical OR
- **Not**: Logical NOT
- **Switch**: Multi-way branch
- **Gate**: Pass/block signal
- **Select**: Choose input
- **Counter**: Increment/decrement
- **Delay**: Delay signal
- **Debounce**: Rate limit

### Audio
- **Audio Input**: Capture
- **Audio Output**: Playback
- **Audio Player**: File playback
- **Audio Analysis**: Frequency/amplitude
- **Beat Detect**: BPM/beat extraction
- **Oscillator**: Basic waveforms
- **Envelope**: ADSR envelope
- **Filter**: LP/HP/BP/Notch
- **Delay**: Audio delay
- **Reverb**: Reverberation
- **Distortion**: Overdrive/fuzz
- **Compressor**: Dynamic range
- **Gain**: Volume control
- **Pan**: Stereo position
- **Mixer**: Multi-input mix

### Video
- **Video Input**: Webcam
- **Video Player**: File playback
- **Display**: Render output
- **Blend**: Blend modes
- **Transform**: Scale/rotate/translate
- **Crop**: Crop region
- **Color Adjust**: HSL/RGB adjust
- **Chroma Key**: Green screen
- **Effect**: Built-in effects
- **Feedback**: Video feedback

### Shaders
- **Shader**: GLSL editor
- **Uniform**: Shader input
- **Texture**: Image/video to texture
- **Shader Library**: Preset shaders
- **Shadertoy**: Shadertoy compat

### Data
- **HTTP Request**: REST calls
- **WebSocket**: WS connection
- **JSON Parse**: Parse JSON
- **JSON Stringify**: Serialize JSON
- **Object Get**: Get property
- **Object Set**: Set property
- **Array Operations**: Map/filter/reduce
- **Template**: String templates
- **Storage**: IndexedDB read/write
- **File**: File operations (Electron)

### AI
- **Text Generate**: LLM inference
- **Text Embed**: Embeddings
- **Classify Image**: Image classification
- **Detect Objects**: Object detection
- **Transcribe**: Speech-to-text
- **Speak**: Text-to-speech
- **Custom Model**: ONNX/WASM model

### Code
- **Function**: JavaScript sandbox
- **Blockly**: Visual code blocks
- **Expression**: Inline expression
- **WASM**: Custom WASM binary

### 3D
- **3D Scene**: Scene container
- **3D Camera**: Perspective/ortho
- **3D Geometry**: Primitives
- **3D Transform**: Position/rotation/scale
- **3D Material**: PBR materials
- **3D Light**: Point/spot/directional
- **3D Load**: GLTF/GLB models
- **3D Render**: Scene to texture

---

## Key Features

### 1. Smart Platform Detection
```typescript
// Nodes declare platform compatibility
const nodeDefinition = {
  platforms: ['web', 'electron'],
  // or
  platforms: ['electron'], // Desktop only
  // or
  webFallback: 'LimitedSerialNode' // Graceful degradation
};
```

### 2. Custom Node System
```
custom-nodes/
├── my-node/
│   ├── definition.json    # Node spec
│   ├── executor.ts        # Logic
│   ├── ui.vue            # Optional custom UI
│   └── icon.svg          # Optional icon
```

### 3. Control Panel View
- Nodes can expose "controls" that appear in a separate panel
- Controls are draggable/resizable widgets
- Perfect for live performance interfaces

### 4. Connection Visualization
- **Color by type**: Each data type has distinct color
- **Animated flow**: Dash animation when data passes
- **Thickness**: Signal strength/frequency
- **Style**: Solid (continuous), dashed (intermittent), dotted (boolean)

### 5. Multi-Flow Support
- Multiple flows in tabs
- Flows can reference each other
- Subflows for reusable components

### 6. Export Options
- **Flow JSON**: Portable flow definitions
- **Standalone App**: Electron package with embedded runtime
- **Web Embed**: Embeddable player for websites
- **Copy/Paste**: System clipboard support

---

## Design System

Based on the provided CLASP Design System:

### Colors
- **Primary**: Teal (#2AAB8A family)
- **Neutral**: Gray scale (#1A1A1A to #FFFFFF)
- **Semantic**: Success (#22C55E), Warning (#F59E0B), Error (#EF4444)
- **Selection**: Soft yellow (#FEF9E7)

### Typography
- **Font**: JetBrains Mono, Space Mono
- **Style**: Technical, monospace, industrial
- **Case**: Uppercase for labels, headers

### Components
- Sharp corners (border-radius: 0 or minimal)
- Offset box shadows (3-4px solid)
- Protocol badges (CLASP, OSC, MIDI, DMX)
- Status indicators with color-coded states
- Dark header/sidebar with light content

### Nodes (Enhanced from Screenshots)
- Rounded corners (subtle) for nodes
- Icon + title header
- Collapsible body
- Circular ports on edges
- Type-colored port indicators

---

## Testing Strategy

### Unit Tests (Vitest)
- Execution engine logic
- Node executors
- State management
- Utility functions
- Target: 80%+ coverage

### Component Tests (Vue Test Utils)
- Node components
- Panel components
- Form controls
- Dialogs/modals

### Integration Tests (Playwright)
- Flow creation workflows
- Node connection
- Import/export
- Audio/video (where possible)

### E2E Tests (Playwright)
- Full user journeys
- Multi-platform (web, Electron)
- Performance benchmarks

### Manual Testing
- Audio/video quality
- Hardware integration (MIDI, Serial)
- Cross-browser compatibility

---

## Build & Deployment

### Web Build
```bash
npm run build:web
# Outputs to dist/web/
# Deploy to Vercel/Netlify/GitHub Pages
```

### Electron Build (via GitHub Actions)
```yaml
# .github/workflows/build.yml
platforms:
  - windows (x64, arm64)
  - macos (x64, arm64)
  - linux (x64, arm64, AppImage, deb, rpm)
```

### Release Process
1. Version bump in package.json
2. Generate changelog
3. Create GitHub release
4. GitHub Actions builds all platforms
5. Auto-update notification for existing users

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| WebGPU adoption slow | Medium | Low | WebGL2 fallback ready |
| Audio latency issues | High | Medium | Web Audio tuning, Electron priority |
| WASM memory limits | Medium | Medium | Lazy loading, cleanup |
| Cross-browser compat | Medium | High | Progressive enhancement |
| Electron security | High | Medium | Context isolation, sandboxing |
| Scope creep | High | High | Strict phase gating |
| Performance at scale | High | Medium | Worker pools, virtualization |

---

## Progress Tracking

### Current Phase: 1 (Core Editor)
### Current Status: Phase 0 Complete, Phase 1 In Progress

### Milestone Checklist

#### Phase 0: Foundation ✅
- [x] Research complete
- [x] Architecture documented
- [x] Master plan created
- [x] Project scaffolded
- [x] Core infrastructure
- [x] CI/CD pipeline
- [x] Basic tests (16 passing)
- [x] TypeScript compilation clean
- [x] Web build verified

#### Phase 1: Core Editor (In Progress)
- [x] Vue Flow canvas working
- [x] Node palette sidebar
- [x] Demo nodes registered
- [ ] Connection type validation
- [ ] Node selection system
- [ ] Undo/redo
- [ ] Keyboard shortcuts
- [ ] IndexedDB persistence

### Session Handoff
See: [docs/handoff/SESSION_HANDOFF.md](../handoff/SESSION_HANDOFF.md)

---

## Related Documents

- [Architecture Deep Dive](../architecture/ARCHITECTURE.md)
- [Node Specification](../architecture/NODE_SPEC.md)
- [Execution Engine](../architecture/EXECUTION_ENGINE.md)
- [Platform Abstraction](../architecture/PLATFORM_LAYER.md)
- [Session Handoff](../handoff/SESSION_HANDOFF.md)
- [User Guide](../user-guide/README.md)

---

## References & Resources

### Inspiration
- [TouchDesigner](https://derivative.ca/) - Real-time visual development
- [Node-RED](https://nodered.org/) - Flow-based IoT programming
- [Max/MSP](https://cycling74.com/) - Audio/visual patching
- [PureData](https://puredata.info/) - Open-source visual programming
- [nodes.io](https://nodes.io/) - Web-based creative coding

### Libraries
- [Vue Flow](https://vueflow.dev/) - Vue 3 flowchart library
- [Tone.js](https://tonejs.github.io/) - Web Audio framework
- [Meyda.js](https://meyda.js.org/) - Audio feature extraction
- [Transformers.js](https://huggingface.co/docs/transformers.js/) - Browser ML
- [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) - Video processing
- [Google Blockly](https://developers.google.com/blockly) - Visual code blocks

### APIs
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)

---

*This document is the single source of truth for the CLASP Flow project. Update it as decisions are made and progress is achieved.*
