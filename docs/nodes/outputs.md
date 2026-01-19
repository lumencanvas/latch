# Outputs Category

> Final output and display nodes in LATCH.

**Category Color:** Blue (`#3B82F6`)
**Icon:** `upload`

---

## Main Output

Final output viewer with large preview.

| Property | Value |
|----------|-------|
| **ID** | `main-output` |
| **Icon** | `monitor-play` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Texture to display |

### Outputs
*None*

### Controls
*None*

### Custom UI
This node has a custom Vue component (`MainOutputNode.vue`) that provides:
- Large preview canvas
- Fullscreen toggle
- Resolution display
- Frame rate indicator

### Implementation
Renders the input texture to an embedded canvas element. The custom UI component provides a larger preview than standard nodes, making it ideal as the final destination in visual processing pipelines.

### Usage
Connect any texture-producing node to the Main Output to see the final result:

```
[Shader] → [Blur] → [Color Correction] → [Main Output]
```

The Main Output node is typically the terminus of visual processing chains. Only one Main Output should generally be active in a flow, though multiple can exist for A/B comparison during development.

---

## Related Nodes

For other output-related functionality, see:

- **Audio Output** (`audio` category): Final audio output to speakers
- **Texture Display** (`visual` category): Inline texture preview
- **Monitor** (`debug` category): Value inspection
- **Console** (`debug` category): Text logging

---

## Output Philosophy

LATCH separates output destinations by media type:

| Media | Output Node | Category |
|-------|------------|----------|
| Visual/Texture | Main Output | outputs |
| Audio | Audio Output | audio |
| Data/Values | Monitor, Console | debug |
| External | HTTP, WebSocket, MIDI, etc. | connectivity |

This separation allows independent routing of different media streams and clear visualization of data flow in complex patches.
