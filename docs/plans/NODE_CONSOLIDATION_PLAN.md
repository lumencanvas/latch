# Node Consolidation Plan

> **Status**: Proposed
> **Created**: 2026-01-18
> **Goal**: Reduce node count by combining similar nodes with mode selectors

## Overview

Many nodes in the registry perform similar operations with only minor differences (e.g., add vs subtract vs multiply). These can be combined into single configurable nodes with dropdown selectors, reducing visual clutter and simplifying the node palette.

**Total Potential Reduction**: ~94 nodes → ~79 nodes (-15 nodes)

---

## Phase 1: High Priority (Simple, High Impact)

### Math Operation Node
**Combines**: `add`, `subtract`, `multiply`, `divide`
**Reduction**: 4 → 1 (-3 nodes)
**Complexity**: Low

```
Inputs:  A (number), B (number)
Outputs: Result (number)
Controls:
  - operator: select [Add, Subtract, Multiply, Divide]
```

- Same input/output signature for all operations
- Dynamic icon based on selected operator
- Simple implementation - just swap the math function

### Boolean Logic Node
**Combines**: `and`, `or`
**Reduction**: 2 → 1 (-1 node)
**Complexity**: Low

```
Inputs:  A (boolean), B (boolean)
Outputs: Result (boolean)
Controls:
  - operator: select [AND, OR]
```

- Note: `not` stays separate (unary operation with different signature)

---

## Phase 2: High Priority (Medium Complexity)

### 3D Geometry Node
**Combines**: `box-3d`, `sphere-3d`, `plane-3d`, `cylinder-3d`, `torus-3d`
**Reduction**: 5 → 1 (-4 nodes)
**Complexity**: Medium

```
Inputs:  material (material3d), posX/Y/Z (number)
Outputs: object (object3d)
Controls:
  - type: select [Box, Sphere, Plane, Cylinder, Torus]
  - color: color
  - [conditional per type]:
    - Box: width, height, depth
    - Sphere: radius, widthSegments, heightSegments
    - Plane: width, height
    - Cylinder: radiusTop, radiusBottom, height
    - Torus: radius, tube, radialSegments, tubularSegments
```

- Requires conditional control visibility based on type selection
- Common controls always visible, type-specific controls shown/hidden

### 3D Light Node
**Combines**: `ambient-light-3d`, `directional-light-3d`, `point-light-3d`, `spot-light-3d`
**Reduction**: 4 → 1 (-3 nodes)
**Complexity**: Medium

```
Inputs:  [varies by type]
Outputs: light (light3d), object (object3d)
Controls:
  - type: select [Ambient, Directional, Point, Spot]
  - color: color (all)
  - intensity: slider (all)
  - [conditional]:
    - Directional/Point/Spot: posX, posY, posZ
    - Point/Spot: distance, decay
    - Spot: angle, penumbra, targetX, targetY, targetZ
    - Directional/Point/Spot: castShadow
```

---

## Phase 3: Medium Priority

### Trigger Generator Node
**Combines**: `start`, `interval`, `timer`
**Reduction**: 3 → 1 (-2 nodes)
**Complexity**: Medium

```
Inputs:  [varies by mode]
Outputs: trigger (trigger), [varies by mode]
Controls:
  - mode: select [Once, Interval, Stopwatch]
  - [conditional]:
    - Interval: interval (ms)
    - Stopwatch: start/stop/reset triggers
```

- All three generate trigger outputs based on timing logic
- `delay` and `lfo` stay separate (they transform values, not generate triggers)

### CLASP Parameter Node
**Combines**: `clasp-get`, `clasp-set`
**Reduction**: 2 → 1 (-1 node)
**Complexity**: Medium

```
Inputs:  connectionId, address, [value for Set mode]
Outputs: value (for Get mode), trigger
Controls:
  - mode: select [Get, Set]
```

- Both communicate with CLASP protocol
- Dynamic input/output visibility based on mode

### MIDI Node
**Combines**: `midi-input`, `midi-output`
**Reduction**: 2 → 1 (-1 node)
**Complexity**: Medium

```
Controls:
  - mode: select [Input, Output]
  - channel: select [1-16, All]
```

- Bidirectional MIDI handling in single node
- Show relevant inputs/outputs based on mode

---

## Phase 4: Lower Priority / Future

### Network Protocol Node (Future Consideration)
**Combines**: `mqtt`, `websocket`, `osc`
**Reduction**: 3 → 1 (-2 nodes)
**Complexity**: High

- Each protocol has significantly different semantics
- Would require sophisticated conditional I/O handling
- Recommend keeping separate initially for UX clarity

### Value Memory Node (Marginal Benefit)
**Combines**: `sample-hold`, `value-delay`
**Reduction**: 2 → 1 (-1 node)
**Complexity**: Low

- Both store/delay values across frames
- Different trigger mechanisms make this less clean

---

## Nodes to Keep Separate

These nodes were evaluated but should remain separate:

| Nodes | Reason |
|-------|--------|
| `switch`, `select`, `gate` | Different input signatures and semantics |
| `delay`, `reverb`, `filter` (audio) | Each has unique parameter sets |
| Visual effect nodes | Each effect is distinct |
| `counter`, `toggle` | Semantically different (numeric vs boolean state) |
| Data nodes (json-parse, json-stringify, texture-to-data) | Only 3 nodes, all distinct purposes |
| `not` | Unary operation (different from binary and/or) |
| `delay`, `lfo` (timing) | Transform values rather than generate triggers |

---

## Implementation Summary

| Phase | Nodes Combined | Reduction | Priority |
|-------|---------------|-----------|----------|
| Phase 1 | Math ops, Boolean logic | -4 nodes | High |
| Phase 2 | 3D Geometry, 3D Lights | -7 nodes | High |
| Phase 3 | Triggers, CLASP, MIDI | -4 nodes | Medium |
| Phase 4 | Network, Value Memory | -3 nodes | Low |
| **Total** | | **-18 nodes** | |

---

## Technical Considerations

### Conditional Controls
Combined nodes will need conditional control visibility. Options:
1. **Runtime visibility** - All controls defined, UI hides irrelevant ones
2. **Dynamic definition** - Node definition changes based on mode (more complex)

Recommendation: Runtime visibility is simpler and works with existing BaseNode component.

### Executor Updates
Each combined node will need executor logic that switches behavior based on the mode/operator control value.

### Migration
Existing flows using old node IDs will need migration support or backwards compatibility aliases.

---

## Files Affected (When Implemented)

### Phase 1
- Delete: `math/add.ts`, `math/subtract.ts`, `math/multiply.ts`, `math/divide.ts`
- Create: `math/math-operation.ts`
- Delete: `logic/and.ts`, `logic/or.ts`
- Create: `logic/boolean-logic.ts`

### Phase 2
- Delete: `3d/box-3d.ts`, `3d/sphere-3d.ts`, `3d/plane-3d.ts`, `3d/cylinder-3d.ts`, `3d/torus-3d.ts`
- Create: `3d/geometry-3d.ts`
- Delete: `3d/ambient-light-3d.ts`, `3d/directional-light-3d.ts`, `3d/point-light-3d.ts`, `3d/spot-light-3d.ts`
- Create: `3d/light-3d.ts`

### Phase 3
- Delete: `timing/start.ts`, `timing/interval.ts`, `timing/timer.ts`
- Create: `timing/trigger-generator.ts`
- Delete: `connectivity/clasp-get.ts`, `connectivity/clasp-set.ts`
- Create: `connectivity/clasp-parameter.ts`
- Delete: `connectivity/midi-input.ts`, `connectivity/midi-output.ts`
- Create: `connectivity/midi.ts`
