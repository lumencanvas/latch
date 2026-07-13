# PLAN: Connection Manager System for clasp-flow

> **Status:** PENDING - Waiting for componentization refactor to complete
> **Created:** 2026-01-17
> **Dependencies:** Ongoing refactor in separate session (node registry componentization)

---

## Overview

A standardized, modular connection manager system with **CLASP as the unified protocol layer**:
- **Browser**: WASM-compiled CLASP router (WebSocket only, no UDP)
- **Electron**: Full native CLASP router with all transports & bridges
- **Fallback**: Direct protocol adapters when router unavailable
- Centralized UI for managing connections (modal dialog)
- Platform-aware node visibility (Electron-only nodes for hardware)
- Project persistence

## Design Principles

1. **CLASP as Unified Layer** - All protocols route through CLASP when router available
2. **Platform-Aware** - Electron gets full capabilities, browser gets web-compatible subset
3. **Graceful Fallback** - Direct adapters work when no router available
4. **Node-RED UX** - Dropdown selector with edit/create button
5. **Modular & Extensible** - Custom nodes can register protocols

---

## Platform Architecture

### Browser (WASM Router)
```
┌─────────────────────────────────────────────────────────┐
│                    clasp-flow (Browser)                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │          CLASP Router (WASM)                        ││
│  │  - WebSocket transport only                         ││
│  │  - In-memory state                                  ││
│  │  - No UDP/QUIC                                      ││
│  └─────────────────────────────────────────────────────┘│
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Web MIDI API │ │ Web Serial   │ │ Web Bluetooth    │ │
│  │ (bridge)     │ │ (bridge)     │ │ (bridge)         │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
│                                                         │
│  Hidden nodes: Art-Net, sACN, native Serial, DMX USB   │
└─────────────────────────────────────────────────────────┘
```

### Electron (Native Router)
```
┌─────────────────────────────────────────────────────────┐
│                 clasp-flow (Electron)                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Main Process: clasp-router (native Rust)            ││
│  │  - WebSocket + UDP + QUIC transports                ││
│  │  - Full state management                            ││
│  │  - mDNS discovery                                   ││
│  └─────────────────────────────────────────────────────┘│
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ MIDI   │ │ OSC    │ │ Art-Net│ │ DMX    │ │ Serial │ │
│  │ bridge │ │ bridge │ │ bridge │ │ USB    │ │ bridge │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
│                                                         │
│  All nodes visible, full hardware support               │
└─────────────────────────────────────────────────────────┘
```

### Fallback Mode (No Router)
When CLASP router unavailable, use direct adapters:
- WebSocket → WebSocketAdapter (direct connection)
- MQTT → MqttAdapter (direct to broker)
- HTTP → HttpAdapter (direct requests)

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Connection Manager Service                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Type        │  │ Connections │  │ Adapters                │  │
│  │ Registry    │  │ (configs)   │  │ (runtime instances)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Pinia Store (connections)                     │
│  UI state: panelOpen, selectedConnection, editingId             │
│  Getters: types, connections, getConnectionOptions(protocol)   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    UI Components                                 │
│  ConnectionManagerButton → ConnectionManagerModal               │
│  ConnectionSelect (reusable dropdown for node properties)       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// Base connection config (all protocols extend this)
interface BaseConnectionConfig {
  id: string              // e.g., "mqtt-production"
  name: string            // e.g., "Production Broker"
  protocol: string        // e.g., "mqtt"
  autoConnect: boolean
  autoReconnect: boolean
  reconnectDelay: number
}

// Protocol registration
interface ConnectionTypeDefinition<TConfig> {
  id: string                    // "mqtt"
  name: string                  // "MQTT Broker"
  icon: string                  // Lucide icon
  color: string                 // Brand color
  category: 'protocol' | 'hardware' | 'cloud'
  configControls: ControlDefinition[]  // Form fields
  defaultConfig: Partial<TConfig>
  createAdapter: (config: TConfig) => ConnectionAdapter
}

// Runtime adapter (implemented per protocol)
interface ConnectionAdapter {
  status: ConnectionStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  dispose(): void
  onStatusChange(cb): () => void
  // Protocol-specific methods...
}
```

---

## File Structure

```
src/renderer/
├── services/
│   └── connections/
│       ├── types.ts                 # Core interfaces
│       ├── ConnectionManager.ts     # Singleton service
│       ├── index.ts                 # Public exports
│       └── adapters/
│           ├── BaseAdapter.ts       # Abstract base
│           ├── ClaspAdapter.ts      # Migrate from clasp.ts
│           ├── WebSocketAdapter.ts  # Migrate from connectivity.ts
│           ├── MqttAdapter.ts
│           ├── OscAdapter.ts
│           ├── SerialAdapter.ts
│           └── BleAdapter.ts
│
├── stores/
│   └── connections.ts               # Pinia store
│
├── components/
│   └── connections/
│       ├── ConnectionManagerButton.vue   # Header button
│       ├── ConnectionManagerModal.vue    # Modal dialog
│       ├── ConnectionList.vue            # List with status dots
│       ├── ConnectionEditor.vue          # Dynamic form
│       └── controls/
│           └── ConnectionSelect.vue      # Node property dropdown
```

---

## Node Integration

### 1. Extend NodeDefinition

```typescript
// In stores/nodes.ts
interface NodeDefinition {
  // ... existing fields ...

  // NEW: Connection requirement
  connection?: {
    protocol: string      // Which connection type
    controlId: string     // Which control holds the selection
    required?: boolean
  }
}
```

### 2. Add 'connection' Control Type

```typescript
// Control definition in node
{
  id: 'connection',
  type: 'connection',  // Special type
  label: 'Connection',
  props: { protocol: 'mqtt' }
}
```

### 3. Render ConnectionSelect in PropertiesPanel

When `control.type === 'connection'`, render `<ConnectionSelect>` instead of regular input.

### 4. Executor Pattern

```typescript
// In node executor
const connectionId = ctx.controls.get('connection')
const adapter = getConnectionManager().getAdapter(connectionId)
if (adapter?.status === 'connected') {
  // Use adapter methods
}
```

---

## Persistence Format

```json
{
  "version": "2.0",
  "name": "My Flow",
  "connections": [
    {
      "id": "mqtt-local",
      "name": "Local Broker",
      "protocol": "mqtt",
      "autoConnect": true,
      "autoReconnect": true,
      "reconnectDelay": 5000,
      "brokerUrl": "ws://localhost:8083/mqtt"
    }
  ],
  "nodes": [...],
  "edges": [...]
}
```

---

## Custom Node Integration

Custom nodes can register connection types via their `executor.js`:

```javascript
// Called when custom node loads
export function onLoad(ctx) {
  ctx.connectionManager.registerType({
    id: 'artnet',
    name: 'ArtNet Node',
    icon: 'radio-tower',
    color: '#E91E63',
    configControls: [
      { id: 'host', type: 'text', label: 'IP', default: '255.255.255.255' },
      { id: 'universe', type: 'number', label: 'Universe', default: 0 }
    ],
    createAdapter: (config) => new ArtNetAdapter(config)
  })
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create `services/connections/types.ts` with interfaces
2. Create `ConnectionManager.ts` singleton service
3. Create `stores/connections.ts` Pinia store
4. Add platform detection utility (`isPlatform('electron')`)

### Phase 2: WASM Router (Browser)
1. Add WASM target to `clasp/crates/clasp-router/`
2. Create browser-compatible transport (WebSocket only)
3. Strip UDP/QUIC features for WASM build
4. Create `@clasp-to/router-wasm` npm package
5. Initialize in-browser router on app load

### Phase 3: Native Router (Electron)
1. Create Rust-Node binding for clasp-router (neon-bindings or napi-rs)
2. Add to Electron main process
3. IPC bridge for renderer ↔ router communication
4. Bundle protocol bridges (MIDI, OSC, Art-Net, DMX, Serial)
5. mDNS discovery integration

### Phase 4: Fallback Adapters
1. Create `WebSocketAdapter.ts` (direct connection)
2. Create `MqttAdapter.ts` (direct to broker)
3. Create `HttpAdapter.ts` (REST calls)
4. Auto-detect router availability, fallback gracefully

### Phase 5: UI Components
1. Create `ConnectionManagerButton.vue` for AppHeader
2. Create `ConnectionManagerModal.vue` (centered modal dialog)
3. Create `ConnectionList.vue` with status dot indicators
4. Create `ConnectionEditor.vue` with dynamic form generation
5. Create `ConnectionSelect.vue` dropdown control

### Phase 6: Platform-Aware Nodes
1. Extend `NodeDefinition` with `platforms: ['web', 'electron']`
2. Filter node palette by current platform
3. Mark Electron-only nodes (Art-Net, sACN, DMX USB, native Serial)
4. Update `PropertiesPanel.vue` for connection controls

### Phase 7: Persistence & Custom Nodes
1. Update flow save/load for connections
2. Extend `CustomNodeLoader.ts` for connection type registration
3. Add `onLoad` hook support for custom nodes

---

## Critical Files to Modify

### clasp-flow (this repo)
| File | Changes |
|------|---------|
| `stores/nodes.ts` | Add `connection` field, platform filtering |
| `components/layout/PropertiesPanel.vue` | Render `ConnectionSelect` |
| `components/layout/AppHeader.vue` | Add connection manager button |
| `engine/executors/connectivity.ts` | Use ConnectionManager + adapters |
| `services/customNodes/CustomNodeLoader.ts` | `onLoad` hook support |
| `composables/usePersistence.ts` | Save/load connections |
| `src/main/` (Electron) | Router IPC, native module loading |

### clasp (separate repo)
| File | Changes |
|------|---------|
| `crates/clasp-router/Cargo.toml` | Add `wasm32` target, feature flags |
| `crates/clasp-router/src/lib.rs` | Conditional compilation for WASM |
| NEW: `crates/clasp-router-wasm/` | WASM bindings package |
| NEW: `bindings/node/` | Native Node.js bindings (napi-rs) |

---

## Verification

1. **Manual Testing**
   - Open connection manager modal from header button
   - Create MQTT connection with valid broker
   - Drop MQTT Subscribe node, select connection from dropdown
   - Verify connection status indicator updates
   - Save/reload flow, verify connections persist

2. **Edge Cases**
   - Multiple connections same protocol
   - Connection failure/reconnect
   - Node referencing deleted connection
   - Custom node registering connection type

3. **Integration**
   - Works with ongoing componentization refactor
   - Custom nodes from `custom-nodes/` can use system
