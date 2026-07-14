# BLE Device Recognition + Device Nodes — Design (2026-07-13)

**Status:** DESIGN / awaiting maintainer sign-off before implementation.
**Threads:** B (device-recognition connection manager) + C (Muse 2 EEG + thermal-printer device nodes, folded in).
**Touches the connection + security model** — do not implement without sign-off.

Related: `EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` (declarable subsystems), `SECURITY_MODEL_2026-06-28.md`
(hardware capability gating), `CONNECTION_HANDLE_IMPL_2026-06-29.md` (ConnectionHandle), `MODEL_REGISTRY_IMPL_2026-06-30.md`
(the `defineModel` glob pattern this mirrors). Reference: `docs/reference/bellowsjs-0.1.5-llm-reference.md` is Thread D, unrelated.

---

## 0. Adversarial review corrections (fold into implementation — supersede the sections noted)

A 3-lens review (Web Bluetooth correctness / architecture fit / feasibility) returned **sound-with-fixes** on all
three — the direction holds; these corrections are load-bearing and must be applied before coding:

1. **[BLOCKER] Connect is gesture-only, never run-driven (supersedes §5's "reconnect on run").** A BLE connect must be
   initiated inside a real user-gesture handler (the scan-panel button / Connection-Manager connect click). But
   `engine/connection.ts::resolveConnectionHandle` auto-connects every ~2s **from the rAF executor loop** →
   `BleAdapter.doConnect` → `requestDevice`, which throws `NotAllowedError` without transient activation. **Fix:** the
   scan panel is the SOLE connect entry point; for `ble-muse`/`ble-escpos` the per-frame `ctx.connection` auto-connect
   must be **guarded to a no-op** that surfaces an `awaiting-pairing` status instead of calling `requestDevice`.
2. **Service discovery is allow-list bounded (refines §2/§3 Tier-2).** `getPrimaryServices()` only returns services in
   `filters.services ∪ optionalServices`. You cannot "discover then recognize" a service you didn't pre-declare, so
   (a) the scan-all `optionalServices` **union must be exhaustive** of every recognizable profile's service, and
   (b) recognition-by-service of a truly unknown vendor is **impossible by construction** — name/manufacturer only.
3. **`BluetoothDevice.name` is optional/often `undefined` (refines §2/§3).** Especially on the `acceptAllDevices` path
   (no `namePrefix` filter forced a named pick). `recognizeDevice` must treat missing name as normal and never require
   it; the recognition card must render `Unknown device` gracefully.
4. **No channel to hand a live `BluetoothDevice` into a ConnectionManager adapter (refines §4/§5).** `connect()` builds
   the adapter from a **serializable** `BaseConnectionConfig`; a `BluetoothDevice` is non-serializable. **Fix:** drive
   `ConnectionManager.connect(id)` **synchronously inside the card-click gesture** so the adapter's own `requestDevice`
   runs in that activation (clean for the "known device" path), or add an explicit live-device injection API.
5. **"Scan all" → vendor node would need two gestures (refines §4).** After the union-scan connects a generic `ble`
   adapter, the async `discoverServices()` consumes the activation, so switching to a `ble-muse` adapter needs a NEW
   `requestDevice` → fails / second chooser. **Fix:** keep **scan-all on generic `ble` nodes only**; vendor recognition
   flows through the **one-gesture "known device" card**. (Or transplant the already-connected adapter into the vendor
   handle without reconnecting — larger change.)
6. **Extend `BleAdapter`/a shared GATT base, not `BaseAdapter` (refines §5).** `BaseAdapter` has zero GATT; all
   requestDevice/connect/discover/notify/leak-safe-listener plumbing lives in `BleAdapter`. Also `BleAdapter.doConnect`
   is **hardwired to a single `serviceUUID`** — Muse's 5 EEG chars + control/telemetry need a multi-service refactor
   either way.
7. **`getPairedDevices()` doesn't help reconnection today (refines §5).** `doConnect` never calls `getDevices()` to
   rehydrate `this.device`, and gesture-free reconnect relies on Chromium's flag-gated persistent-permissions. Treat
   cross-reload reconnect as **best-effort**; to use it, `doConnect` must try `getDevices()` first.
8. **No reusable FFT — Muse band-power needs net-new DSP (refines §6.1/§7).** LATCH's only spectral code is `Tone.FFT`
   (a Web-Audio `AnalyserNode` on the audio graph) + Meyda — neither runs on an arbitrary 256 Hz `Float32Array` of EEG.
   **C1 must budget a pure-JS FFT + band-power + tests** (no fft.js dep exists); it is not a "factor-out."

---

## 1. Problem & goal

Today, connecting a BLE device means knowing its service + characteristic UUIDs and typing them into the generic
`ble` / `ble-scanner` / `ble-device` / `ble-characteristic` nodes. LATCH already ships `BleProfileRegistry`
(`services/ble/BleProfileRegistry.ts`) with standard Bluetooth-SIG service profiles and a
`detectDeviceType(serviceUuids[])` recognizer — **but nothing uses recognition for UX.** There is no vendor-device
coverage (Muse, thermal printers, Polar), no auto-populated UUIDs, and no "we recognized this — here's the right node."

**Goal:** scan → select → **recognize** whether it's a device we know → surface it as the RIGHT node(s) with custom
UI + flexibility, with a graceful generic fallback for everything else. Muse 2 (EEG) and thermal printers are the two
flagship recognized devices (Thread C).

**Non-goals (v1):** BLE central mode / peripheral advertising; non-Chromium Web Bluetooth (Safari has none — feature-detect
and show a clear message); auto-connect without a user gesture (Web Bluetooth forbids it).

---

## 2. Constraint that shapes everything: how Web Bluetooth scanning actually works

`navigator.bluetooth.requestDevice()` shows the **browser's native chooser** — we cannot restyle it, and we must pass
EITHER `filters` (by `services` and/or `namePrefix`) OR `acceptAllDevices: true`. We **cannot** "scan all, read each
device's advertised services, then filter in our own UI" through the standard picker — advertised service UUIDs are not
exposed pre-selection (privacy). Advertised data is only reachable via `watchAdvertisements()` / `requestLEScan()`
(Chromium, behind an origin-trial/flag — not universally available).

Therefore recognition is **two-tier**:

- **Tier 1 — pre-select (always available):** the user chooses a device *type* (Muse / Thermal Printer / Heart Rate /
  Generic), and we call `requestDevice` with that profile's `filters` + `optionalServices`. The chooser is already
  scoped to that device class. Plus the device **`name`** IS available after selection → name-prefix confirmation.
- **Tier 2 — post-connect (always available):** after GATT connect we enumerate services (`discoverServices()` already
  exists in `BleAdapter`) and match discovered service UUIDs against profiles → confirm/refine recognition. This also
  powers the "Scan all devices" path (`acceptAllDevices` + a broad `optionalServices` list → connect → recognize).
- **Tier 0 — progressive enhancement (optional):** where `requestLEScan()`/`watchAdvertisements()` exist, expose a
  live in-app device list with recognized badges *before* connecting. Treated as an enhancement, never required.

**Design decision:** build on Tiers 1 + 2 (universally available). Tier 0 is a later enhancement behind feature-detection.

---

## 3. The device-profile registry (`defineDeviceProfile`)

Extend recognition from *service*-level to *device*-level. Keep `BleProfileRegistry`'s SIG service/characteristic
profiles + parsers; add a **device** layer as a declarable, glob-discovered subsystem mirroring `defineProtocol` /
`defineModel` (so vendor profiles are drop-in data, not edits to a central switch).

```ts
// services/ble/deviceProfiles/<id>/profile.ts  →  export default defineDeviceProfile({...})
interface BleDeviceProfile {
  id: string                       // 'muse', 'escpos-printer', 'polar-hr'
  label: string                    // 'Muse (EEG headband)'
  icon: string                     // lucide id
  vendor?: string
  description: string

  /** How we recognize it. */
  match: {
    services?: (number | string)[]   // advertised/primary service UUIDs, e.g. 0xfe8d
    namePrefix?: string[]            // ['Muse'] — matched against BluetoothDevice.name
    manufacturerId?: number          // optional BLE company id (Tier-0 only)
  }

  /** What requestDevice() must ask for so the node can reach every characteristic it needs. */
  request: {
    filters?: BluetoothLEScanFilter[]   // e.g. [{ services: [0xfe8d] }] or [{ namePrefix: 'Muse' }]
    optionalServices: (number | string)[]  // MUST list every service the node reads (Web BT gate)
  }

  /** Which node(s) to offer when recognized (first = primary). */
  suggests: { nodeType: string; label: string; primary?: boolean }[]
}
```

- **Registry:** a Vite glob (`deviceProfiles/*/profile.ts`) → `deviceProfilesById`, exactly like `protocolRegistry.ts`.
- **Recognizer:** `recognizeDevice({ name, discoveredServices?, advertisedServices?, manufacturerData? }) →
  RankedMatch[]` where a match scores on (service-UUID hit > name-prefix hit > manufacturer-id hit). Returns ranked
  candidates; empty → generic fallback. Pure, fully unit-testable with fixtures (no BLE needed).
- **Fallback:** unrecognized → the existing generic `ble-*` nodes. `detectDeviceType` (SIG) stays as a coarse
  labeller under the device layer.

Ships with profiles: `muse`, `escpos-printer` (+ transport variants), plus the current SIG set (heart-rate, battery,
environmental, cycling, running) promoted to device profiles suggesting `ble-characteristic` pre-filled.

---

## 4. Scan + select UX

A new **"Add Bluetooth Device"** entry (button in the node explorer's connectivity area and/or the Connection Manager),
opening a small LATCH-owned panel that wraps the native chooser:

1. **Pre-scan panel** — two paths:
   - **"Find a known device"**: a grid of device-type cards (Muse, Thermal Printer, Heart Rate, …) from the profile
     registry. Pick one → `requestDevice(profile.request)` → native chooser scoped to that class.
   - **"Scan all devices"**: `requestDevice({ acceptAllDevices: true, optionalServices: <union of all profiles> })`.
2. **Recognition card** (post-select) — connect, `discoverServices()`, run `recognizeDevice`:
   - Recognized → `✓ Muse 2` badge + **[Add Muse EEG node]** (primary) and a secondary **[Use generic BLE nodes]**.
   - Unrecognized → `Unknown device "XYZ"` + **[Add generic BLE nodes]** (scanner→device→characteristic, pre-wired).
3. **Drop** the chosen node(s) onto the canvas, pre-bound to the selected device (see §5).

The native chooser can't be styled — but the *surrounding* flow (type chooser + recognition card + node suggestion)
is ours, and **always** offers the generic escape hatch. Custom UI + flexibility are first-class: recognition
*suggests*, never *forces*.

---

## 5. Device I/O: dedicated adapters + typed handles (NOT ad-hoc globals)

Per project rule ("device I/O via defineProtocol / ctx.connection, not ad-hoc globals"), each flagship device gets a
dedicated **adapter** (extends `BaseAdapter`) surfaced through a **typed ConnectionHandle**, registered via
`defineProtocol`. This isolates GATT + decode + DSP from the node, so nodes stay thin and testable, and reconnection /
credential handling flow through `ConnectionManager` like every other protocol. (The legacy `ble` nodes' ad-hoc
`navigator.bluetooth` + module Maps remain only as the generic fallback.)

- **`MuseAdapter`** (`adapters/MuseAdapter.ts`) — connects `0xfe8d`, subscribes the 5 EEG chars + control/telemetry,
  runs `decode12` + band-power FFT + blink/clench detection internally; exposes **`MuseHandle`**:
  `onEeg(cb)`, `onBands(cb)`, `onBlink(cb)`, `onClench(cb)`, `onTelemetry(cb)`, `setPreset(p)`, `status`.
- **`EscPosPrinterAdapter`** (`adapters/EscPosPrinterAdapter.ts`) — resolves transport (NUS `6e400001`/Phomemo `FF00`/
  ISSC/HM-10) from the recognized profile, encodes ESC/POS `GS v 0` raster, does chunked paced writes; exposes
  **`PrinterHandle`**: `print(job)`, `feed(n)`, `status`, `width`.
- Extend `ConnectionHandle.ts`'s `createConnectionHandle` switch with `'ble-muse'` and `'ble-escpos'` cases (today BLE
  returns only the base handle). Community-node access stays gated by the capability model exactly as for mqtt/ws/http.

**Reconnection nuance (see §0.1/§0.4/§0.7):** a `BluetoothDevice` ref is session-bound and non-serializable.
`ConnectionManager` persists the *profile + service config* (durable), but the **connect itself must run inside the
scan-panel/Connection-Manager gesture** — never from the rAF executor loop (that throws `NotAllowedError`). The vendor
handles' per-frame `ctx.connection` auto-connect is guarded to a no-op that reports `awaiting-pairing`. Cross-reload
gesture-free reconnect via `getDevices()` is best-effort (requires a `doConnect` change + Chromium persistent
permissions). Document the "press connect to pair" step in the node help.

---

## 6. Thread C — the two device nodes

### 6.1 `muse-eeg` (Muse 2 EEG headband)

GATT (from the reference app): service `0xfe8d`; chars `273e{XXXX}-4c4d-454d-96be-f03bac821358` — control `0001`,
telemetry `000b`, EEG `0003–0007` (TP9/AF7/AF8/TP10/AUX), PPG `000f–0011`, accel/gyro `000a`/`0009`. EEG = 256 Hz,
12 samples/notification, 12-bit packed (`decode12`), scale `0.48828125` µV/LSB, offset `0x800`. Start sequence:
halt → set preset (p50/p21/p20) → status → resume, written to the control char.

- **Connection:** `MuseHandle` via `ctx.connection({ protocol: 'ble-muse' })`.
- **Controls:** preset (p50 default), blink threshold (µV, default 110), clench threshold (×, default 3.0), band mode
  (relative/absolute), which outputs to enable (EEG raw / PPG / IMU).
- **Outputs:** raw per-channel signals (TP9/AF7/AF8/TP10) **and** a channel array (flexibility for custom DSP);
  band powers δ/θ/α/β/γ (per-band, averaged across channels — per-channel optional); `blink` (trigger); `clench`
  (trigger); a `focus`/`calm` metric (β/α and α/θ ratios); `contact`/signal-quality (0–1 per channel); `battery`.
- **Custom UI (NodeView):** the 4-electrode head map (contact halos, live) + five band bars. Core-trust component
  (like existing scope/eq node views); the heavy decode/DSP lives in `MuseAdapter`, so the view just renders handle
  state.
- **Decode/DSP location:** in `MuseAdapter`. **Band power needs a net-new pure-JS FFT** (see §0.8 — LATCH's only
  spectral code is `Tone.FFT`/Meyda on the live audio graph, unusable on a 256 Hz EEG `Float32Array`). Add a small
  FFT + band-power util, unit-tested against captured packet fixtures; keeps the node thin and the DSP off the audio clock.

### 6.2 `thermal-printer` (ESC/POS BLE printers)

Transports/protocols (from the reference app): NUS `6e400001`/write `6e400002`; Phomemo `FF00`/`FF02`; ISSC; HM-10.
ESC/POS `GS v 0` raster, 384 px width = 48 bytes/row, MSB-first, 1=black. `ESC @` reset, `GS v 0` block with 16-bit
height, `ESC d n` feed. Dithering: Floyd/Atkinson/ordered/threshold.

- **Connection:** `PrinterHandle` via `ctx.connection({ protocol: 'ble-escpos' })`.
- **Inputs:** `text` (string), `image` (canvas/texture/image), `print` (trigger), `feed` (trigger).
- **Controls:** width (384/576), dither mode (floyd default), density, transport/protocol (auto-set on recognition,
  overridable), align/bold/size (text), pace ms.
- **Outputs:** `connected`, `ready`, `status`, `error`.
- **Custom UI (NodeView):** a **live print preview** canvas — renders the current text/image dithered exactly as it
  will print (the reference app's `dither()` + raster path) — plus a **Print** button. This is the "preview" the
  kickoff asks for.
- **Encode/write location:** `EscPosPrinterAdapter.print(job)` builds the raster + does the chunked paced writes;
  `luck/yhk/cat` variants are strategies selected by the recognized profile. v1 covers **ESC/POS over NUS + Phomemo**
  (the common case); other variants added later as profiles.

---

## 7. Implementation phasing (each phase: co-located `defineNode`, `defineProtocol` adapters, gates + adversarial review + browser smoke, sign-off between phases)

- **B1 — recognition core (no UI):** `defineDeviceProfile` + glob registry + `recognizeDevice` + the profile data
  (SIG + muse + escpos). Pure logic, fully unit-tested with fixtures. Lowest risk; lands first.
- **B2 — scan/select UI:** pre-scan type chooser + post-select recognition card, wired to `requestDevice` +
  `discoverServices` + `recognizeDevice`; drops the suggested/generic node pre-bound. Feature-detects Web Bluetooth.
- **C1 — Muse:** `MuseAdapter` + `MuseHandle` (+ `ConnectionHandle` case) + `muse-eeg` node + head-map NodeView.
  Verified against captured packet fixtures; live-tested on hardware by the maintainer.
- **C2 — Printer:** `EscPosPrinterAdapter` + `PrinterHandle` + `thermal-printer` node + print-preview NodeView.
- Generic `ble-*` nodes stay throughout as the fallback.

---

## 8. Security / trust

BLE is a hardware capability gated by the security model. These are **core/built-in** nodes (trusted), but they route
through `ConnectionManager` + `ctx.connection` (capability path), not ad-hoc globals, so the trust model is unchanged.
Recognition never auto-connects (Web Bluetooth requires a user gesture). A community node wanting BLE would still hit
the capability gate + user approval, exactly as for mqtt/ws/http today. `defineDeviceProfile` carries **no code** (pure
data: UUIDs, name prefixes, node ids) — it can't smuggle behavior, so vendor profiles are safe to accept broadly.

---

## 9. Open questions for sign-off

1. **Recognition tiers:** OK to ship on Tiers 1+2 (universal) and treat `requestLEScan`/`watchAdvertisements` (Chromium
   flag) as later progressive enhancement? *(Recommend yes.)*
2. **Muse v1 scope:** EEG raw + bands + blink/clench + focus/contact/battery now; **defer PPG heart-rate + IMU** to v2
   to keep v1 focused? *(Recommend defer.)*
3. **Printer v1 scope:** ESC/POS over **NUS + Phomemo** first; cat/yhk/luck variants as later profiles? *(Recommend yes.)*
4. **Adapter vs. device-service for decode/DSP:** dedicated `MuseAdapter`/`EscPosPrinterAdapter` behind typed handles
   (this doc's choice) vs. a device-service the node drives. *(Recommend adapters — matches `ctx.connection` + isolates
   GATT/DSP.)*
5. **Entry point for the scan UI:** node-explorer connectivity button, Connection Manager modal, or both? *(Recommend
   both — a button that opens the same panel.)*
6. **NodeView trust:** Muse head-map + printer preview as **core-trust components** (like existing scope/eq views), or
   push to the declarative `ui` schema? *(Recommend components — the visualizations exceed Tier-A declarative UI.)*
