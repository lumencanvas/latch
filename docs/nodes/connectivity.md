# Connectivity Category

> Network and device communication protocols in LATCH.

**Category Color:** Teal (`#2AAB8A`)
**Icon:** `plug`

---

## HTTP Request

Make HTTP/REST API requests.

| Property | Value |
|----------|-------|
| **ID** | `http-request` |
| **Icon** | `globe` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `url` | `string` | Request URL |
| `headers` | `data` | Request headers object |
| `body` | `data` | Request body |
| `trigger` | `trigger` | Execute request |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `response` | `data` | Response data (parsed JSON or text) |
| `status` | `number` | HTTP status code |
| `error` | `string` | Error message |
| `loading` | `boolean` | Request in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `url` | `text` | `https://api.example.com/data` | - | Request URL |
| `method` | `select` | `GET` | options: GET, POST, PUT, DELETE, PATCH | HTTP method |

### Implementation
Uses `fetch()` API. Automatically parses JSON responses. Headers and body can be provided as objects.

---

## WebSocket

Real-time bidirectional WebSocket connection.

| Property | Value |
|----------|-------|
| **ID** | `websocket` |
| **Icon** | `radio` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `url` | `string` | WebSocket URL |
| `send` | `data` | Data to send |
| `connect` | `boolean` | Connect/disconnect |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `message` | `data` | Received message |
| `connected` | `boolean` | Connection state |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `url` | `text` | `wss://echo.websocket.org` | WebSocket URL |
| `autoConnect` | `toggle` | `false` | Connect on flow start |

### Implementation
Manages WebSocket lifecycle. Messages are parsed as JSON if possible, otherwise returned as strings.

---

## MIDI Input

Receive MIDI messages from devices.

| Property | Value |
|----------|-------|
| **ID** | `midi-input` |
| **Icon** | `music` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `note` | `number` | MIDI note number (0-127) |
| `velocity` | `number` | Note velocity (0-127) |
| `noteOn` | `boolean` | Note on state |
| `cc` | `number` | Last CC number |
| `ccValue` | `number` | Last CC value (0-127) |
| `connected` | `boolean` | Device connected |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `enabled` | `toggle` | `true` | - | Enable MIDI listening |
| `channel` | `number` | `-1` | min: -1, max: 15 | MIDI channel (-1 = all) |

### Implementation
Uses Web MIDI API (`navigator.requestMIDIAccess()`). Listens to all connected MIDI input devices.

---

## MIDI Output

Send MIDI messages to devices.

| Property | Value |
|----------|-------|
| **ID** | `midi-output` |
| **Icon** | `music` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `note` | `number` | Note number to send |
| `velocity` | `number` | Note velocity |
| `trigger` | `trigger` | Send note |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `connected` | `boolean` | Device connected |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `channel` | `number` | `0` | min: 0, max: 15 | MIDI channel |

### Implementation
Sends MIDI note on/off messages via Web MIDI API.

---

## MQTT

MQTT publish/subscribe messaging via WebSocket.

| Property | Value |
|----------|-------|
| **ID** | `mqtt` |
| **Icon** | `radio` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `url` | `string` | Broker URL |
| `topic` | `string` | Subscribe topic |
| `publish` | `data` | Data to publish |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `message` | `data` | Received message |
| `topic` | `string` | Message topic |
| `connected` | `boolean` | Connection state |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `url` | `text` | `ws://localhost:8083/mqtt` | Broker WebSocket URL |
| `topic` | `text` | `clasp/data` | Subscribe topic pattern |
| `connect` | `toggle` | `true` | Auto-connect |

### Implementation
Uses MQTT.js library over WebSocket. Supports topic wildcards (+ and #).

---

## OSC

Open Sound Control protocol over WebSocket.

| Property | Value |
|----------|-------|
| **ID** | `osc` |
| **Icon** | `radio-tower` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `host` | `string` | Server host |
| `port` | `number` | Server port |
| `address` | `string` | OSC address pattern |
| `send` | `data` | Data to send |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `address` | `string` | Received message address |
| `args` | `data` | Message arguments array |
| `value` | `number` | First numeric argument |
| `connected` | `boolean` | Connection state |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `host` | `text` | `localhost` | - | Server host |
| `port` | `number` | `8080` | min: 1, max: 65535 | Server port |
| `address` | `text` | `/clasp` | - | Address pattern to listen |
| `connect` | `toggle` | `true` | - | Auto-connect |

### Implementation
OSC over WebSocket using osc.js library. Address patterns support wildcards.

---

## Serial Port

Serial port communication via Web Serial API.

| Property | Value |
|----------|-------|
| **ID** | `serial` |
| **Icon** | `usb` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `send` | `string` | Data to send |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `data` | `string` | Raw received data |
| `line` | `string` | Last complete line |
| `value` | `number` | Parsed numeric value |
| `connected` | `boolean` | Connection state |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `baudRate` | `select` | `9600` | options: 9600, 19200, 38400, 57600, 115200 | Baud rate |
| `connect` | `toggle` | `false` | - | Connect (prompts for device) |

### Implementation
Uses Web Serial API. User must interact to select port. Buffers incoming data and parses lines on newline.

---

## Bluetooth LE

Bluetooth Low Energy communication via Web Bluetooth API.

| Property | Value |
|----------|-------|
| **ID** | `ble` |
| **Icon** | `bluetooth` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `send` | `data` | Data to write |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `number` | Parsed numeric value |
| `text` | `string` | Text value |
| `rawValue` | `data` | Raw DataView |
| `deviceName` | `string` | Connected device name |
| `connected` | `boolean` | Connection state |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `serviceUUID` | `text` | `''` | BLE service UUID |
| `characteristicUUID` | `text` | `''` | BLE characteristic UUID |
| `connect` | `toggle` | `false` | Connect (prompts for device) |

### Implementation
Uses Web Bluetooth API. User must interact to pair device. Supports notifications for continuous data.

---

## CLASP Connection

Manage a named CLASP protocol connection.

| Property | Value |
|----------|-------|
| **ID** | `clasp-connection` |
| **Icon** | `network` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `url` | `string` | Server URL |
| `connect` | `trigger` | Connect trigger |
| `disconnect` | `trigger` | Disconnect trigger |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `connected` | `boolean` | Connection state |
| `status` | `string` | Status string |
| `error` | `string` | Error message |
| `session` | `string` | Session ID |
| `connectionId` | `string` | Connection ID |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `connectionId` | `text` | `default` | Unique ID for this connection |
| `url` | `text` | `ws://localhost:7330` | CLASP server URL |
| `name` | `text` | `latch` | Client name |
| `token` | `text` | `''` | Auth token (cpsk_...) |
| `autoConnect` | `toggle` | `true` | Auto-connect on start |
| `autoReconnect` | `toggle` | `true` | Auto-reconnect on disconnect |
| `reconnectDelay` | `number` | `5000` | Reconnect delay (ms) |

### Implementation
Manages CLASP WebSocket connection. Connection ID allows sharing across multiple CLASP nodes.

---

## CLASP Subscribe

Subscribe to CLASP address patterns.

| Property | Value |
|----------|-------|
| **ID** | `clasp-subscribe` |
| **Icon** | `bell` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `connectionId` | `string` | Connection ID |
| `pattern` | `string` | Address pattern |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Received value |
| `address` | `string` | Signal address |
| `type` | `string` | Signal type |
| `revision` | `number` | Value revision |
| `subscribed` | `boolean` | Subscription active |
| `updated` | `boolean` | Value updated this frame |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `connectionId` | `text` | `default` | - | Connection ID reference |
| `pattern` | `text` | `/**` | - | Address pattern (supports wildcards) |
| `types` | `select` | `all` | options: all, param, event, stream, gesture | Signal type filter |
| `maxRate` | `number` | `0` | min: 0, max: 120 | Rate limit (Hz, 0=unlimited) |
| `epsilon` | `number` | `0` | min: 0, max: 1 | Change threshold |

---

## CLASP Set

Set a CLASP parameter value.

| Property | Value |
|----------|-------|
| **ID** | `clasp-set` |
| **Icon** | `edit-3` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `connectionId` | `string` | Connection ID |
| `address` | `string` | Parameter address |
| `value` | `any` | Value to set |
| `trigger` | `trigger` | Send trigger |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `sent` | `boolean` | Message sent |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `connectionId` | `text` | `default` | Connection ID reference |
| `address` | `text` | `/param` | Parameter address |

---

## CLASP Emit

Emit a CLASP event (one-time trigger).

| Property | Value |
|----------|-------|
| **ID** | `clasp-emit` |
| **Icon** | `zap` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `connectionId` | `string` | Connection ID |
| `address` | `string` | Event address |
| `payload` | `any` | Event payload |
| `trigger` | `trigger` | Emit trigger |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `sent` | `boolean` | Event sent |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `connectionId` | `text` | `default` | Connection ID reference |
| `address` | `text` | `/event` | Event address |

---

## CLASP Get

Get current value of a CLASP parameter.

| Property | Value |
|----------|-------|
| **ID** | `clasp-get` |
| **Icon** | `download` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `connectionId` | `string` | Connection ID |
| `address` | `string` | Parameter address |
| `trigger` | `trigger` | Get trigger |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `value` | `any` | Retrieved value |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `connectionId` | `text` | `default` | Connection ID reference |
| `address` | `text` | `/param` | Parameter address |

---

## CLASP Stream

Stream high-rate continuous data.

| Property | Value |
|----------|-------|
| **ID** | `clasp-stream` |
| **Icon** | `activity` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `connectionId` | `string` | Connection ID |
| `address` | `string` | Stream address |
| `value` | `any` | Value to stream |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `sent` | `boolean` | Data sent |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `connectionId` | `text` | `default` | Connection ID reference |
| `address` | `text` | `/stream` | Stream address |
| `enabled` | `toggle` | `true` | Enable streaming |

---

## CLASP Bundle

Send atomic bundles of CLASP operations.

| Property | Value |
|----------|-------|
| **ID** | `clasp-bundle` |
| **Icon** | `package` |
| **Version** | 1.0.0 |
| **Color** | `#6366f1` |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `connectionId` | `string` | Connection ID |
| `messages` | `data` | Array of messages |
| `at` | `number` | Schedule time (microseconds) |
| `trigger` | `trigger` | Send trigger |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `sent` | `boolean` | Bundle sent |
| `error` | `string` | Error message |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `connectionId` | `text` | `default` | Connection ID reference |
