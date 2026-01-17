# CLASP Flow

**The Ultimate Creative Flow Programming Engine**

CLASP Flow is an open-source visual flow/node programming environment that combines the best of TouchDesigner, PureData, Max/MSP, and Node-RED. Build complex audio-visual pipelines, IoT integrations, AI workflows, and interactive experiences through an intuitive node-based interface.

Built with Vue 3 + TypeScript. Runs in the browser and as a desktop app (Electron).

> **Status**: Phase 0 Complete ✅ | Phase 1 In Progress

---

## Features

### Visual Programming
- Intuitive node-based editor with Vue Flow
- Type-safe connections with color-coded data types
- Real-time value inspection and monitoring
- Animated connection lines showing data flow
- Collapsible nodes for complex flows
- Mini-map navigation and zoom controls

### Audio
- Audio input from microphone/devices
- Real-time audio analysis (levels, frequency bands)
- Beat detection and BPM extraction
- Full synthesizer capabilities (oscillators, envelopes, filters)
- Effects processing (delay, reverb, distortion)
- Powered by Tone.js and Meyda.js

### Video & Shaders
- Webcam capture and video file playback
- GLSL shader editor with Shadertoy compatibility
- Automatic uniform detection
- Video effects and filters
- Video encoding/decoding via ffmpeg.wasm

### AI Integration
- Browser-based ML with Transformers.js
- Text generation, speech-to-text, image classification
- Run models locally - no server required
- Custom ONNX model support

### Connectivity
- HTTP/REST requests
- WebSocket connections
- MQTT for IoT
- MIDI input/output
- Serial port (Chrome/Electron)
- Bluetooth LE
- OSC (Electron)

### Code Nodes
- JavaScript function nodes with sandboxed execution
- Google Blockly integration for visual coding
- Custom WASM binary execution
- Expression evaluator for quick math

### Platform Support
- **Web**: Runs in modern browsers (Chrome, Firefox, Safari, Edge)
- **Desktop**: Full-featured Electron app with native hardware access
- Smart platform detection - nodes adapt to available capabilities

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/lumencanvas/clasp-flow.git
cd clasp-flow

# Install dependencies
npm install

# Start development server (web)
npm run dev

# Start development server (Electron)
npm run electron:dev
```

### Building

```bash
# Build for web
npm run build:web

# Build Electron app for current platform
npm run package

# Create distributable installers
npm run make

# Run tests
npm run test

# Type check
npx vue-tsc --noEmit
```

---

## Documentation

- [Master Plan](docs/plans/MASTER_PLAN.md) - Project roadmap and phases
- [Architecture](docs/architecture/ARCHITECTURE.md) - Technical architecture
- [Node Specification](docs/architecture/NODE_SPEC.md) - Creating custom nodes
- [Phase 0 Tasks](docs/plans/PHASE_0_FOUNDATION.md) - Foundation implementation
- [Session Handoff](docs/handoff/SESSION_HANDOFF.md) - Development continuity

---

## Node Categories

| Category | Description |
|----------|-------------|
| **Debug** | Monitor, Console, Meter |
| **Inputs** | Audio, MIDI, Slider, XY Pad, LFO, Time, Trigger |
| **Outputs** | Display, Audio Output, Shader Uniform |
| **Math** | Add, Multiply, Map Range, Expression |
| **Logic** | Compare, Gate, Switch, Counter |
| **Audio** | Analysis, Beat Detect, Oscillator, Filter, Effects |
| **Video** | Webcam, Player, Blend, Transform |
| **Shaders** | GLSL Editor, Uniform, Texture |
| **Data** | HTTP, WebSocket, MQTT, JSON |
| **AI** | Text Generate, Transcribe, Classify |
| **Code** | Function, Blockly, WASM |
| **Connectivity** | Serial, BLE, MIDI, OSC |

---

## Custom Nodes

Drop custom nodes into the `custom-nodes/` folder (Electron) or configure a custom nodes directory in settings.

```
custom-nodes/
└── my-node/
    ├── definition.json    # Node specification
    ├── executor.ts        # Execution logic
    ├── ui.vue            # Optional custom UI
    └── icon.svg          # Optional custom icon
```

See [Node Specification](docs/architecture/NODE_SPEC.md) for details.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| UI Framework | Vue 3 + TypeScript |
| Node Editor | Vue Flow |
| State | Pinia |
| Build | Vite |
| Desktop | Electron Forge |
| Audio | Tone.js, Meyda.js, Web Audio API |
| Video | ffmpeg.wasm, WebGL2 |
| AI | Transformers.js (ONNX Runtime) |
| Storage | IndexedDB (Dexie.js) |

---

## Design System

CLASP Flow follows a custom design system with:

- **Colors**: Teal primary (#2AAB8A), neutral grays, semantic colors
- **Typography**: JetBrains Mono (monospace), industrial aesthetic
- **Style**: Sharp corners, offset shadows, uppercase labels
- **Icons**: Lucide icon library

See [design-system (1).html](design-system%20(1).html) for the full component library.

---

## Data Types

Connections are color-coded by data type:

| Type | Color | Description |
|------|-------|-------------|
| `trigger` | Orange | Event signals |
| `number` | Teal | Numeric values |
| `string` | Purple | Text data |
| `boolean` | Red | True/false |
| `audio` | Green | Audio buffers |
| `video` | Blue | Video frames |
| `texture` | Pink | WebGL textures |
| `data` | Gray | JSON objects |

---

## Roadmap

- [x] **Phase 0: Foundation** - Project setup, Vue Flow, Pinia stores, design system, CI/CD ✅
- [ ] **Phase 1: Core Editor** (Current) - Selection, undo/redo, persistence, keyboard shortcuts
- [ ] Phase 2: Data Flow Engine
- [ ] Phase 3: Audio System
- [ ] Phase 4: Visual System
- [ ] Phase 5: Connectivity
- [ ] Phase 6: AI Integration
- [ ] Phase 7: Advanced Features
- [ ] Phase 8: 3D System
- [ ] Phase 9: Polish & Export
- [ ] Phase 10: Public Release

See [Master Plan](docs/plans/MASTER_PLAN.md) for detailed phase breakdown.

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

Inspired by:
- [TouchDesigner](https://derivative.ca/) - Real-time visual development
- [Node-RED](https://nodered.org/) - Flow-based IoT programming
- [Max/MSP](https://cycling74.com/) - Audio/visual patching
- [PureData](https://puredata.info/) - Open-source visual programming
- [nodes.io](https://nodes.io/) - Web-based creative coding

Built with:
- [Vue Flow](https://vueflow.dev/) - Vue 3 flowchart library
- [Tone.js](https://tonejs.github.io/) - Web Audio framework
- [Transformers.js](https://huggingface.co/docs/transformers.js/) - Browser ML
- [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) - Video processing
- [Meyda.js](https://meyda.js.org/) - Audio feature extraction

---

## Support

- [GitHub Issues](https://github.com/lumencanvas/clasp-flow/issues) - Bug reports and feature requests
- [Discussions](https://github.com/lumencanvas/clasp-flow/discussions) - Questions and community

---

*Created by [LumenCanvas](https://lumencanvas.com) - 2026*
