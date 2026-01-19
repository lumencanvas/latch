# Messaging Category

> Internal message passing between nodes via named channels in LATCH.

**Category Color:** Purple (`#8B5CF6`)
**Icon:** `send`

Messaging nodes enable wireless connections between nodes using named channels. This allows decoupled communication without visible connections on the canvas.

---

## Send

Send values to a named channel.

| Property | Value |
|----------|-------|
| **ID** | `send` |
| **Icon** | `send` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Value to send |
| `trigger` | `trigger` | Send now |

### Outputs
*None*

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `channel` | `text` | `default` | Channel name |
| `sendOnChange` | `toggle` | `true` | Auto-send when value changes |

### Implementation
Publishes values to an internal message bus. Multiple Send nodes can publish to the same channel. With `sendOnChange` enabled, automatically sends whenever the input value differs from the previous value.

### Usage Example
```
[Slider] → [Send: channel="volume"]
```

---

## Receive

Receive values from a named channel.

| Property | Value |
|----------|-------|
| **ID** | `receive` |
| **Icon** | `inbox` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Last received value |
| `changed` | `trigger` | Fires when new value arrives |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `channel` | `text` | `default` | Channel name |

### Implementation
Subscribes to an internal message bus channel. Outputs the most recent value sent to that channel. The `changed` trigger fires each time a new value is received.

### Usage Example
```
[Receive: channel="volume"] → [Gain]
```

---

## Common Patterns

### Wireless Parameter Control
Send nodes can control multiple receive nodes across the canvas without cluttering connections:

```
[UI Control] → [Send: "param1"]

...elsewhere in the flow...

[Receive: "param1"] → [Effect A]
[Receive: "param1"] → [Effect B]
```

### Event Broadcasting
Use triggers to broadcast events:

```
[Button] → [Send: "reset"]

[Receive: "reset"] → [Counter reset]
[Receive: "reset"] → [Timer reset]
```

### Organizing Complex Flows
Named channels help organize flows by topic:
- `audio/*` - Audio parameters
- `visual/*` - Visual parameters
- `ui/*` - User interface events
- `sync/*` - Synchronization signals
