# Inputs Category

> User-interactive input controls for creating values in LATCH flows.

**Category Color:** Green (`#22C55E`)
**Icon:** `download`

---

## Constant

Output a constant numeric value.

| Property | Value |
|----------|-------|
| **ID** | `constant` |
| **Icon** | `hash` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | The constant value |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `value` | `number` | `0` | The value to output (exposable) |

### Implementation
Simply outputs the control value on every frame.

---

## Slider

Slider control that outputs a value between 0 and 1.

| Property | Value |
|----------|-------|
| **ID** | `slider` |
| **Icon** | `sliders-horizontal` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Current slider value (0-1) |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `value` | `slider` | `0.5` | min: 0, max: 1, step: 0.01 | Slider position (exposable) |

### Implementation
Outputs the slider value on every frame. Commonly used for real-time parameter control.

---

## Knob

Rotary knob control with configurable range.

| Property | Value |
|----------|-------|
| **ID** | `knob` |
| **Icon** | `disc` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`KnobNode.vue`) |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Current knob value |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `value` | `slider` | `0.5` | min: 0, max: 1, step: 0.01 | Knob position (exposable) |
| `min` | `number` | `0` | - | Minimum output value |
| `max` | `number` | `1` | - | Maximum output value |

### Implementation
Uses a custom Vue component with rotary knob UI. Value is internally 0-1 but mapped to min/max range for output.

---

## Trigger

Manual trigger button with configurable output types.

| Property | Value |
|----------|-------|
| **ID** | `trigger` |
| **Icon** | `zap` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`TriggerNode.vue`) |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `trigger` | `trigger` | Fires when button is pressed |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `outputType` | `select` | `boolean` | options: boolean, number, string, json, timestamp | Type of value to output |
| `value` | `toggle` | `false` | - | Boolean value to send |
| `stringValue` | `text` | `''` | - | String value to send |
| `jsonValue` | `text` | `'{}'` | - | JSON value to send |

### Implementation
Custom UI with a prominent button. When clicked, emits a trigger signal followed by value reset (creates a pulse). Output format depends on `outputType`:
- `boolean`: Sends true then false
- `number`: Sends 1 then 0
- `string`: Sends the configured string
- `json`: Sends parsed JSON object
- `timestamp`: Sends `Date.now()`

---

## XY Pad

2D position controller with X/Y outputs.

| Property | Value |
|----------|-------|
| **ID** | `xy-pad` |
| **Icon** | `move` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`XYPadNode.vue`) |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `rawX` | `number` | X mapped to min/max range |
| `rawY` | `number` | Y mapped to min/max range |
| `normX` | `number` | X normalized (0-1) |
| `normY` | `number` | Y normalized (0-1) |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `normalizedX` | `number` | `0.5` | X position (0-1, exposable) |
| `normalizedY` | `number` | `0.5` | Y position (0-1, exposable) |
| `minX` | `number` | `0` | Minimum X output |
| `maxX` | `number` | `1` | Maximum X output |
| `minY` | `number` | `0` | Minimum Y output |
| `maxY` | `number` | `1` | Maximum Y output |

### Implementation
Custom UI with a 2D pad that can be dragged. Outputs both raw (mapped to range) and normalized (0-1) values.

---

## Textbox

Resizable text input that outputs a string.

| Property | Value |
|----------|-------|
| **ID** | `textbox` |
| **Icon** | `type` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`TextboxNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `trigger` | `trigger` | Trigger to emit current text |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | The text content |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `text` | `text` | `''` | The text content |
| `height` | `number` | `100` | Height of the text area in pixels |

### Implementation
Custom UI with a resizable textarea. Can be triggered to emit text or emits on change (based on usage).

---

## Audio Input

Capture audio from microphone or system audio.

| Property | Value |
|----------|-------|
| **ID** | `audio-input` |
| **Icon** | `mic` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `audio` | `audio` | Audio signal from microphone |
| `level` | `number` | Current audio level (0-1) |
| `beat` | `trigger` | Beat detection trigger |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `source` | `select` | `default` | deviceType: 'audio-input' | Audio input device |

### Implementation
Uses Web Audio API's `getUserMedia()` to capture microphone input. Creates a `MediaStreamSourceNode` connected to:
- Direct output (for audio signal)
- `AnalyserNode` (for level detection)
- Beat detection algorithm (for beat trigger)

The device selector is dynamically populated with available audio input devices via `navigator.mediaDevices.enumerateDevices()`.

---

## Keyboard

Virtual piano keyboard for MIDI note input.

| Property | Value |
|----------|-------|
| **ID** | `keyboard` |
| **Icon** | `piano` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`KeyboardNode.vue`) |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `note` | `number` | MIDI note number (0-127) |
| `velocity` | `number` | Note velocity (0-127) |
| `noteOn` | `trigger` | Fires when note is pressed |
| `gate` | `boolean` | True while note held, false on release |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `numKeys` | `select` | `25` | options: 25, 49, 61, 88 | Number of keys to display |
| `startOctave` | `number` | `3` | min: 0, max: 8 | Starting octave |
| `octaveShift` | `number` | `0` | min: -4, max: 4 | Keyboard shift offset |
| `includeBlackKeys` | `toggle` | `true` | - | Show black keys |
| `velocitySensitive` | `toggle` | `true` | - | Enable velocity sensitivity |

### Implementation
Custom UI with interactive piano keyboard. Click or use computer keyboard to play notes. Outputs MIDI-compatible values suitable for connecting to Synth or MIDI Output nodes.

---

## Usage Examples

### Basic Parameter Control
```
[Slider] --value--> [Math/Multiply] --result--> [Oscillator/frequency]
```

### Trigger-Based Actions
```
[Trigger] --trigger--> [HTTP Request/trigger]
```

### 2D Visual Control
```
[XY Pad] --normX--> [Transform 2D/translateX]
         --normY--> [Transform 2D/translateY]
```

### Text Input for Prompts
```
[Textbox] --text--> [Text Generate/prompt]
[Trigger] --trigger--> [Text Generate/trigger]
```
