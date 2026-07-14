# LATCH — UX / Experience / Persona Audit (2026-07-13)

Deep audit of the **actual running product** (v1.2.14): live browser inspection + a 5-lens adversarial workflow
(UI/UX heuristics · visual design · onboarding · persona journeys · accessibility) grounded in screenshots, the code,
and the strategy personas (`docs/strategy/04`, `06`). Every high-impact claim below was independently code-verified.

**Method:** captured 7 real states via Playwright + system Chrome (empty-canvas onboarding, first-visit sample flow,
Connection Manager, AI Model Manager, Control Panel, mobile @390px, Play mode); visually inspected each; ran the audit
workflow; then grepped the codebase to confirm the load-bearing findings.

---

## Executive summary

LATCH has **genuinely strong bones** — a polished template-picker onboarding, rich per-node Info content, a real
keyboard/ARIA wiring engine, honest AI progress/error plumbing, a genuine hardware-style Control surface — **but the
product routes almost none of that value to first-time or mobile users.** The through-line: *excellent capabilities
exist yet are undiscoverable or unreachable*, while the default first impression is a dense 19-node showcase and, on
phones, a header with its load-bearing controls clipped off-screen. Layered on top is the documented **silent-token
bug class** quietly degrading polish and dropping color on error/warning affordances app-wide. The performance
personas (VJ / installation) also lack their gating primitives (fullscreen/perform mode, MIDI-learn, global transport),
which is a roadmap gap to **sequence honestly** — not to overclaim.

Encouragingly, the audit found LATCH has **outgrown its own strategy docs**: onboarding templates, the keyboard-a11y
engine, and AI error/progress ports are shipped but `strategy/04`/`06` still list them as open — solved problems are
being under-claimed.

---

## Strengths (preserve + enforce these)

- **Empty-canvas template picker** (shot 14) — "Start from a template", four curated cards, a full-starter CTA, and a
  node-library link. Strong onboarding; the problem is first-run doesn't route users *to* it.
- **Per-node Info content** — all 241 registry definitions populate `info.overview` + tips + pairsWith
  (`PropertiesPanel.vue:383-440`). A real teaching differentiator once surfaced.
- **Keyboard-a11y engine already ships** — `useCanvasKeyboard.ts` implements a rove/select/move/**wire** state machine
  with `aria-live` announcements + `role=application`. Legitimizes the accessibility positioning if made discoverable.
- **Honest AI capability surfacing** — the transformer AI nodes expose `loading/progress/done/error` ports + a model
  label (coverage is *uneven* — ~8/23 nodes expose all four; `loading`=19, `error`=12, `done`=9, `progress`=8); the AI
  Model Manager (shot 12) shows sizes, licenses, WebGPU/cache toggles, and a storage budget. On-brand (open/durable).
- **Control Panel** (shot 13) is a real hardware-style performance surface — knobs, envelope/EQ curve, piano, monitors.
- **Broad, real connectivity** — MIDI, OSC, MQTT, serial, WebSocket, HTTP, BLE (+ scanner).
- **Coherent visual language + data-type port coding** with non-color glyph/line cues (WCAG 1.4.1) — worth enforcing.

---

## Cross-cutting themes

1. First-run routes users into a dense 19-node showcase instead of the strong template picker that ships one tab away.
2. **Zero responsive handling** makes core actions unreachable on mobile/tablet — directly contradicting *ACCESSIBLE*.
3. **Silent design-token failures** (undefined `var()`) degrade polish and drop color on error/warning UI.
4. Powerful capabilities are **undiscoverable**: no help/shortcuts surface; keyboard-a11y, per-node Info, subflows hidden.
5. VJ/installation journeys lack gating primitives — fullscreen/perform mode, MIDI-learn, global transport, kiosk.
6. Graph **legibility + modulation coverage** are uneven: anonymous ports, unlabeled compact blocks, un-modulatable audio params.
7. Strategy/onboarding docs **understate** shipped a11y + onboarding work — solved problems look unsolved.

---

## Prioritized findings

Severity/effort in brackets. ✅ = independently code-verified this session.

| # | Sev/Eff | Finding | Evidence |
|---|---------|---------|----------|
| 1 | high/M | **First-run drops every visitor into a dense, uncaptioned 19-node showcase** instead of the template picker | `EditorView.vue:97-107` + `stores/flows.ts:1296-1309` auto-load the 263 KB `sample-flow.json` on first visit (shots 01/02) ✅ |
| 2 | high/M | **Header has zero responsive handling** — Stop, Controls, Save, AI, Connections clip off-screen on phones | shot 02 ends at a lone Play button; `AppHeader.vue` lays a fixed icon row with no overflow menu ✅ |
| 3 | high/S | **Undefined design tokens** silently break rounding app-wide + drop color on error/warning UI | `--radius-xs` **undefined, used 58×**; `--color-error/success/warning-<scale>` used 15× but only base singletons defined (`tokens.css:39-41`) ✅ |
| 4 | high/M | **Rich keyboard model + subflow tools + a11y wiring engine are undiscoverable** — no help/shortcuts surface | `EditorView.vue` handleKeyDown (~503-597) + `useCanvasKeyboard.ts`; no `?`/help/docs link anywhere |
| 5 | high/L | **No fullscreen / perform mode** — VJs/installations can't send clean output to a projector | `requestFullscreen`/`fullscreenElement`/`kiosk` = **0 hits** (the 5 matches are `autoStart` on clasp/audio) ✅ |
| 6 | high/M | **Many audio params are controls with no input ports** — nothing can modulate them | `synth/node.ts` (cutoff/reso/ADSR/detune are controls); `reverb/node.ts` (wet/decay controls) — no matching inputs |
| 7 | med/L | **No MIDI-learn, no global transport/BPM** — VJ hardware mapping + beat-sync are manual-only | `midiLearn` = 0; only a per-graph tap-tempo node, no app clock |
| 8 | med/L | **Low graph legibility** — ports anonymous until hover; compact nodes are unlabeled color blocks | `BaseNode.vue` reveals port labels only on hover/selected (~465,502) |
| 9 | med/S | **Empty-flow feedback is misleading** — Play reports "RUNNING · 60 fps" with nothing running; orphaned minimap white box | shot 15; `AppHeader.togglePlayback()` has no empty-graph guard (Play lacks `:disabled`; Stop has it) ✅ |
| 10 | med/S | **Best onboarding asset (per-node Info) is buried** behind a secondary tab, never found on first run | `PropertiesPanel.vue:383-440`; requires selecting a node + switching tabs |
| 11 | med/S | **Onboarding legibility fails AA** — empty-state subtitle ~2.7:1; on-canvas labels bottom out at 9px | `.empty-state` uses `--color-neutral-400 #8C8C8C` on `#E8E8E8` = **2.7:1** (< 4.5) ✅ |
| 12 | med/M | **Node visual language inconsistent / not theme-safe** — custom nodes hardcode off-token dark headers | `KeyboardNode.vue:207,222` hardcodes `#4b5563`/grays instead of `--color-neutral-*` |
| 13 | med/S | **AI first-run reads as gated/broken** despite good plumbing — download un-sized inline | purple "Load Models" pill + "LOAD LOCAL AI" (shots 11/14) imply a separate gate; size only in the modal |
| 14 | med/M | **No DMX/Art-Net output** — lighting-driven stage/installation makers have no path | `dmx`/`artnet` = 0 (rest of connectivity is broad + real) |
| 15 | med/M | **Template thumbnails are near-identical abstract dot-chains** — convey nothing about output | `EditorView.vue:993` renders 48px dot-on-line previews (shot 14); text carries all meaning |
| 16 | med/L | **"Durable / runs for months" is unbacked** — no kiosk/autostart/restart-on-crash | `kiosk`/autostart/restart = 0 ✅; honor DON'T-OVERCLAIM until soak-tested |
| 17 | low/S | **Icon-only header buttons** rely on `title` only; Save/Export/Import confusable; Node-Explorer uses a graduation-cap icon | `AppHeader.vue` ~305-340 |
| 18 | low/S | **Polish gaps** — native `window.prompt` for subflow naming; subtle dirty `*`; "drag" copy hides the tap path; stale strategy docs | `EditorView.vue:776` |

---

## Quick wins (low-effort, high-value — recommended first sweep)

1. **Kill the silent-token bug class:** add `--radius-xs` (2–3px) + full error/success/warning ramps (50–700) + the
   other missing tokens (`--color-neutral-850`, `--shadow-xl`, `--space-0-5/1-5`) to `tokens.css`, and add a **CI grep
   that fails on any `var(--token)` not defined**. (#3)
2. **Fix first-run routing:** send a true first-time visitor (and small viewports) to the **template picker**, demote
   the dense demo behind the existing "Open the full Starter Flow" CTA. (#1)
3. **Darken the empty-state hint** `--color-neutral-400 → 600` to clear AA on the first line users read. (#11)
4. **Guard empty-flow Play:** disable Play when `activeNodes.length===0` ("Add nodes to run") + suppress fps until a
   node runs; hide/shrink the minimap at 0 nodes and on narrow breakpoints. (#9)
5. **Responsive header:** collapse secondary icons into a kebab overflow below a breakpoint; keep Play/Stop + view
   switcher always visible. (#2)
6. **Default the Properties panel to the Info tab** on first node selection so the per-node help is discovered. (#10)
7. **Add explicit `aria-label`** to every icon-only header button; swap the Node-Explorer graduation-cap for a
   library/blocks icon. (#17)
8. **Add a `?` help surface:** a shortcut cheat sheet + a 3-step "add a node → wire it → press Play" quickstart + a
   docs link; emit an initial `aria-live` hint on canvas focus. (#4)
9. **Replace `window.prompt`** (subflow naming) with the styled modal system + empty-name validation. (#18)
10. **Refresh `strategy/04` + `06`** to reflect shipped onboarding templates, keyboard+ARIA wiring, and AI
    error/progress ports — they currently understate the product. (#7)

---

## Persona snapshot (where LATCH actually stands, 2026-07-13)

- **Beginner / student / educator:** onboarding empty state is genuinely good, but the *actual* first-run (dense
  auto-loaded showcase) + buried Info tab + no help surface mean the good stuff is undiscovered. Fixes #1/#4/#10/#11.
- **VJ / live performer + installation artist:** blocked by the absence of **fullscreen/perform mode** (#5),
  MIDI-learn + global transport (#7), and kiosk/durability (#16). The Control Panel is a strong base to build on.
- **Musician / sound artist:** blocked by un-modulatable audio params (#6) — the single highest-leverage audio fix.
- **Hardware / IoT maker:** strong connectivity, but no **DMX/Art-Net** (#14) leaves lighting out.
- **ML / AI tinkerer:** well served — honest ports + a real model manager; only the "looks gated" first-use polish (#13).
- **Accessibility-dependent:** the keyboard/ARIA engine is a real, shipped differentiator — but undiscoverable (#4) and
  undercut by contrast (#11) + the mobile clipping (#2). Make it visible and it becomes a legitimate headline claim.

> **Audit caveat:** the dedicated accessibility lens hit a tooling error mid-run; a11y coverage here is assembled from
> the visual + persona lenses + direct code checks (contrast, `role=application`, `useCanvasKeyboard`, port semantics).
> A focused WCAG pass (touch-target sizes on mobile, full SR walkthrough, modal focus-trap verification) is still worth
> a dedicated follow-up.

---

## Recommended sequencing

1. **Polish sweep (S, ~1–2 days):** quick wins 1–10 above — kills the token bug class, fixes first-run, contrast,
   empty-flow feedback, responsive header, help surface, and refreshes the strategy docs. Highest ratio of
   impact-to-effort and touches every persona.
2. **Modulation + legibility (M):** add input ports to key audio params (#6); persistent port labels + operator glyphs
   on compact nodes (#12/#8); better template thumbnails (#15).
3. **Performance personas (L, sequence honestly):** fullscreen/perform-output mode (#5) → MIDI-learn + global transport
   (#7) → Electron kiosk/autostart/restart (#16) → Art-Net/DMX output (#14). Do NOT market "runs for months" until
   soak-tested.
