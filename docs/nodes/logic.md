# Logic Category

> Boolean and conditional logic operations in LATCH.

**Category Color:** Red (`#EF4444`)
**Icon:** `git-branch`

---

## Compare

Compare two values using comparison operators.

| Property | Value |
|----------|-------|
| **ID** | `compare` |
| **Icon** | `git-compare` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `number` | First value |
| `b` | `number` | Second value |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `boolean` | Comparison result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `operator` | `select` | `==` | options: ==, !=, >, >=, <, <= | Comparison operator |

### Implementation
- `==`: `a === b` (strict equality)
- `!=`: `a !== b`
- `>`: `a > b`
- `>=`: `a >= b`
- `<`: `a < b`
- `<=`: `a <= b`

---

## And

Logical AND of two boolean values.

| Property | Value |
|----------|-------|
| **ID** | `and` |
| **Icon** | `circle-dot` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `boolean` | First operand |
| `b` | `boolean` | Second operand |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `boolean` | True if both inputs are true |

### Controls
*None*

### Implementation
`result = a && b`

---

## Or

Logical OR of two boolean values.

| Property | Value |
|----------|-------|
| **ID** | `or` |
| **Icon** | `circle` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `boolean` | First operand |
| `b` | `boolean` | Second operand |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `boolean` | True if either input is true |

### Controls
*None*

### Implementation
`result = a || b`

---

## Not

Logical NOT (inversion) of a boolean value.

| Property | Value |
|----------|-------|
| **ID** | `not` |
| **Icon** | `circle-off` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `boolean` | Value to invert |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `boolean` | Inverted value |

### Controls
*None*

### Implementation
`result = !value`

---

## Gate

Pass or block values based on a condition.

| Property | Value |
|----------|-------|
| **ID** | `gate` |
| **Icon** | `door-open` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Value to pass through |
| `gate` | `boolean` | Gate control signal |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `any` | Value if gate is open, otherwise undefined |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `open` | `toggle` | `true` | Default gate state |

### Implementation
```javascript
const isOpen = gateInput ?? openControl
result = isOpen ? value : undefined
```

When gate is closed, the output is `undefined` (no value flows).

---

## Switch

Select between two values based on a condition.

| Property | Value |
|----------|-------|
| **ID** | `switch` |
| **Icon** | `git-branch` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `condition` | `boolean` | Selection condition |
| `true` | `any` | Value when condition is true |
| `false` | `any` | Value when condition is false |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `any` | Selected value |

### Controls
*None*

### Implementation
`result = condition ? trueInput : falseInput`

A ternary operator in node form.

---

## Select

Select one of multiple inputs by index.

| Property | Value |
|----------|-------|
| **ID** | `select` |
| **Icon** | `list` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `index` | `number` | Index to select (0-3) |
| `a` | `any` | Option 0 |
| `b` | `any` | Option 1 |
| `c` | `any` | Option 2 |
| `d` | `any` | Option 3 |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `any` | Selected input value |

### Controls
*None*

### Implementation
```javascript
const inputs = [a, b, c, d]
const idx = Math.floor(Math.max(0, Math.min(3, index)))
result = inputs[idx]
```

Index is clamped to 0-3 and floored to integer.

---

## Usage Examples

### Conditional Routing
```
[Compare] --result--> [Switch/condition]
[Source A] ---------> [Switch/true]
[Source B] ---------> [Switch/false]
[Switch] --result--> [Destination]
```

### Threshold Detection
```
[Audio Analyzer/level] --> [Compare/a]
[Constant(0.5)] --------> [Compare/b]
                          (operator: >)
[Compare] --result--> [Gate/gate]
[Trigger Source] ---> [Gate/value]
[Gate] --result--> [Action]
```

### Multiple Condition Logic
```
[Condition A] --> [And/a]
[Condition B] --> [And/b]
[And] --result--> [Or/a]
[Condition C] --> [Or/b]
[Or] --result--> [Final Gate]
```

### State Machine with Select
```
[Counter/count] --> [Select/index]
[State 0 Value] --> [Select/a]
[State 1 Value] --> [Select/b]
[State 2 Value] --> [Select/c]
[State 3 Value] --> [Select/d]
[Select] --result--> [Output]
```

### Toggle Gate
```
[Toggle/value] --> [Gate/gate]
[Data Source] ---> [Gate/value]
[Gate] --result--> [Destination]
```
