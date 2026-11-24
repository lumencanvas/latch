# LATCH — Visual + Persona UX Audit (2026-07-23)

A **live visual** audit (not just code): I drove the running app with Playwright + system Chrome and
captured **31 screenshots** of every major surface — the editor shell + empty-canvas template picker,
all 6 modals (Node Explorer, AI Model Manager, Bluetooth Manager, Connection Manager, Help), the Code +
Shader (Monaco) editors, 12 Properties panels, 9 custom-component nodes, and canvas density views. An
**ultracode workflow (140 agents)** then ran **9 surface inspectors** (each *reading the actual PNGs* +
the Vue source) and **6 persona walkthroughs** (beginner, VJ, installation artist, hardware hacker,
accessibility, IoT maker), with every finding **refuted-or-confirmed by two independent skeptic lenses**
(visual + code) and a completeness critic. **37 confirmed findings + 4 critic findings.**

**Headline: LATCH's structure/UX is strong; its weakness is contrast.** The dominant, systemic issue —
directly at odds with LATCH's *accessible* positioning — is **`--color-neutral-400` (#8C8C8C, ~3.36:1 on
white / ~2.3:1 on light pills) used pervasively for secondary text**, plus a cluster of hardcoded
low-contrast canvas/label colors, failing WCAG AA across the always-on chrome. Fixes verified by
re-capturing the affected surfaces.

Gates after the pass: typecheck **0** · lint **0 err** · `test:unit` **2645 pass** · build **0** ·
re-capture confirms the contrast/UX fixes render.

---

## FIXED THIS PASS (27) — verified by re-capture where visible

### Contrast — secondary text raised to WCAG AA (neutral-400 → 500/600 on light; lighter on dark)
| Surface | File |
|---|---|
| **Status bar** — base text (→neutral-700), stopped dot (→neutral-600), metric values green **primary-400→primary-700** (was 1.9:1!), platform label (→neutral-600). Covers 3 findings + all 4 critic findings — the one always-on trust surface. | `layout/StatusBar.vue` |
| Sidebar category-count pills (2.3:1 → AA) | `layout/AppSidebar.vue` |
| Header version string (lightened on the dark header) | `layout/AppHeader.vue` |
| Node-explorer category counts, empty-state, search placeholder | `node-explorer/{CategoryNav,NodeExplorer}.vue` |
| Node-card IN/OUT/CTRL badges (9px→10px) | `node-explorer/NodeCard.vue` |
| Connection Manager empty-state guidance | `connections/ConnectionManagerModal.vue` |
| Template endpoint path + empty-state (the value distinguishing API calls) | `connections/TemplateSelect.vue` |
| Bluetooth modal vendor labels | `modals/BluetoothDeviceManagerModal.vue` |
| **Device-node status word** (the primary connection cue) on 4 panels | `connectivity/{muse-eeg/MuseHeadMap,neosensory-buzz/BuzzPanel,ble-characteristic/BleCharacteristicPanel,thermal-printer/PrintPreview}.vue` |
| Keyboard node header label | `inputs/keyboard/KeyboardNode.vue` |
| **Piano key labels** (note names + computer keys were unreadable — light & dark mode) | `controls/PianoKeyboard.vue` |
| **EQ axis + band labels** (#444 on near-black = ~1.4:1) + 8→10px | `controls/EQEditor.vue` |
| MainOutput "No Input" placeholder (canvas-drawn #666 → #999) | `outputs/main-output/MainOutputNode.vue` |
| Help quickstart step-number badges (white-on-green → darker green) | `modals/HelpModal.vue` |

### UX / affordances
| Fix | File |
|---|---|
| **Play is now a green "GO" button** when stopped-and-ready (was a neutral grey `btn-secondary`, indistinguishable as the start action — a VJ/beginner miss). | `layout/AppHeader.vue` |
| **Code Editor overlay 0.8 → 0.92** — the sidebar/properties ghosted through beside the modal. | `modals/CodeEditorModal.vue` |
| Code Editor **Monaco minimap off** — a cramped top-edge artifact for short functions (matches the Shader editor). | `modals/CodeEditorModal.vue` |
| **Starter CTA de-jargoned** — "Open the full Starter Flow — 3D · synth · MediaPipe" → "Open the full demo — live 3D, a playable synth, and hand tracking" (a no-experience beginner couldn't parse the old copy). | `views/EditorView.vue` |
| Node-explorer **tag chips → 24px min target** (WCAG 2.5.8; were ~19px). | `node-explorer/NodeExplorer.vue` |

### Verified NOT a bug
- The "LATCH watermark bleeding through the template cards" I spotted in the first capture was a
  **capture-timing artifact** (the animated LoadingScreen mid-fade), not a persistent defect — absent
  once the load settles, and the adversarial verifiers correctly declined to confirm it.

---

## DEFERRED — needs a palette decision / state wiring / hardware / larger refactor

- **AI model category badges** (WEBGPU/TEXT/VISION/AUDIO/MULTIMODAL) — white 9px on saturated fills fail
  AA (audio green ~1.9:1). Needs an accessible badge palette decision (darken fills to ≥4.5:1 vs white,
  or switch to light-tinted pills with dark ink). `modals/AIModelManagerModal.vue` getCategoryColor().
- **Bluetooth header icon has no connection status** (a dropped device is globally invisible) and the
  **Connections header icon reflects "configured", not live "connected" health**. Both want live
  connection/device-state bindings (mirror the `has-connections` pattern but keyed on live status) — and
  hardware to verify. `layout/AppHeader.vue` + `stores/connections.ts`. *(Installation-artist trust —
  high value; deferred only because it needs state wiring + a device to test.)*
- **Envelope / Waveform in-canvas labels** use hardcoded #666/#888 that ignore theme and miss contrast —
  should read tokenized colors at draw time (theme-aware). Larger than a one-line change.
  `controls/{EnvelopeEditor,WaveformEditor}.vue`.
- **Two node-code editors (Code vs Shader) use inconsistent shells** for the same task — unify on one
  header/footer/overlay. Refactor. `modals/{CodeEditorModal,ShaderEditorModal}.vue`.
- **"Load on startup" toggle row** is a 16px hit target (low; add min-height:24px).
  `modals/AIModelManagerModal.vue`.

## Capture-harness gap (for the next visual pass)
The 12 `20-props-*` Properties-panel screenshots **captured the empty panel**, not the selected node —
`setInspectedNode(id)` set state but the panel didn't render the node in the headless capture (likely
needs Vue Flow selection, not just `inspectedNode`). So **per-control Properties rendering was not
visually inspected** this pass (the rich ADSR/EQ editors were reached via the keyboard/EQ node captures +
source, not the panel). A follow-up should fix the capture to actually populate the panel (select the
node in Vue Flow, assert the panel isn't showing the empty state before shooting) and re-run the
surface inspector for `props-audio-controls` / `props-visual-ai-data`.

## What the personas praised (verified clean)
Node Explorer (sticky tabs, pinned port-type legend, keyboard tablist, focus mgmt); Help modal
(clear Quickstart→Editing→Subflows→Canvas hierarchy); Bluetooth pairing flow (clear, keyboard-accessible);
Connection Manager (clear list+editor); empty states present throughout. The bones are good — the fixes
above are polish that brings the *accessible* positioning up to its own standard.
