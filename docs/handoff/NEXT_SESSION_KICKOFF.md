# Next-session kickoff — device features (BLE/Muse/printer/bellows) + UX backlog

Copy the block below as your first message to a fresh Claude Code session.
(Last updated 2026-07-14 — branch `phase0-file-format`, **ahead 25 committed + B2 (later-106) & C1 Muse (later-107)
UNCOMMITTED** in the working tree; PR → `main` HELD. Verify with `git status` + `git log --oneline -12`.)

---

ultracode ultrathink You're continuing **LATCH** — a free/open (MIT), web+desktop, node-based creative-coding tool
("Live Art Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; **242 nodes**) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. The authoring-DX plan is COMPLETE and the
branch is **deploy-ready + audited** (0 regressions, browser smoke green). Two device threads are shipped-in-part, and a
UX audit produced a ranked backlog. `main` untouched; **PR held** pending the maintainer's word.

Baseline (verify): `npm run typecheck` clean · `npm run lint` 0 err (49 pre-existing `any`-warns) · `npm run test:unit`
**2407 pass + 11 todo** · `npm run build` ok · browser smoke 242 nodes, Play→Stop 0 real errors.

## STEP 1 — Read + recall
1. `CLAUDE.md` — rules: **NO AI attribution in git EVER**; **commit/push only when explicitly asked**; stay on
   `phase0-file-format`; each step ends green; **never assume — read the real code**; honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **later-107 → 104**. Then the governing doc(s) for the track you pick:
   - Devices: `docs/plans/BLE_DEVICE_MANAGER_2026-07-13.md` (esp. **§0 review corrections**) +
     `docs/plans/BELLOWSJS_EVALUATION_2026-07-13.md`; bellows API `docs/reference/bellowsjs-0.1.5-llm-reference.md`.
   - UX: `docs/UX_EXPERIENCE_AUDIT_2026-07-13.md` (18 ranked findings; first sweep already shipped).
3. **Recall memories**: `ble-device-manager-plan` (hard Web-Bluetooth constraints), `bellows-latch-intent` (maintainer
   authored bellows; keep Tone; layered/flexible), `latch-smoke-test-harness`, `latch-undefined-css-tokens`,
   `latch-a11y-bug-classes`, `latch-webgl-contexts`, `latch-strategy`, `latch-colocation-phase6`.

## WHAT'S DONE (committed on `phase0-file-format` this run)
- **Thread A** — deploy audit + regression hunt (0 regressions) · starter-flow fixes · 2 nit-fixes (later-102).
- **B/C/D designs** (later-103). **B1 BLE recognition core** — `services/ble/defineDeviceProfile.ts` +
  `deviceProfileRegistry.ts` (glob + SIG derivation + `recognizeDevice`) + muse/escpos profiles + 20 tests.
- **C1 Muse DSP foundation** (later-104) — `utils/fft.ts` (FFT/Welch PSD/band-power), `utils/biquad.ts` (RBJ),
  `services/ble/muse/museSignal.ts` (12-bit decode, δ/θ/α/β/γ bands, blink/clench) + 26 tests. **Reuse — don't re-derive.**
- **UX audit + first fix sweep** (later-105) — silent-token bug class killed (+ CI guard
  `tests/unit/styles/tokens-defined.test.ts`), header a11y labels, onboarding polish (empty-state contrast, Play guard,
  minimap-hidden-at-0, Info-tab-on-first-inspection).
- **B2 "Add Bluetooth Device" scan panel** (later-106, **UNCOMMITTED**) — header panel: known-device grid +
  scan-all → `requestDevice` in gesture → `recognizeDevice` by name → recognition card → drops a pre-bound scaffold.
  **One-pairing handoff via `deviceId`/`getDevices()`, NOT `connectionId`** (`BleAdapter.getDeviceById`/`setDevice`;
  `ble-scanner` `deviceId` control) — see memory `ble-device-manager-plan`. Generic fallback = `ble-scanner → ble-device`
  (single GATT consumer). Review-fixed the dual-adapter-over-one-GATT major. `bluetoothScan.ts` + 9 tests.
- **C1 Muse node** (later-107, **UNCOMMITTED**) — `muse-eeg` node + `MuseAdapter` (extends `BleAdapter`) +
  `MuseHeadMap.vue` (head with TP9/AF7/AF8/TP10 dots + contact halos + δθαβγ bars). **Node-owned adapter** (module Map +
  `defineLifecycle`), NOT `ctx.connection` — consistent with `ble-device`/`ble-characteristic`. **Audit-first found 14
  foundation bugs** (DSP DC-removal + welchPsd tail-align in `utils/fft.ts`; BleAdapter listener-leak-on-disconnect
  **blocker** + dispose-leaves-GATT-connected; B2 scanner/autoConnect regressions) — all fixed BEFORE building; then a
  **C1 review fixed 16 more** (clench per-channel-baseline + warm-up gating; failed-connect wedge; stuck-`connected`-on-
  drop; disposal race). **17 new tests.** ⚠️ **Needs maintainer HW live-test** (start-sequence + telemetry battery
  scaling are best-known-protocol; no captured Muse reference exists in-repo).

## THE WORK — pick a track (each substantive step: adversarial-review workflow + gates + browser-smoke runtime changes)

### Track 1 — Device features (design-first is DONE; these are IMPLEMENT phases; sign-off between phases)
- **B2 — BLE scan/select UI. ✅ DONE (later-106).** See WHAT'S DONE. Recognition is currently **name-based** (Tier-1);
  **post-connect service discovery (Tier-2) is DEFERRED** as an enhancement (known-card recognition is certain
  pre-connect; branded devices name-match; avoids panel↔node GATT churn). When a **vendor node** (`muse-eeg`/
  `thermal-printer`) exists, `buildDeviceNodeChain` auto-drops it pre-bound by `deviceId` instead of the generic pair —
  **build C1/C2 to read that `deviceId` control** (resolve via `BleAdapter.getDeviceById()`, the gesture-free path).
- **C1 — Muse node (`muse-eeg`). ✅ DONE (later-107).** See WHAT'S DONE. `MuseAdapter`/`muse-eeg`/`MuseHeadMap.vue`
  shipped + green + screenshot-verified. **Only remaining: the maintainer's on-hardware test** — the GATT start-sequence
  (halt→preset→status→resume, framed `[len][ascii][\n]`) and telemetry battery scaling (`raw/512/100`) are implemented
  from the known Muse protocol but not device-verified; blink/clench thresholds may want tuning against a real headband.
  The `defineProtocol('muse')`/`ctx.connection` route was deliberately NOT taken (node-owned adapter matches the sibling
  BLE nodes; revisit only if multiple nodes must share one Muse).
- **C2 — `thermal-printer`.** `EscPosPrinterAdapter` + `PrinterHandle`; ESC/POS `GS v 0` raster (384px = 48-byte rows,
  MSB-first), chunked paced writes; NUS (`6e400001`/write `6e400002`) + Phomemo (`FF00`/`FF02`) transports v1; inputs
  text/image/print/feed; a live dithered print-preview NodeView. Reference: `~/Downloads/tack (15).html`.
- **D0→D — bellowsjs (add alongside Tone; do NOT replace).** D0 spike: `npm i bellowsjs`; `Bellows.boot({ context })`
  on `AudioManager`'s AudioContext (reuse the Play gesture); prove one `va`/`pluck` voice sounds + **routes into LATCH's
  master graph** (open Q — 0.1.5 doesn't clearly expose its output node; else parallel-to-destination / MediaStream tap)
  + the blob worklet loads under COEP credentialless. Then D1 `bellows-instrument`, D2 generative/theory nodes
  (euclid/arp/scale/chord/progression/tuning), D3 `bellows-render` + a power-user `bellows-script`. Maintainer authored
  bellows and wants the full engine **flexibly** exposed (layered: casual presets → structured → script escape hatch).

### Track 2 — UX backlog (from `docs/UX_EXPERIENCE_AUDIT_2026-07-13.md`)
- **Highest value next:** responsive header (#2 — collapse secondary icons into a kebab below a breakpoint; core actions
  clip off-screen on mobile) · a `?` help/shortcuts surface (#4 — the keyboard/subflow/a11y features are undiscoverable).
- **Then:** `window.prompt`→styled modal (#18) · audio modulation input ports (#6 — synth/reverb params can't be driven)
  · better template thumbnails (#15).
- **L features (design + sign-off first; honor DON'T-OVERCLAIM):** fullscreen/perform mode (#5) · MIDI-learn + global
  transport (#7) · DMX/Art-Net (#14) · kiosk/durability (#16 — no "runs for months" until soak-tested).
- **Deferred maintainer DECISIONS (not bugs):** first-run routing (#1 — sample-flow-on-first-visit is deliberate) ·
  KeyboardNode device-skin colors (#12 — theme tokens would flip the skin).

### Overarching
- **PR `phase0-file-format` → `main` is HELD** (25 committed + the uncommitted B2 (later-106) & C1 Muse (later-107)
  working-tree changes, all audited + green). Offer to commit B2+C1 and/or open the PR when the maintainer's ready.

## HOW TO WORK
- Each step ends green (typecheck/lint/test:unit/build); **browser-smoke any runtime/registry change** (Playwright +
  system Chrome vs `npm run dev` :5173 — reach the nodes store via `#app.__vue_app__`, `definitions.size===242`,
  Play→Stop, filter webcam/MediaPipe/wasm noise; recipe in `latch-smoke-test-harness`). For substantive work run an
  **adversarial-review workflow** and verify findings before declaring done.
- New nodes = co-located `defineNode` (`registry/<cat>/<id>/node.ts`; `npm run new-node`); device I/O via
  `defineProtocol`/`ctx.connection()` + typed handles, NOT ad-hoc globals; declarative `ui` schema first, `component:`
  only when NodeView lacks the widget; register `defineLifecycle`/`defineNodeState` cleanup for any per-node state.
- Any new `var(--token)` must be defined in `tokens.css` or carry a fallback (the token guard test enforces this).
- Commit ONLY when asked; author Moheeb Zara; **no AI attribution**. Update `docs/HANDOFF.md` + memory + this kickoff at close.
