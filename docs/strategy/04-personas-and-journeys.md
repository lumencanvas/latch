# Personas & Journeys

Every skill level and interest walked through both *using* and *developing for*
LATCH, with the friction they hit and what they need. Personas are synthesized from
the research (`01`–`03`) + the repo audit; each ends with a **success metric** and
the **load-bearing need**. Claims about competitor friction are evidenced (`01`/
`02`); claims about LATCH behavior reference the audit/plans.

Skill axis (cuts across all): **Explorer** (no/low code) · **Maker** (comfortable,
not a programmer) · **Builder** (codes) · **Extender** (builds tools/nodes).

---

## 1. The curious beginner / hobbyist (Explorer)

**Wants:** make something cool in one sitting, no install, no signup, no cost.
**First 10 minutes:** opens `latch.design` → must see *something already running*
(a template), not a blank canvas. Tweaks a slider, sees the output change live.
**Friction (evidenced):** blank-canvas "which node?" paralysis (Max "I gave up";
Origami "daunting"); camera/mic permission confusion (Cables). **Needs:** templates
on the empty canvas; type-to-search + drag-a-wire-into-empty-space → compatible
nodes; plain-language tooltips; live per-node preview (TD's superpower); clear
in-app device-permission UX. **Success:** a shareable result in the first session
without reading docs. **Load-bearing need:** zero-friction onboarding + instant
visual feedback.

## 2. The student & the educator (Explorer→Maker)

**Wants:** learn/teach creative coding; **keep access after graduation.** **Friction
(evidenced):** Isadora's own users — "my graduating students love izzy but none can
afford it"; tools die (QC) and coursework rots. **Needs:** free forever, no license
to lose; runs on lab/Chromebook/any-OS (web); example library mapping to concepts;
readable graphs that double as teaching artifacts (Node-RED's self-documenting
flows); export so student work survives the class. **Success:** a student re-opens
their project years later on a different machine and it still works. **Load-bearing
need:** durability + access + legibility.

## 3. The VJ / live performer (Maker→Builder)

**Wants:** reliable visuals that won't crash mid-set; beat-synced; mappable to a
MIDI controller; instant cueing. **Friction (evidenced):** Resolume crashes under
load (and is the bar for stability + Ableton-Link sync); Max device-changes need a
restart; node tools lack a real perform mode. **Needs:** a runtime that survives a
2-hour set; **global BPM/clock + tap-tempo sync**; **MIDI/OSC "learn"** to map
hardware; a **perform/fullscreen mode** distinct from editing; crash-safe autosave;
audio-reactive primitives that "just work." **Success:** an unattended-by-the-
laptop 90-minute set with zero crashes and tactile control. **Load-bearing need:**
live stability + tempo/MIDI mapping + perform mode. (LATCH today: **gaps** — no
global transport, no MIDI-learn, no fullscreen perform mode; see audit §G.)

## 4. The installation artist (Maker→Builder)

**Wants:** a piece that runs **for months, unattended**, recovers from crashes,
boots into fullscreen. **Friction (evidenced):** Isadora has **no native kiosk**
(installs rely on "Restart on Crash"); TD needs the Stalker watchdog; Resolume/
Node-RED corrupt files on power loss. **Needs:** **first-class kiosk mode**
(fullscreen, autostart, restart-on-crash, scheduled on/off); **atomic crash-safe
autosave** + recoverable JSON; deterministic/headless replay so the piece behaves
identically day after day; long-uptime memory discipline. **Success:** a museum
install runs 6 months untouched. **Load-bearing need:** unattended reliability +
kiosk deploy. (LATCH today: **SHARED/WORSE** on long-uptime hardening — a known bug
class; this must be *earned*, not assumed — see `01` §F#6, `06`.)

## 5. The generative / creative coder (Builder)

**Wants:** power — custom logic, shaders, math, ML — without a node graph getting in
the way of dense logic. **Friction (evidenced):** Houdini pros abandon VOP networks
to type VEX; node tools make math/loops painful (`03` §2). **Needs:** **first-class
code + expression nodes** (JS/GLSL) for inner logic, nodes for dataflow; a real code
editor (Monaco exists); shader authoring with **hot uniform updates** (don't
recompile on every slider drag — Houdini's lag lesson); per-port value inspection
for debugging. **Success:** drops to code exactly where nodes hurt, stays visual
elsewhere. **Load-bearing need:** clean code↔node boundary + shader ergonomics.

## 6. The musician / sound artist (Maker→Builder)

**Wants:** synths, effects, audio-reactive visuals, MIDI keyboards. **Friction
(evidenced):** Max single-threaded audio + multicore "cracks and pops"; signal-rate
vs control-rate confusion. **Needs:** Tone.js instruments/effects with **knobs/
sliders that modulate** (audit §C: many audio params lack input ports!), envelope/
EQ/waveform visual editors (they exist as components), tempo sync, MIDI in. **Honest
limit:** browser audio is single-threaded — *don't promise studio-grade polyphony*
(`01` §A Max, SHARED/WORSE). **Success:** a playable, audio-reactive instrument
patch. **Load-bearing need:** modulatable audio params + visual sound editors.

## 7. The hardware / IoT maker (Maker→Builder)

**Wants:** wire sensors/microcontrollers/lights to visuals — serial, MQTT, OSC,
DMX/Art-Net, MIDI. **Friction (evidenced):** vvvv leads on driverless Art-Net/DMX
(LATCH trails in-browser); Node-RED is the loved baseline (open, Pi-friendly).
**Needs:** **register-once connection protocols** with a clear connection picker
(`defineProtocol`); **DMX/Art-Net** (the named missing protocol — audit §E, needs
Electron/`@clasp-to`); MQTT/OSC/serial that recover from device changes; the desktop
build for raw serial/UDP the browser can't do. **Success:** a sensor drives a light/
visual end-to-end in minutes. **Load-bearing need:** easy, capability-scoped
connectivity + DMX/Art-Net. (See `02` §"Reconsider" #2 — connection access must be
user-approved/capability-scoped for safety.)

## 8. The designer / prototyper (Explorer→Maker)

**Wants:** interactive prototypes, motion, quick iteration; output legible to
non-technical stakeholders. **Friction (evidenced):** ProtoPie paywalls **local
save**; Origami is Mac-only/single-vendor; QC died. **Needs:** free + local files;
fast setup + delight (Origami's bar); shareable/embeddable output; readable graphs
to show clients. **Success:** a clickable interactive demo embedded in a webpage.
**Load-bearing need:** free local-first + one-click embed.

## 9. The ML / AI tinkerer (Maker→Builder)

**Wants:** in-browser vision/LLM/embeddings without cloud keys or GPUs-as-a-service.
**Friction (evidenced):** Lens Studio's 10MB model jail; cloud lock-in; ComfyUI's
model-path + version-collision hell (`02` §7). **Needs:** **register-once models**
(`defineModel`) with auto loading/progress/**error** outputs (audit §E — AI nodes
have no error output today!); model selection auto-populated from the registry;
models that **version-resolve and lazy-load** (don't collide or bloat); persistent
caching. **Success:** runs object detection / a local LLM on their own machine,
offline, no key. **Load-bearing need:** painless local ML + honest load/error
surfacing.

## 10. The tool developer / extender (Extender)

**Wants:** add a node / protocol / model / custom UI without "running around editing
this and that." **Friction (evidenced, the whole of `02`):** authoring ceremony
across many files; no hot reload; declarative-UI ceilings; breaking API churn;
no sandboxing → real malware; opaque import failures; no scaffolding CLI. **Needs:**
**one co-located `defineNode` folder + glob discovery**; `defineNodeState` so
cleanup can't be forgotten; declarative `ui` **with a first-class code escape
hatch and a visible boundary**; **stable, versioned, deprecation-not-removal API**;
real **HMR**; a **scaffolding CLI**; **isolated node testing**; **inline "which
folder failed and why."** **Success:** writes, hot-reloads, tests, and ships a
working custom node in one sitting — and it still loads after the next LATCH update.
**Load-bearing need:** one-unit authoring + a stable contract + safety. (Design:
EXTENSIBILITY plan; warnings: `02` §"Reconsider".)

## 11. The accessibility-dependent user (any skill)

**Wants:** to build/operate graphs via keyboard and/or screen reader; not be blocked
by color-only cues or drag-only wiring. **Friction (evidenced):** the entire
industry fails here — no ARIA for node/edge graphs; n8n "impossible for those who
depend exclusively on keyboard"; Node-RED can't delete a wire on touch without
deleting the node; Figma only added canvas keyboard nav in 2024 (`03` §addressable
#2). **Needs:** keyboard-operable wiring (WCAG 2.5.7 / 2.1.1), non-color port-type
cues (shape/icon/label, WCAG 1.4.1), ARIA names for nodes/edges, focus management in
modals (audit flagged modal a11y). **Success:** completes a full edit with no
mouse, narrated correctly. **Load-bearing need:** keyboard + non-color + ARIA — *an
undefended differentiator.* (LATCH today: **gaps** — canvas controls have ~no
keyboard/ARIA, per audit §B.)

## 12. The team / collaborator (Builder→Extender)

**Wants:** share work, review changes, version-control in git, eventually co-edit.
**Friction (evidenced):** *every* incumbent's binary/opaque format breaks git diff/
merge (`01` §F#1); n8n exports churn on IDs/timestamps; no realtime co-edit (last-
save-wins). **Needs:** **diff-friendly JSON** (stable IDs, deterministic key order,
**layout separated from logic**); a **visual semantic diff**; later, **multiplayer**
(Figma's LWW-per-property + fractional-indexing, on `@clasp-to`). **Success:** a
two-person edit reviews cleanly in a PR; eventually, two cursors on one graph.
**Load-bearing need:** git-native format now, multiplayer later.

---

## Cross-cutting journeys (walkthroughs)

**J1 — First session (Explorer):** land → template already running → tweak a control
→ swap a node via type-to-search → see live preview → save to a local file →
share/embed. *Must not require: signup, install, docs, or hitting a blank canvas.*

**J2 — First custom node (Extender):** `latch new-node my-thing` → edit one folder
(`definition` + `executor` + optional `ui`) → it hot-reloads in the running app →
inline error if it fails to load → `npm test` runs the node in isolation → it
appears in the palette with a preview. *Must not require: editing the engine, a
central registry, a restart, or reverse-engineering another node.*

**J3 — Ship an installation (Installation artist):** build → enable kiosk (fullscreen
+ autostart + restart-on-crash) → deploy to a mini-PC/web kiosk → it autosaves
atomically and replays deterministically for months. *Must not require: a
third-party watchdog or hand-editing a corrupted file after a power cut.*

**J4 — Perform live (VJ):** set global BPM (or tap-tempo) → MIDI-learn faders to
exposed controls → enter perform/fullscreen mode → cue/crossfade visuals for 90
minutes, crash-free. *Must not require: restarting after a device change or losing
the patch.*

**J5 — Collaborate (Team):** edit on a branch → `git diff` shows a clean semantic
change (no positional noise) → review in a PR → (future) co-edit live with comments.
*Must not require: a binary blob no one can review, or last-save-wins overwrites.*

---

## Where LATCH stands per persona (honest snapshot)

| Persona | Structurally strong today | Biggest current gap |
|---|---|---|
| Beginner | web, free, live preview; **template-picker onboarding (empty-state) ✅** | **true first-run drops into the demo flow; no in-app help/shortcuts/tour** |
| Student/Educator | free, cross-OS, durable (if format kept open); **per-node Info on all 241 nodes** | example library; export polish; surface the Info content |
| VJ | audio-reactive nodes, web | **no transport/BPM, no MIDI-learn, no perform mode** |
| Installation | web kiosk potential | **long-uptime hardening, kiosk/restart, determinism** |
| Creative coder | code/Monaco, shaders | code↔node ergonomics, shader hot-uniforms |
| Musician | Tone.js, visual editors | **audio params lack modulation inputs** |
| Hardware/IoT | connectivity breadth, desktop | **DMX/Art-Net; capability-scoped safety** |
| Designer | free, local, embed | embed polish, motion templates |
| ML tinkerer | in-browser ML stack; AI lifecycle output ports on the transformer nodes (loading/progress/done/error, ~8/23 nodes); model manager (sizes/licenses) | **uneven port coverage** (llm exposes only `done`; mediapipe/detection mostly `loading`; tts/retrieve/memory none); model-download UX; runtime model registry |
| Extender | moving to one-folder authoring | **declarative-UI ceiling, API stability, CLI, testing** |
| A11y user | **keyboard wiring engine (rove/select/move/wire), `role=application` + aria-live, non-color port cues — BUILT** | **undiscoverable (no shortcuts surface), some sub-AA contrast, mobile reachability** |
| Team | JSON graphs | **diff-friendly format (positions separated), multiplayer** |

The gaps column *is* the prioritized work — carried into `05`.

> **2026-07-13 update (verified against the running product + code):** three rows the earlier snapshot listed as
> wide-open have shipped and are now *discoverability/polish* problems, not *absence*: **onboarding templates**
> (empty-canvas picker) and the **keyboard/ARIA accessibility engine** (`useCanvasKeyboard.ts`, `role=application`,
> `getSemanticLabel`) — don't under-claim these. **AI lifecycle ports** also shipped but coverage is *uneven* (~8/23
> nodes expose all four; several expose only `loading` or `done`) — surface it honestly, don't over-claim uniform
> coverage. See `docs/UX_EXPERIENCE_AUDIT_2026-07-13.md`.
