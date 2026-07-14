# Next-session kickoff — device features (BLE/Muse/printer/bellows) + UX backlog

Copy the block below as your first message to a fresh Claude Code session.
(Last updated 2026-07-14 — branch `phase0-file-format`, everything committed, **ahead 25** of origin; PR → `main` HELD.
Verify with `git status` + `git log --oneline -12`.)

---

ultracode ultrathink You're continuing **LATCH** — a free/open (MIT), web+desktop, node-based creative-coding tool
("Live Art Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; **241 nodes**) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. The authoring-DX plan is COMPLETE and the
branch is **deploy-ready + audited** (0 regressions, browser smoke green). Two device threads are shipped-in-part, and a
UX audit produced a ranked backlog. `main` untouched; **PR held** pending the maintainer's word.

Baseline (verify): `npm run typecheck` clean · `npm run lint` 0 err (49 pre-existing `any`-warns) · `npm run test:unit`
**2388 pass + 11 todo** · `npm run build` ok · browser smoke 241 nodes, Play→Stop 0 real errors.

## STEP 1 — Read + recall
1. `CLAUDE.md` — rules: **NO AI attribution in git EVER**; **commit/push only when explicitly asked**; stay on
   `phase0-file-format`; each step ends green; **never assume — read the real code**; honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **later-105 → 102**. Then the governing doc(s) for the track you pick:
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

## THE WORK — pick a track (each substantive step: adversarial-review workflow + gates + browser-smoke runtime changes)

### Track 1 — Device features (design-first is DONE; these are IMPLEMENT phases; sign-off between phases)
- **B2 — BLE scan/select UI.** A panel wrapping the native chooser: a "find a known device" type grid (from
  `deviceProfiles`) + a "scan all" path, then a recognition card (`recognizeDevice()` post-connect) suggesting the right
  node or the generic `ble-*` fallback, dropped pre-bound. **CRITICAL (§0.1):** connect runs inside the card-click
  **gesture**, never the rAF loop; vendor handles' per-frame auto-connect guards to a no-op `awaiting-pairing`. Respect
  allow-list-bounded discovery (§0.2) + often-undefined `BluetoothDevice.name` (§0.3); keep scan-all on generic nodes (§0.5).
- **C1 — Muse node (`muse-eeg`).** DSP is DONE (reuse `museSignal.ts`/`fft.ts`). Build `MuseAdapter` extending
  **`BleAdapter`** (§0.6 — needs a multi-service refactor of `doConnect`: Muse's 5 EEG chars + control/telemetry under
  `0xfe8d`, chars `273e{XXXX}-4c4d-454d-96be-f03bac821358`); control start-sequence halt→preset(p50)→status→resume; feed
  each notification through `parseEegNotification` + a per-channel ring buffer → `bandPowers`. Then the node (raw
  channels + δ/θ/α/β/γ + blink/clench + focus/contact/battery) + head-map NodeView (core component) + typed `MuseHandle`
  via `ctx.connection`; register `defineLifecycle` cleanup (leak-prone).
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
- **PR `phase0-file-format` → `main` is HELD** (25 commits of audited, green work). Offer to open it when the maintainer's ready.

## HOW TO WORK
- Each step ends green (typecheck/lint/test:unit/build); **browser-smoke any runtime/registry change** (Playwright +
  system Chrome vs `npm run dev` :5173 — reach the nodes store via `#app.__vue_app__`, `definitions.size===241`,
  Play→Stop, filter webcam/MediaPipe/wasm noise; recipe in `latch-smoke-test-harness`). For substantive work run an
  **adversarial-review workflow** and verify findings before declaring done.
- New nodes = co-located `defineNode` (`registry/<cat>/<id>/node.ts`; `npm run new-node`); device I/O via
  `defineProtocol`/`ctx.connection()` + typed handles, NOT ad-hoc globals; declarative `ui` schema first, `component:`
  only when NodeView lacks the widget; register `defineLifecycle`/`defineNodeState` cleanup for any per-node state.
- Any new `var(--token)` must be defined in `tokens.css` or carry a fallback (the token guard test enforces this).
- Commit ONLY when asked; author Moheeb Zara; **no AI attribution**. Update `docs/HANDOFF.md` + memory + this kickoff at close.
