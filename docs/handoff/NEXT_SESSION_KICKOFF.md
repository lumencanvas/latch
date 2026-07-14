# Next-session kickoff — BLE device manager (B2/C) + bellowsjs (D)

Copy the block below as your first message to a fresh Claude Code session.
(Last updated 2026-07-13 — branch `phase0-file-format`, committed through `95b9ef0`; only
`docs/handoff/NEXT_SESSION_KICKOFF.md` is uncommitted between sessions. Verify with `git status` + `git log --oneline -8`.)

---

ultracode ultrathink You're continuing **LATCH** — a free/open (MIT), web+desktop, node-based creative-coding tool
("Live Art Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; **241 nodes**) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. The authoring-DX plan is COMPLETE, the
branch is **deploy-ready and audited** (later-102: 0 regressions, browser smoke green), and the **BLE device-manager +
bellowsjs designs are done** with the **recognition core (B1) shipped** (later-103). `main` untouched; PR held.

Baseline (verify): `npm run typecheck` clean · `npm run lint` 0 err (49 pre-existing `any`-warns) · `npm run test:unit`
**2357 pass + 11 todo** (152 files) · `npm run build` ok · browser smoke 241 nodes, Play→Stop 0 real errors.

## STEP 1 — Read + recall
1. `CLAUDE.md` — rules: **NO AI attribution in git EVER**; **commit/push only when explicitly asked**; stay on
   `phase0-file-format`; each step ends green; **never assume — read the real code**; honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **later-103 → 101** (this thread), then the two design docs:
   `docs/plans/BLE_DEVICE_MANAGER_2026-07-13.md` (esp. **§0 review corrections**) and
   `docs/plans/BELLOWSJS_EVALUATION_2026-07-13.md`. bellows API: `docs/reference/bellowsjs-0.1.5-llm-reference.md`.
3. **Recall memories**: `ble-device-manager-plan` (the hard Web-Bluetooth constraints), `bellows-latch-intent`
   (maintainer authored bellows; keep Tone; layered/flexible integration), `latch-smoke-test-harness`,
   `latch-webgl-contexts`, `latch-strategy`, `latch-colocation-phase6` (the co-located `defineNode` recipe).

## WHAT'S DONE (committed on `phase0-file-format`)
- **Thread A** — deploy audit + regression hunt: green, 0 regressions, 2 nit-fixes. Commits `b28adcb`/`ced8dbf`/`4fe3ccc`.
- **B/C + D designs** — committed `396378a`. **B1 recognition core** — committed `95b9ef0`:
  `services/ble/defineDeviceProfile.ts` (+ pure UUID canonicalizer + name-optional scorer),
  `services/ble/deviceProfileRegistry.ts` (glob + SIG derivation + `recognizeDevice`), vendor profiles `muse` +
  `escpos-printer`, 20 tests. Adversarially reviewed (SHIP-with-nits, all fixed).

## THE WORK — pick up where B1 left off (design-first is DONE; these are IMPLEMENT phases; sign-off between phases)

### B2 — BLE scan/select UI (the gesture-driven connect flow)
- A LATCH panel wrapping the native chooser: a **"find a known device"** type grid (from `deviceProfiles`) + a
  **"scan all"** path, then a **recognition card** (calls `recognizeDevice()` post-connect) that suggests the right
  node or the generic `ble-*` fallback, and drops it pre-bound. **CRITICAL (§0.1):** the connect must run inside the
  card-click **gesture** — never from the rAF executor loop; vendor handles' per-frame `ctx.connection` auto-connect
  guards to a no-op `awaiting-pairing`. Respect the allow-list-bounded service discovery (§0.2) and undefined
  `BluetoothDevice.name` (§0.3). Entry point: node-explorer connectivity button + Connection Manager.

### C1 — Muse 2 node (`muse-eeg`)
- `MuseAdapter` extending **`BleAdapter`** (not `BaseAdapter`; §0.6) — needs a **multi-service refactor** of
  `BleAdapter.doConnect` (Muse has 5 EEG chars + control/telemetry, all under `0xfe8d`, chars
  `273e{XXXX}-4c4d-454d-96be-f03bac821358`). Decode: 256 Hz, 12 samp/pkt, 12-bit packed, 0.48828125 µV/LSB; control
  start-sequence halt→preset(p50)→status→resume. **Add a net-new pure-JS FFT + band-power util (§0.8 — none exists).**
  Node outputs: raw channels + δ/θ/α/β/γ + blink/clench + focus/contact/battery; head-map NodeView (core component).
  Typed `MuseHandle` via `ctx.connection`; register cleanup (leak-prone — see the audio category's `defineLifecycle`).

### C2 — thermal-printer node (`thermal-printer`)
- `EscPosPrinterAdapter` + `PrinterHandle`; ESC/POS `GS v 0` raster (384 px = 48 bytes/row, MSB-first), chunked paced
  writes; NUS (`6e400001`/write `6e400002`) + Phomemo (`FF00`/`FF02`) transports for v1. Inputs: text/image/print/feed;
  a **live dithered print-preview NodeView** (Floyd/Atkinson). Reference: `~/Downloads/tack (15).html`.

### D0 → D — bellowsjs (add alongside Tone; do NOT replace)
- **D0 spike:** `npm i bellowsjs`; `Bellows.boot({ context })` on `AudioManager`'s AudioContext (reuse the Play
  gesture); prove one `va`/`pluck` voice sounds and can **route into LATCH's master graph** (the open question — 0.1.5
  doesn't clearly expose its output node; else parallel-to-destination or a MediaStream tap) and that the blob worklet
  loads under COEP credentialless. Then **D1** `bellows-instrument` (engine+preset+params, played by LATCH triggers),
  **D2** generative/theory nodes (euclid/arp/scale/chord/progression/tuning), **D3** `bellows-render` + a power-user
  `bellows-script` node. Maintainer authored bellows and wants the **full engine flexibly exposed** (layered).

## HOW TO WORK
- Each step ends green (typecheck/lint/test:unit/build); **browser-smoke any runtime/registry change** (Playwright +
  system Chrome vs `npm run dev` :5173 — reach the nodes store via `#app.__vue_app__`, `definitions.size===241`,
  Play→Stop, filter webcam/MediaPipe/wasm noise; harness recipe in `latch-smoke-test-harness`). For substantive work
  run an **adversarial-review workflow** and verify findings before declaring done.
- New nodes = the co-located `defineNode` shape (`registry/<cat>/<id>/node.ts`; `npm run new-node`); device I/O uses
  the `defineProtocol`/`ctx.connection()` path + typed handles, NOT ad-hoc globals. Custom UI: declarative `ui` schema
  first; `component:` only when NodeView lacks the widget. Register `defineLifecycle`/`defineNodeState` cleanup for any
  per-node state (recurring leak class).
- Commit ONLY when asked; author Moheeb Zara; **no AI attribution**. Update `docs/HANDOFF.md` + memory + this kickoff
  at close. PR `phase0-file-format` → `main` is held pending the maintainer's word.
