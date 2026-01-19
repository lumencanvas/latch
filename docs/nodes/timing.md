# Timing Category

> Time-based nodes, oscillators, and clock sources in LATCH.

**Category Color:** Orange (`#F97316`)
**Icon:** `clock`

---

## Time

Provides current time, delta time, and frame count.

| Property | Value |
|----------|-------|
| **ID** | `time` |
| **Icon** | `clock` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `time` | `number` | Time in seconds since flow started |
| `delta` | `number` | Time since last frame (seconds) |
| `frame` | `number` | Current frame number |

### Controls
*None*

### Implementation
Uses the execution engine's timing system:
- `time`: `performance.now() / 1000` relative to flow start
- `delta`: Difference between current and previous frame time
- `frame`: Incrementing frame counter

---

## LFO

Low Frequency Oscillator - generates periodic waveforms.

| Property | Value |
|----------|-------|
| **ID** | `lfo` |
| **Icon** | `waves` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Current oscillator value |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `frequency` | `number` | `1` | Oscillation frequency in Hz |
| `amplitude` | `number` | `1` | Output amplitude multiplier |
| `offset` | `number` | `0` | DC offset added to output |
| `waveform` | `select` | `sine` | Waveform type (sine, square, triangle, sawtooth) |

### Implementation
```javascript
const phase = (time * frequency) % 1
let value
switch (waveform) {
  case 'sine':     value = Math.sin(phase * Math.PI * 2); break
  case 'square':   value = phase < 0.5 ? 1 : -1; break
  case 'triangle': value = 1 - Math.abs(phase - 0.5) * 4; break
  case 'sawtooth': value = phase * 2 - 1; break
}
result = value * amplitude + offset
```

Output range: `[-amplitude + offset, amplitude + offset]`

---

## Start

Fires a trigger once when the flow starts running.

| Property | Value |
|----------|-------|
| **ID** | `start` |
| **Icon** | `play` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `trigger` | `trigger` | Fires once on flow start |

### Controls
*None*

### Implementation
On the first execution frame, outputs a trigger signal. Subsequent frames output nothing.

---

## Interval

Fires triggers at regular time intervals.

| Property | Value |
|----------|-------|
| **ID** | `interval` |
| **Icon** | `timer` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `enabled` | `boolean` | Enable/disable the interval |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `trigger` | `trigger` | Fires at each interval |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `interval` | `number` | `1000` | min: 10, max: 60000 | Interval in milliseconds |
| `enabled` | `toggle` | `true` | - | Default enabled state |

### Implementation
Uses `setInterval()` internally or frame-based timing to fire triggers at the specified interval when enabled.

---

## Delay

Delay a value by a specified time.

| Property | Value |
|----------|-------|
| **ID** | `delay` |
| **Icon** | `clock` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Value to delay |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Delayed value |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `delay` | `number` | `500` | min: 0, max: 10000 | Delay in milliseconds |

### Implementation
Maintains a queue of timestamped values. On each frame, outputs values whose delay time has elapsed.

---

## Timer

Stopwatch timer with start, stop, and reset controls.

| Property | Value |
|----------|-------|
| **ID** | `timer` |
| **Icon** | `timer` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `start` | `trigger` | Start the timer |
| `stop` | `trigger` | Stop/pause the timer |
| `reset` | `trigger` | Reset timer to zero |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `elapsed` | `number` | Elapsed time in seconds |
| `running` | `boolean` | Whether timer is currently running |

### Controls
*None*

### Implementation
Maintains internal state for:
- Start timestamp
- Accumulated time (for pause/resume)
- Running state

Responds to input triggers to control state.

---

## Metronome

Musical tempo source with beat and bar triggers.

| Property | Value |
|----------|-------|
| **ID** | `metronome` |
| **Icon** | `timer` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `start` | `trigger` | Start the metronome |
| `stop` | `trigger` | Stop the metronome |
| `bpm` | `number` | BPM override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `beat` | `trigger` | Fires on each beat |
| `bar` | `trigger` | Fires on each bar (first beat of measure) |
| `beatNum` | `number` | Current beat number (1-based, resets at bar) |
| `barNum` | `number` | Current bar number (1-based) |
| `phase` | `number` | Beat phase (0-1, for smooth animation) |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `bpm` | `number` | `120` | min: 20, max: 300 | Beats per minute |
| `beatsPerBar` | `number` | `4` | min: 1, max: 16 | Time signature numerator |
| `subdivision` | `select` | `1` | options: 1, 1/2, 1/4, 1/8, 1/16 | Beat subdivision |
| `swing` | `slider` | `0` | min: 0, max: 100 | Swing amount (%) |
| `running` | `toggle` | `true` | - | Default running state |

### Implementation
High-precision timing using Web Audio API's clock or `performance.now()`:
- Calculates beat duration from BPM
- Applies subdivision for faster triggers
- Swing affects alternate beats' timing
- Phase output enables smooth inter-beat animation

---

## Step Sequencer

Step-based pattern sequencer for rhythm and automation.

| Property | Value |
|----------|-------|
| **ID** | `step-sequencer` |
| **Icon** | `grid-3x3` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`StepSequencerNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `clock` | `trigger` | Advance to next step |
| `reset` | `trigger` | Reset to first step |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `gate` | `trigger` | Fires when active step is triggered |
| `value` | `number` | Value of current step (0-1) |
| `step` | `number` | Current step number |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `steps` | `number` | `8` | min: 1, max: 64 | Number of steps |
| `mode` | `select` | `Forward` | options: Forward, Backward, Ping-Pong, Random | Playback mode |
| `stepValues` | `data` | `[]` | - | Step values array (edited via UI) |

### Implementation
Custom UI component with:
- Visual grid of steps
- Click to toggle step on/off
- Drag to set step value (0-1)
- Current step highlight

Playback modes:
- **Forward**: 0, 1, 2, 3, ... n, 0, 1, ...
- **Backward**: n, n-1, ... 1, 0, n, ...
- **Ping-Pong**: 0, 1, ... n, n-1, ... 1, 0, ...
- **Random**: Random step each trigger

---

## Usage Examples

### Basic Animation
```
[Time] --time--> [Multiply/a]
[Constant(0.5)] -> [Multiply/b]
[Multiply] --result--> [Trig/sin] --result--> [Transform 2D/translateX]
```

### Rhythmic Triggers
```
[Metronome] --beat--> [Envelope/trigger]
            --bar---> [Counter/increment]
```

### Delayed Reaction
```
[Trigger] --trigger--> [Delay/value]
[Delay] --value--> [HTTP Request/trigger]
```

### Step Sequencer Pattern
```
[Metronome/beat] --> [Step Sequencer/clock]
[Step Sequencer/gate] --> [Envelope/trigger]
[Step Sequencer/value] --> [Map Range] --> [Oscillator/frequency]
```

### LFO Modulation
```
[LFO] --value--> [Map Range] --result--> [Filter/frequency]
(freq: 0.2, waveform: sine)
(inMin: -1, inMax: 1, outMin: 200, outMax: 2000)
```
