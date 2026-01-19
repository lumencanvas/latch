# Math Category

> Mathematical operations on numeric values in LATCH.

**Category Color:** Amber (`#F59E0B`)
**Icon:** `calculator`

---

## Add

Add two numbers together.

| Property | Value |
|----------|-------|
| **ID** | `add` |
| **Icon** | `plus` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `number` | First operand |
| `b` | `number` | Second operand |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Sum of a + b |

### Controls
*None*

### Implementation
`result = a + b`

---

## Subtract

Subtract one number from another.

| Property | Value |
|----------|-------|
| **ID** | `subtract` |
| **Icon** | `minus` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `number` | Minuend |
| `b` | `number` | Subtrahend |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Difference of a - b |

### Controls
*None*

### Implementation
`result = a - b`

---

## Multiply

Multiply two numbers.

| Property | Value |
|----------|-------|
| **ID** | `multiply` |
| **Icon** | `x` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `number` | First factor |
| `b` | `number` | Second factor |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Product of a * b |

### Controls
*None*

### Implementation
`result = a * b`

---

## Divide

Divide one number by another.

| Property | Value |
|----------|-------|
| **ID** | `divide` |
| **Icon** | `divide` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `number` | Dividend |
| `b` | `number` | Divisor |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Quotient of a / b |

### Controls
*None*

### Implementation
`result = a / b` (returns `Infinity` or `NaN` for division by zero)

---

## Modulo

Get the remainder of division.

| Property | Value |
|----------|-------|
| **ID** | `modulo` |
| **Icon** | `percent` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Value to divide |
| `divisor` | `number` | Divisor |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Remainder |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `divisor` | `number` | `1` | - | Default divisor if not connected |
| `mode` | `select` | `Standard` | options: Standard, Positive, Floor | Modulo mode |

### Implementation
- **Standard**: `value % divisor` (JavaScript default, sign follows dividend)
- **Positive**: `((value % divisor) + divisor) % divisor` (always positive result)
- **Floor**: `value - divisor * Math.floor(value / divisor)` (sign follows divisor)

---

## Clamp

Constrain a value between minimum and maximum bounds.

| Property | Value |
|----------|-------|
| **ID** | `clamp` |
| **Icon** | `shrink` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Value to clamp |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Clamped value |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `min` | `number` | `0` | Minimum bound |
| `max` | `number` | `1` | Maximum bound |

### Implementation
`result = Math.max(min, Math.min(max, value))`

---

## Absolute

Get the absolute (positive) value.

| Property | Value |
|----------|-------|
| **ID** | `abs` |
| **Icon** | `flip-horizontal` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Input value |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Absolute value |

### Controls
*None*

### Implementation
`result = Math.abs(value)`

---

## Random

Generate random numbers.

| Property | Value |
|----------|-------|
| **ID** | `random` |
| **Icon** | `shuffle` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `seed` | `number` | Seed value (triggers new random on change) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Random number in range |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `1` | Maximum value |

### Implementation
`result = min + Math.random() * (max - min)`

When seed input changes, a new random value is generated.

---

## Map Range

Remap a value from one range to another.

| Property | Value |
|----------|-------|
| **ID** | `map-range` |
| **Icon** | `arrow-right-left` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Input value (required) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Remapped value |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `inMin` | `number` | `0` | Input range minimum |
| `inMax` | `number` | `1` | Input range maximum |
| `outMin` | `number` | `0` | Output range minimum |
| `outMax` | `number` | `100` | Output range maximum |

### Implementation
```javascript
const normalized = (value - inMin) / (inMax - inMin)
result = outMin + normalized * (outMax - outMin)
```

---

## Smooth

Smooth value changes over time using linear interpolation.

| Property | Value |
|----------|-------|
| **ID** | `smooth` |
| **Icon** | `trending-up` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Target value |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Smoothed value |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `factor` | `slider` | `0.1` | min: 0.01, max: 1, step: 0.01 | Smoothing factor (0=slow, 1=instant) |

### Implementation
Exponential smoothing (one-pole lowpass):
```javascript
current = current + factor * (target - current)
```

Lower factor = smoother (slower response)

---

## Trig

Trigonometric functions.

| Property | Value |
|----------|-------|
| **ID** | `trig` |
| **Icon** | `waves` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Input angle/value |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Function result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `function` | `select` | `sin` | options: sin, cos, tan, asin, acos, atan, sinh, cosh, tanh | Trig function |
| `degrees` | `toggle` | `false` | - | Input in degrees (vs radians) |

### Implementation
Applies `Math[function]()` to input. If `degrees` is true, converts input to radians first (for sin/cos/tan) or result to degrees (for asin/acos/atan).

---

## Power/Root

Power, root, and logarithm functions.

| Property | Value |
|----------|-------|
| **ID** | `power` |
| **Icon** | `superscript` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `base` | `number` | Base value |
| `exponent` | `number` | Exponent (for power operation) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `number` | Result of operation |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `operation` | `select` | `Power` | options: Power, Sqrt, Cbrt, Log, Log10, Ln, Exp | Operation type |
| `exponent` | `number` | `2` | - | Default exponent for power |

### Implementation
- **Power**: `Math.pow(base, exponent)`
- **Sqrt**: `Math.sqrt(base)`
- **Cbrt**: `Math.cbrt(base)` (cube root)
- **Log**: `Math.log(base) / Math.log(exponent)` (log with base)
- **Log10**: `Math.log10(base)`
- **Ln**: `Math.log(base)` (natural log)
- **Exp**: `Math.exp(base)` (e^base)

---

## Vector Math

3D vector operations.

| Property | Value |
|----------|-------|
| **ID** | `vector-math` |
| **Icon** | `move-3d` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `ax` | `number` | Vector A, X component |
| `ay` | `number` | Vector A, Y component |
| `az` | `number` | Vector A, Z component |
| `bx` | `number` | Vector B, X component |
| `by` | `number` | Vector B, Y component |
| `bz` | `number` | Vector B, Z component |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `x` | `number` | Result X component |
| `y` | `number` | Result Y component |
| `z` | `number` | Result Z component |
| `magnitude` | `number` | Result magnitude |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `operation` | `select` | `Add` | options: Add, Subtract, Cross, Normalize, Scale, Lerp, Dot | Vector operation |
| `scalar` | `number` | `1` | - | Scalar for Scale/Lerp operations |

### Implementation
- **Add**: `A + B`
- **Subtract**: `A - B`
- **Cross**: `A × B` (cross product)
- **Normalize**: `A / |A|`
- **Scale**: `A * scalar`
- **Lerp**: `A + scalar * (B - A)`
- **Dot**: Returns dot product as magnitude, x/y/z are 0

---

## Usage Examples

### Frequency Modulation
```
[LFO] --value--> [Multiply/a]
[Constant(100)] --> [Multiply/b]
[Multiply] --result--> [Add/a]
[Constant(440)] --> [Add/b]
[Add] --result--> [Oscillator/frequency]
```

### Normalizing Values
```
[Sensor] --raw--> [Map Range] --result--> [Visual Node]
                  (inMin: 0, inMax: 1023, outMin: 0, outMax: 1)
```

### Smooth Control Changes
```
[Slider] --value--> [Smooth] --result--> [Gain/gain]
                    (factor: 0.1)
```
