# LATCH Node Reference

> Complete reference documentation for all nodes in LATCH, the visual node-based creative coding environment.

## Overview

LATCH uses a node-based system where each node represents a discrete operation or data source. Nodes are connected via ports (inlets and outlets) to create dataflow graphs called "flows". This document provides a comprehensive reference of all available nodes.

## Quick Navigation

| Category | Count | Description | Link |
|----------|-------|-------------|------|
| [Inputs](#inputs) | 8 | Input controls and data sources | [inputs.md](./inputs.md) |
| [Debug](#debug) | 5 | Visualization and debugging tools | [debug.md](./debug.md) |
| [Math](#math) | 19 | Mathematical operations | [math.md](./math.md) |
| [Logic](#logic) | 18 | Boolean and conditional logic | [logic.md](./logic.md) |
| [Timing](#timing) | 8 | Time-based nodes and clocks | [timing.md](./timing.md) |
| [Audio](#audio) | 16 | Audio synthesis and processing | [audio.md](./audio.md) |
| [Visual](#visual) | 12 | Image/texture processing and shaders | [visual.md](./visual.md) |
| [3D](#3d) | 16 | 3D geometry, materials, and rendering | [3d.md](./3d.md) |
| [Connectivity](#connectivity) | 21 | Network and device communication | [connectivity.md](./connectivity.md) |
| [Code](#code) | 7 | Custom code execution | [code.md](./code.md) |
| [AI](#ai) | 15 | Local machine learning models | [ai.md](./ai.md) |
| [Data](#data) | 34 | Data manipulation and conversion | [data.md](./data.md) |
| [String](#string) | 12 | String manipulation | [string.md](./string.md) |
| [Messaging](#messaging) | 2 | Internal message passing | [messaging.md](./messaging.md) |
| [Subflows](#subflows) | 2 | Flow composition | [subflows.md](./subflows.md) |
| [Outputs](#outputs) | 1 | Final output destinations | [outputs.md](./outputs.md) |
| [Emulation](./emulation.md) | 3 | Game controllers + in-browser retro emulator | [emulation.md](./emulation.md) |

**Total: 196 nodes**

---

## Node Categories

### Inputs
User-interactive input controls for creating values.

| Node | Description |
|------|-------------|
| Constant | Output a constant numeric value |
| Slider | Slider control (0-1) |
| Knob | Rotary knob control (0-1) |
| Trigger | Manual trigger button with output types |
| XY Pad | 2D position controller |
| Textbox | Resizable text input |
| Keyboard | Virtual piano keyboard for MIDI note input |
| Audio Input | Capture audio from microphone |

### Debug
Visualization and debugging tools.

| Node | Description |
|------|-------------|
| Console | Log values to browser console |
| Monitor | Display input values inline |
| Oscilloscope | Visualize signal waveforms |
| Graph | Plot X/Y values |
| Equalizer | Visualize audio frequency spectrum |

### Math
Mathematical operations on numbers.

| Node | Description |
|------|-------------|
| Add | Add two numbers |
| Subtract | Subtract two numbers |
| Multiply | Multiply two numbers |
| Divide | Divide two numbers |
| Modulo | Remainder operation |
| Clamp | Constrain value between min/max |
| Absolute | Get absolute value |
| Random | Generate random numbers |
| Map Range | Remap value between ranges |
| Smooth | Smooth value changes over time |
| Trig | Trigonometric functions |
| Lerp | Linear interpolation between two values |
| Power/Root | Power, root, and log functions |
| Quantize | Round value to nearest step |
| Remap | Remap value with clamping and easing |
| Smoothstep | Hermite interpolation between 0 and 1 |
| Step | Returns 0 if value < edge, otherwise 1 |
| Vector Math | 3D vector operations |
| Wrap | Wrap value to stay within range |

### Logic
Boolean and conditional operations.

| Node | Description |
|------|-------------|
| And | Logical AND |
| Changed | Only output when value changes from previous |
| Coalesce | Return first non-null/undefined value |
| Compare | Compare two values |
| Default | Return input value, or default if null/undefined/empty |
| Equals | Type-agnostic equality comparison |
| Gate | Pass or block values |
| In Range | Check if number is within a range |
| Is Empty | Check if value is null, undefined, empty string, or empty array |
| Is Null | Check if value is null or undefined |
| Latch | Flip-flop style latch with set and reset inputs |
| Not | Logical NOT |
| Or | Logical OR |
| Pass If | Pass value through only if condition is met |
| Sample & Hold | Sample value when triggered, hold until next trigger |
| Select | Select from multiple inputs by index |
| Switch | Select between two values |
| Type Of | Get the type of a value |

### Timing
Time-based nodes and oscillators.

| Node | Description |
|------|-------------|
| Time | Current time, delta, and frame |
| LFO | Low frequency oscillator |
| Start | Fires once when flow starts |
| Interval | Fires at regular intervals |
| Delay | Delay a value by time |
| Timer | Stopwatch with start/stop/reset |
| Metronome | Musical tempo source |
| Step Sequencer | Pattern-based sequencer |

### Audio
Audio synthesis, processing, and analysis using Web Audio API.

| Node | Description |
|------|-------------|
| Oscillator | Generate audio waveforms |
| Audio Output | Output audio to speakers |
| Audio Analyzer | Analyze audio levels and frequencies |
| Gain | Adjust audio volume |
| Filter | Filter audio frequencies |
| SVF Filter | State variable filter with multiple outputs |
| Delay (Audio) | Add delay/echo effect |
| Reverb | Add reverb effect |
| Beat Detect | Detect beats and estimate BPM |
| Pitch Detect | Detect pitch from audio |
| Envelope (ADSR) | ADSR amplitude envelope |
| Envelope Editor | Visual ADSR with draggable controls |
| Parametric EQ | 3-band parametric equalizer |
| Wavetable | Wavetable oscillator with drawable waveform |
| Audio Player | Play audio files from URL |
| Synth | Polyphonic synthesizer with multiple instruments |

### Visual
Image/texture processing and shader effects using WebGL/Three.js.

| Node | Description |
|------|-------------|
| Shader | Custom GLSL shader with dynamic uniforms |
| Webcam | Capture video from camera |
| Webcam Snapshot | Capture snapshots on trigger |
| Color | Create RGBA color values |
| Texture Display | Display texture on canvas |
| Blend | Blend two textures |
| Blur | Gaussian blur effect |
| Color Correction | Adjust brightness, contrast, saturation |
| Displacement | Displace using displacement map |
| Transform 2D | Scale, rotate, translate |
| Image Loader | Load images from URL/file |
| Video Player | Play video from URL |

### 3D
3D geometry, materials, lighting, and rendering using Three.js.

| Node | Description |
|------|-------------|
| Scene 3D | Container for 3D objects |
| Camera 3D | Perspective/orthographic camera |
| Render 3D | Render scene to texture |
| Box 3D | Create box/cube mesh |
| Sphere 3D | Create sphere mesh |
| Plane 3D | Create plane mesh |
| Cylinder 3D | Create cylinder mesh |
| Torus 3D | Create torus (donut) mesh |
| Transform 3D | Apply position/rotation/scale |
| Material 3D | Create PBR materials |
| Group 3D | Combine objects into group |
| Ambient Light | Uniform lighting |
| Directional Light | Sun-like directional light |
| Point Light | Omnidirectional point light |
| Spot Light | Cone-shaped spotlight |
| GLTF Loader | Load 3D models (GLTF/GLB) |

### Connectivity
Network and device communication.

| Node | Description |
|------|-------------|
| HTTP Request | Make REST API requests |
| WebSocket | Real-time WebSocket connection |
| MIDI Input | Receive MIDI messages |
| MIDI Output | Send MIDI messages |
| MQTT | MQTT pub/sub messaging |
| OSC | Open Sound Control protocol |
| Serial Port | Serial port communication |
| Bluetooth LE | Bluetooth Low Energy (simple) |
| BLE Scanner | Scan and select BLE devices |
| BLE Device | Connect to BLE device, enumerate services |
| BLE Characteristic | Read/write/subscribe to BLE characteristics |
| CLASP Connection | Manage CLASP connections |
| CLASP Gesture | Receive gesture signals (touch/pen/motion) from CLASP |
| CLASP Subscribe | Subscribe to CLASP patterns |
| CLASP Set | Set CLASP parameter values |
| CLASP Emit | Emit CLASP events |
| CLASP Get | Get CLASP parameter values |
| CLASP Stream | Stream high-rate data |
| CLASP Bundle | Send atomic bundles |
| CLASP Video Receive | Receive video stream from a CLASP relay room |
| CLASP Video Send | Send video stream to a CLASP relay room |

### Code
Custom code execution and utilities.

| Node | Description |
|------|-------------|
| Function | Custom JavaScript function |
| Expression | Inline math expression |
| Template | String template interpolation |
| Counter | Increment/decrement counter |
| Toggle | Flip-flop toggle |
| Sample & Hold | Capture and hold on trigger |
| Value Delay | Delay value by N frames |

### AI
Local machine learning using Transformers.js and MediaPipe (runs in browser).

| Node | Description |
|------|-------------|
| Text Generate | Generate text with language models |
| Classify Image | Classify images (Vision Transformer) |
| Sentiment | Analyze text sentiment |
| Caption Image | Generate image captions |
| Text Embed | Convert text to embeddings |
| Detect Objects | Detect objects in images |
| Speech to Text | Transcribe audio (Whisper) |
| Text Transform | Summarize/translate/rewrite |
| Hand Tracking | MediaPipe hand landmark detection |
| Face Mesh | MediaPipe face landmarks and blendshapes |
| Pose Estimation | MediaPipe body pose detection |
| Object Detection (MP) | MediaPipe real-time object detection |
| Selfie Segmentation | MediaPipe person/background separation |
| Gesture Recognition | MediaPipe hand gesture recognition |
| Audio Classifier | MediaPipe audio classification (YamNet) |

### Data
Data manipulation and conversion.

| Node | Description |
|------|-------------|
| Array Contains | Check if array contains a value |
| Array First/Last | Get first and last elements |
| Array Get | Get element at index |
| Array Join | Join array elements into string |
| Array Length | Get length of array |
| Array Push | Add element(s) to array |
| Array Range | Generate an array of sequential numbers |
| Array Reverse | Reverse array order |
| Array Slice | Get subset of array |
| Array Sort | Sort array values |
| Array Unique | Remove duplicate values |
| Counter | Count triggers with optional min/max bounds |
| Debounce | Only output value after it stops changing for a period |
| Filter Nulls | Remove null/undefined/empty values from array |
| Format Number | Format number with locale and options |
| JSON Parse | Parse JSON string to object |
| JSON Stringify | Convert object to JSON string |
| Object Create | Create object from key/value pairs |
| Object Entries | Get array of [key, value] pairs |
| Object Get | Get property from object by path |
| Object Has | Check if object has property |
| Object Keys | Get array of object keys |
| Object Merge | Merge two objects (shallow merge) |
| Object Set | Set property on object (returns new object) |
| Object Values | Get array of object values |
| Parse Float | Parse string to floating point number |
| Parse Int | Parse string to integer with radix support |
| Router | Route value to one of multiple outputs based on index |
| Texture to Data | Convert texture to image data for AI processing |
| Throttle | Limit how often value is output |
| To Array | Wrap value in array, or split string to array |
| To Boolean | Convert value to boolean (truthy/falsy) |
| To Number | Convert value to number |
| To String | Convert any value to string |

### String
String manipulation operations.

| Node | Description |
|------|-------------|
| String Case | Convert string case |
| String Concat | Concatenate multiple strings |
| String Contains | Check if string contains a substring |
| String Length | Get length of a string |
| String Pad | Pad string to target length |
| String Replace | Replace text in a string |
| String Slice | Extract a portion of a string |
| String Split | Split string into parts |
| String Template | String interpolation with placeholders |
| String Trim | Remove whitespace from string |
| Starts/Ends With | Check if string starts or ends with substring |
| Regex Match | Match string against regex pattern |

### Messaging
Internal message passing between nodes.

| Node | Description |
|------|-------------|
| Send | Send values to named channel |
| Receive | Receive values from channel |

### Subflows
Flow composition and reuse.

| Node | Description |
|------|-------------|
| Subflow Input | Input port for subflow |
| Subflow Output | Output port for subflow |

### Outputs
Final output destinations.

| Node | Description |
|------|-------------|
| Main Output | Final output viewer with preview |

---

## Architecture Reference

For detailed information about the node system architecture, see:

- **[Node Type Definitions](./node-types.md)** - TypeScript interfaces, data types, and registration system
- **[Contributing Nodes](./contributing.md)** - Guide for creating new nodes

---

## Data Types

Nodes communicate through typed ports. See [node-types.md](./node-types.md) for complete type definitions.

| Type | Color | Description |
|------|-------|-------------|
| `trigger` | Amber | One-shot event signals |
| `number` | Teal | Numeric values |
| `string` | Purple | Text values |
| `boolean` | Red | True/false values |
| `audio` | Green | Audio signal (Web Audio API) |
| `video` | Blue | Video element |
| `texture` | Pink | WebGL texture |
| `data` | Gray | Arbitrary data objects |
| `array` | Cyan | Array of values |
| `any` | White | Any type (polymorphic) |
| `scene3d` | Blue | Three.js scene |
| `object3d` | Light Blue | Three.js object |
| `geometry3d` | Lighter Blue | Three.js geometry |
| `material3d` | Pale Blue | Three.js material |
| `camera3d` | Dark Blue | Three.js camera |
| `light3d` | Yellow | Three.js light |
| `transform3d` | Cyan | 3D transform data |
