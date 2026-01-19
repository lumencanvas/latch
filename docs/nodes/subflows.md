# Subflows Category

> Create reusable node groups with custom inputs and outputs in LATCH.

**Category Color:** Violet (`#7C3AED`)
**Icon:** `layers`

Subflows allow you to encapsulate groups of nodes into reusable components. Subflow Input and Output nodes define the interface of a subflow.

---

## Subflow Input

Input port for a subflow.

| Property | Value |
|----------|-------|
| **ID** | `subflow-input` |
| **Icon** | `log-in` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Value from parent flow |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `portName` | `text` | `input` | - | Port name (displayed on subflow node) |
| `portType` | `select` | `any` | options: any, number, string, boolean, trigger, audio, texture, data | Port data type |
| `defaultValue` | `text` | `''` | - | Default value when not connected |

### Implementation
Exposes an input port on the parent subflow node. When the subflow is used as a node, connections to this port appear at the position defined by this Subflow Input node.

---

## Subflow Output

Output port for a subflow.

| Property | Value |
|----------|-------|
| **ID** | `subflow-output` |
| **Icon** | `log-out` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Value to output |

### Outputs
*None*

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `portName` | `text` | `output` | - | Port name (displayed on subflow node) |
| `portType` | `select` | `any` | options: any, number, string, boolean, trigger, audio, texture, data | Port data type |

### Implementation
Exposes an output port on the parent subflow node. Values connected to this node's input become available as outputs when the subflow is used.

---

## Creating Subflows

1. **Select nodes** you want to group
2. **Create subflow** from selection (right-click menu or shortcut)
3. **Add Subflow Input nodes** for each input the group needs
4. **Add Subflow Output nodes** for each output the group provides
5. **Name the ports** descriptively using the `portName` control
6. **Set types** to enable type checking on the subflow interface

### Example: Stereo Gain Subflow

Inside the subflow:
```
[Subflow Input: "left", audio]  → [Gain] → [Subflow Output: "leftOut", audio]
[Subflow Input: "right", audio] → [Gain] → [Subflow Output: "rightOut", audio]
[Subflow Input: "gain", number] → [Gain.gain]
                                → [Gain.gain]
```

When used as a node:
```
         ┌─────────────┐
left  ──▶│             │──▶ leftOut
right ──▶│ Stereo Gain │──▶ rightOut
gain  ──▶│             │
         └─────────────┘
```

---

## Best Practices

- **Descriptive port names**: Use clear names that describe the data's purpose
- **Type constraints**: Set appropriate types to catch connection errors early
- **Default values**: Provide sensible defaults for optional inputs
- **Documentation**: Add comments inside the subflow explaining its purpose
- **Consistent ordering**: Place inputs on the left, outputs on the right
