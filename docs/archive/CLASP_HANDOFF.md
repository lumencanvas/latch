# CLASP Connection System - Technical Handoff

## Executive Summary

The CLASP implementation now uses the official `@clasp-to/core` library, eliminating ~1,200 lines of hand-rolled protocol code. Both the adapter and executor use the same library, ensuring consistent behavior.

**Key Change**: Replaced custom MessagePack/WebSocket implementation with `@clasp-to/core` library.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            @clasp-to/core                                │
│                      (Official CLASP Library)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ClaspBuilder - Connection builder with fluent API                       │
│  Clasp - Client with set/get/emit/stream/bundle/on methods              │
│  Value - Type-safe value type for CLASP messages                        │
└─────────────────────────────────────────────────────────────────────────┘
                    │                           │
         ┌──────────┴──────────┐     ┌──────────┴──────────┐
         ▼                      ▼     ▼                      ▼
┌─────────────────────┐  ┌─────────────────────────────────────────┐
│  ClaspAdapterImpl   │  │           CLASP Executor                 │
│  (272 lines)        │  │           (666 lines)                    │
├─────────────────────┤  ├─────────────────────────────────────────┤
│  - Used by UI modal │  │  - Used by node executors               │
│  - Extends BaseAdapter│ │  - Manages connection pool              │
│  - State machine     │  │  - Bridges with ConnectionManager      │
│  - Message buffering │  │  - Auto-connect/reconnect              │
└─────────────────────┘  └─────────────────────────────────────────┘
```

---

## Code Reduction

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `ClaspAdapter.ts` | 709 lines | 272 lines | 62% |
| `clasp.ts` executor | 1,173 lines | 666 lines | 43% |
| **Total** | **1,882 lines** | **938 lines** | **50%** |

**Eliminated:**
- Custom MessagePack encode/decode (~300 lines × 2)
- Custom frame encoding/decoding (~50 lines × 2)
- Custom WebSocket handling
- Duplicated QoS enum, pattern matching, etc.

---

## Library API Usage

### ClaspBuilder

```typescript
import { Clasp, ClaspBuilder, type Value } from '@clasp-to/core'

const client = await new ClaspBuilder('ws://localhost:7330')
  .name('My App')           // Set client name
  .token('optional-token')  // Set auth token
  .reconnect(false)         // We handle reconnection ourselves
  .connect()
```

### Clasp Client Methods

```typescript
// Reading
client.get(address)         // Get parameter value (async)
client.cached(address)      // Get cached value (sync)
client.on(pattern, callback) // Subscribe to pattern, returns unsubscribe fn

// Writing
client.set(address, value)  // Set parameter
client.emit(address, payload?) // Emit event
client.stream(address, value)  // Stream high-rate data

// Bundles
client.bundle([
  { set: ['/light/1', 1.0] },
  { emit: ['/cue/fire', { id: 'intro' }] }
], { at: client.time() + 100000 }) // Optional scheduled time

// Utilities
client.session        // Session ID (string | null)
client.connected      // Connection status (boolean)
client.time()         // Server-synced time (microseconds)
client.close()        // Close connection

// Events
client.onConnect(() => { ... })
client.onDisconnect((reason) => { ... })
client.onError((error) => { ... })
```

---

## Connection Architecture

### Two Entry Points (Same Library)

1. **ClaspAdapterImpl** - For UI-managed connections
   - Created via ConnectionManager when user adds CLASP connection
   - Uses BaseAdapter's state machine for status management
   - Supports message buffering when disconnected

2. **CLASP Executor** - For node execution
   - Maintains its own connection pool (`claspConnections` Map)
   - Bridges with ConnectionManager to get connection configs
   - Auto-connects when nodes need a connection

### Bridge Behavior

When a node requests a connection:
1. Executor checks local `claspConnections` Map
2. If not found, looks up config from ConnectionManager
3. Creates local `Clasp` instance using the library
4. Both systems may have separate connections to the same server

---

## Node Definitions

All CLASP nodes use `type: 'connection'` controls:

```typescript
{
  id: 'connectionId',
  type: 'connection',
  label: 'Connection',
  default: '',
  props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' }
}
```

| Node | File | Purpose |
|------|------|---------|
| clasp-connection | `clasp-connection.ts` | Creates/manages connections |
| clasp-set | `clasp-set.ts` | Sets parameter values |
| clasp-get | `clasp-get.ts` | Gets parameter values |
| clasp-emit | `clasp-emit.ts` | Emits events |
| clasp-stream | `clasp-stream.ts` | Streams high-rate data |
| clasp-subscribe | `clasp-subscribe.ts` | Subscribes to patterns |
| clasp-bundle | `clasp-bundle.ts` | Sends atomic bundles |

---

## Features

### Connection Timeout
Both adapter and executor use 10-second connection timeout:
```typescript
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT)
})
client = await Promise.race([connectPromise, timeoutPromise])
```

### Exponential Backoff
Reconnection uses exponential backoff capped at 30 seconds:
```typescript
const backoffDelay = Math.min(
  reconnectDelay * Math.pow(2, reconnectAttempts),
  30000
)
```

### Max Reconnection Attempts
Executor limits to 10 attempts before giving up:
```typescript
const MAX_RECONNECT_ATTEMPTS = 10
```

### Disconnection Detection
Library provides `onDisconnect` callback:
```typescript
client.onDisconnect((reason) => {
  connection.status = 'disconnected'
  connection.client = null
  scheduleReconnect(connection, connectionId)
})
```

---

## Dependencies

```json
{
  "@clasp-to/core": "^0.1.2"
}
```

**Library provides:**
- MessagePack encoding/decoding
- Frame encoding with magic byte, QoS flags
- HELLO/WELCOME handshake
- Subscription management
- Time synchronization
- Type-safe `Value` type

---

## File Reference

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `services/connections/adapters/ClaspAdapter.ts` | 272 | ClaspAdapterImpl using library |
| `engine/executors/clasp.ts` | 666 | Node executors using library |

### Supporting Files
| File | Purpose |
|------|---------|
| `services/connections/BaseAdapter.ts` | State machine, message buffering |
| `services/connections/types.ts` | Type definitions |
| `stores/connections.ts` | Pinia store |

### Node Definitions
| File | Node Type |
|------|-----------|
| `registry/connectivity/clasp-connection.ts` | Connection creator |
| `registry/connectivity/clasp-set.ts` | Parameter setter |
| `registry/connectivity/clasp-get.ts` | Parameter getter |
| `registry/connectivity/clasp-emit.ts` | Event emitter |
| `registry/connectivity/clasp-stream.ts` | Stream sender |
| `registry/connectivity/clasp-subscribe.ts` | Pattern subscriber |
| `registry/connectivity/clasp-bundle.ts` | Atomic bundle sender |

---

## Testing Checklist

- [ ] Create CLASP connection in modal, verify connection works
- [ ] Use clasp-set node, verify it can use modal-created connection
- [ ] Verify clasp-subscribe receives updates from server
- [ ] Test clasp-get with cached vs uncached values
- [ ] Test clasp-emit fires events correctly
- [ ] Test clasp-stream sends continuous data
- [ ] Test clasp-bundle sends atomic operations
- [ ] Disconnect network, verify reconnection with backoff
- [ ] Verify max reconnection attempts (10) stops retry loop
- [ ] Verify ConnectionSelect shows only CLASP connections

---

## Resources

- **CLASP Library**: https://github.com/lumencanvas/clasp
- **NPM Package**: https://www.npmjs.com/package/@clasp-to/core
- **Documentation**: https://clasp.to
- **CLASP Bridge App**: Download from clasp.to or via UI link

---

*Last Updated: 2026-01-20*
*Author: Claude Code Session*
