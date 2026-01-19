# Code Category

> Custom logic, scripting, and state management nodes in LATCH.

**Category Color:** Amber (`#F59E0B`)
**Icon:** `terminal`

---

## Function

Custom JavaScript function with sandboxed execution.

| Property | Value |
|----------|-------|
| **ID** | `function` |
| **Icon** | `code-2` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `any` | Input A |
| `b` | `any` | Input B |
| `c` | `any` | Input C |
| `d` | `any` | Input D |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `any` | Function result |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `code` | `code` | (see below) | JavaScript code |

**Default Code:**
```javascript
// Access inputs via: inputs.a, inputs.b, etc.
// Access time via: time, deltaTime, frame
// Use state: getState('key', default), setState('key', value)
// Return a value or object with multiple outputs

return inputs.a + inputs.b;
```

### Implementation
Executes JavaScript in a sandboxed environment. Provides access to inputs, timing variables, and persistent state APIs. Returns value becomes the `result` output.

---

## Expression

Inline math expression evaluator.

| Property | Value |
|----------|-------|
| **ID** | `expression` |
| **Icon** | `calculator` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `number` | Input A |
| `b` | `number` | Input B |
| `c` | `number` | Input C |
| `d` | `number` | Input D |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Expression result |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `expression` | `text` | `a + b` | placeholder: "e.g., sin(t) * a + b" | Math expression |

### Implementation
Parses and evaluates mathematical expressions with variables. Supports standard math functions (`sin`, `cos`, `tan`, `sqrt`, `pow`, etc.) and time variable `t`.

---

## Template

String template with variable interpolation.

| Property | Value |
|----------|-------|
| **ID** | `template` |
| **Icon** | `text-cursor-input` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `any` | Variable A |
| `b` | `any` | Variable B |
| `c` | `any` | Variable C |
| `d` | `any` | Variable D |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `output` | `string` | Interpolated string |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `template` | `text` | `Value: {{a}}` | placeholder: "Use {{varname}} for interpolation" | Template string |

### Implementation
Replaces `{{varname}}` placeholders with corresponding input values. Useful for formatting output strings or constructing messages.

---

## Counter

Increment/decrement counter with min/max bounds.

| Property | Value |
|----------|-------|
| **ID** | `counter` |
| **Icon** | `list-ordered` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `increment` | `trigger` | Increment counter |
| `decrement` | `trigger` | Decrement counter |
| `reset` | `trigger` | Reset to min value |
| `set` | `number` | Set to specific value |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `count` | `number` | Current count |
| `normalized` | `number` | Count normalized to 0-1 |
| `atMin` | `boolean` | At minimum value |
| `atMax` | `boolean` | At maximum value |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Increment/decrement amount |
| `wrap` | `toggle` | `false` | Wrap around at bounds |

### Implementation
Maintains an integer or floating point count with configurable bounds. Optional wrap-around behavior allows cycling through values.

---

## Toggle

Flip-flop toggle with set/reset.

| Property | Value |
|----------|-------|
| **ID** | `toggle` |
| **Icon** | `toggle-left` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `trigger` | `trigger` | Toggle state |
| `set` | `trigger` | Force true |
| `reset` | `trigger` | Force false |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `boolean` | Current state |
| `inverted` | `boolean` | Inverted state |
| `number` | `number` | State as 0 or 1 |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `initial` | `toggle` | `false` | Initial value |

### Implementation
Classic flip-flop logic. Toggle input flips state, set/reset force specific states. Useful for on/off control flow.

---

## Sample & Hold

Capture and hold value on trigger.

| Property | Value |
|----------|-------|
| **ID** | `sample-hold` |
| **Icon** | `clipboard` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `any` | Value to sample |
| `trigger` | `trigger` | Sample now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `output` | `any` | Held value |

### Controls
*None*

### Implementation
Captures the current input value when triggered and holds it until the next trigger. Useful for freezing values at specific moments.

---

## Value Delay

Delay value by N frames.

| Property | Value |
|----------|-------|
| **ID** | `value-delay` |
| **Icon** | `timer` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `any` | Value to delay |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `output` | `any` | Delayed value |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `frames` | `number` | `1` | min: 1, max: 300 | Delay in frames |

### Implementation
Maintains a circular buffer of past values. Output is the value from N frames ago. Useful for creating motion trails or comparing current vs past values.
