# Differentiation & North Star

What would make LATCH the better alternative — synthesized from the research
(`01`–`03`) and personas (`04`), prioritized, and mapped to the existing plans.
Every "LATCH should" traces to a sourced pain or an explicit hypothesis (flagged).

---

## The positioning statement (what LATCH owns)

> **LATCH is the open, durable, accessible node studio: it runs everywhere, your
> work is plain local files you'll be able to open in ten years, and the tool —
> format and all — outlives any single company or browser vendor.** Power for
> coders, approachability for everyone, and you own everything.

This is chosen because it maps 1:1 to the wounds creators *actually* suffered (QC,
Flash, Spark deletions; `01` §D) and to LATCH's structural facts (free, open,
web+desktop, local-file). It is **not** a performance claim — LATCH ties or loses on
raw GPU/DSP (`01` §F#16). The narrative is **access + openness + durability +
collaboration**, never "faster than TouchDesigner."

---

## The four tiers (how to think about every feature)

- **DEFENSIBLE wins** — the pain is the competitor's *business model or platform
  choice*, not the problem domain. LATCH wins by *existing as it is*. Protect these.
- **PLAUSIBLE wins** — winnable with good execution; competitors under-invest.
- **TABLE STAKES** — must match or users bounce; don't market against them.
- **DON'T OVERCLAIM** — LATCH shares or loses; be honest, mitigate, move on.

### DEFENSIBLE (LATCH's moat)
1. **Free & genuinely open-source** (no tiers, resolution caps, renewals, dongles,
   playback licenses, or "fair-code" euphemisms). Negates the #2 cross-tool pain and
   n8n's trust failure. *Keep the license honestly open and say so.*
2. **Runs everywhere — web + desktop, any OS.** Max/vvvv/Notch can't; TD has no web/
   Linux/mobile. The single biggest structural edge (`01` §F#4).
3. **Local-first, open, durable file format.** Your work is plain files you host and
   can open forever. Negates the discontinuation trauma (`01` §D) — *LATCH's
   strongest narrative.* **Conditional on us actually shipping it that way.**
4. **No-toolchain JS/TS custom nodes.** No C++/.NET build, no codesigning of
   extension binaries, runs in the web sandbox (no `fs`/`exec`). A real security +
   DX edge over Python/native ecosystems (`02`).
5. **In-browser ML + first-party realtime connectivity** (Transformers/ONNX/
   MediaPipe + `@clasp-to`). Cables/QC/Vuo don't have this; cloud tools jail models.

### PLAUSIBLE (win with execution — the bulk of the roadmap)
6. **Diff-friendly, git-native graphs** (stable IDs, deterministic key order, **layout
   separated from logic**) + a **visual semantic diff**. Negates the #1 cross-tool
   pain (`01` §F#1). *Requires deliberate serialization — protect it.*
7. **The accessible node editor** (keyboard wiring, non-color port cues, ARIA for
   nodes/edges). Undefended by every incumbent (`03` addressable #2).
8. **On-wire debugging** (freeze-the-frame, per-port value history/preview,
   error-to-exact-node deep-linking). Most tools "print everywhere" (`01` §F#8–9).
9. **Crash-safe + unattended** (atomic autosave, recoverable JSON, **first-class
   kiosk/restart-forever**, deterministic/headless replay). Named unmet need
   (Isadora kiosk; `01` §F#6–7).
10. **Live performance layer** (global BPM/transport, MIDI/OSC **learn**, perform/
    fullscreen mode). VJ table-stakes that node tools lack (`04` persona 3).
11. **Best-in-class onboarding** (templates on empty canvas, drag-to-empty
    compatible-node suggestions, in-context cues, beginner mode) (`03` #4).
12. **Touch that actually works** (pointer-event multi-touch, large hit areas,
    explicit connect-mode). Broken everywhere (`01` §F#12) — *partly inherent
    (`03` #4); win on view/tweak/perform, be realistic on from-scratch authoring.*
13. **Easiest extensibility** (`defineNode` one-folder + glob + HMR + scaffolding
    CLI + isolated testing + stable versioned API). The whole of `02`.
14. **Multiplayer co-editing** (Figma's LWW-per-property + fractional indexing on
    `@clasp-to`). Leapfrogs every desktop incumbent — *most expensive; defer but
    architect for it now (IDs/format).*

### TABLE STAKES (match, don't regret later)
- Global node **search** (TD F3 is real). Live **per-node preview** (TD's
  superpower — the highest bar). **Embed with no server** + **nodes documented with
  live examples** (Cables). **Reusable component libraries** with clean propagation
  (avoid Houdini's "reset to inherit"). **Encapsulation/subgraphs** that scale
  (LATCH's are currently broken — `SUBFLOW_REBUILD_SPEC`). **Tempo/clock sync**
  (Resolume + Ableton Link). **Battle-tested stability** for installs.

### DON'T OVERCLAIM (honest limits)
- Raw real-time **GPU/frame-budget** performance (browser has less headroom).
- **GC stutter** (V8 is GC'd — LATCH's own dispose-path bug class).
- **Single-threaded DSP** / studio polyphony.
- **Deep hardware interop** (DMX/Art-Net/raw serial) — vvvv leads; LATCH needs
  Electron + `@clasp-to`.
- **Touch-first from-scratch authoring** — partly inherent.
- **"Scales to huge graphs"** — the density ceiling is real (`03` #1).

---

## Prioritized opportunities → mapped to plans

Ranked by **(breadth of pain) × (cleanliness of win) × (cost)**. "Plan" links the
existing implementation docs.

> **"Plan home" = canonical ROADMAP phase** (`docs/plans/ROADMAP_2026-06-28.md`).
> Earlier drafts pointed at "POLISH §G"/"new" — those are superseded by the phases
> below.

| # | Opportunity | Tier | Plan home | Notes |
|---|-------------|------|-----------|-------|
| 1 | **Diff-friendly, layout-separated file format + node-data versioning/migration** | DEFENSIBLE→PLAUSIBLE | ROADMAP Phase 0 (FILE_FORMAT_SPEC + EXTENSIBILITY §10) | The strategic centerpiece; also unblocks #14. Do early — *before* any schema-changing refactor. |
| 2 | **Keep the format/license open + export + self-host** (the durability promise) | DEFENSIBLE | (policy) | A commitment, not code: documented format, guaranteed export, real OSS license. |
| 3 | **Extensibility: `defineNode`/glob/`defineNodeState`/HMR + CLI + testing + stable API** | PLAUSIBLE | EXTENSIBILITY (all) | Hardened by `02` warnings (escape hatch, version-as-contract). |
| 4 | **Per-node error surfacing + on-wire value inspection** | PLAUSIBLE | ROADMAP Phase 0 (badge) + Phase 4 (on-wire) | AUDIT already flags AI error outputs + per-node error badge; extend to wires. |
| 5 | **Onboarding: templates + drag-to-empty suggestions + snippets-with-previews** | PLAUSIBLE | POLISH Stream 3 | Snippets-tab work already planned; add empty-canvas templates. |
| 6 | **Accessibility: keyboard wiring + non-color port cues + ARIA** | PLAUSIBLE | POLISH §B (extend) | Undefended differentiator; fold into the control-system/canvas work. |
| 7 | **Crash-safe atomic autosave + recoverable JSON + kiosk/restart mode** | PLAUSIBLE | ROADMAP Phase 8 | Installation persona's load-bearing need. |
| 8 | **Live layer: global transport/BPM + MIDI/OSC learn + perform/fullscreen** | PLAUSIBLE | ROADMAP Phase 8 | VJ persona; AUDIT noted no transport/learn/perform today. |
| 9 | **Connectivity: `defineProtocol` + capability-scoped access + DMX/Art-Net** | DEFENSIBLE+PLAUSIBLE | EXTENSIBILITY §7 | Security-hardened per `02` #2; DMX via Electron/@clasp-to. |
| 10 | **AI: `defineModel` + auto loading/progress/error + version-resolve + lazy** | PLAUSIBLE | EXTENSIBILITY §8 | Fixes AUDIT §E generically; hardened per `02` #3. |
| 11 | **Canvas: toolbar + marquee + gestures + reroute/grouping/minimap/search** | TABLE STAKES | POLISH Stream 2 | Org-at-scale table stakes. |
| 12 | **Subflows that actually work** (reuse, true references, async, no state collision) | TABLE STAKES | SUBFLOW_REBUILD | The #1 *scaling* need; currently inert. |
| 13 | **Declarative `ui` schema with first-class code escape hatch** | PLAUSIBLE | EXTENSIBILITY §9 | Boundary must be *visible up front* (`02` #1). |
| 14 | **Multiplayer co-editing + comments** | PLAUSIBLE (big bet) | ROADMAP Phase 9 | Architect format/IDs now (#1); build later. |
| 15 | **Deterministic/headless replay** (CI + months-long installs) | PLAUSIBLE | ROADMAP Phase 8 | Pairs with #7; isolate live inputs. |

---

## Sequencing (strategy ↔ existing phased plans)

1. **Foundation first:** the **durable, diff-friendly, versioned file format** (#1/#2)
   — it's load-bearing for trust, collaboration, *and* the safety of every later
   refactor. Land with the EXTENSIBILITY Phase-A versioning work.
2. **Extensibility + observability** (#3, #4, #10) — the EXTENSIBILITY plan's Phases
   A–C, which also ship the leak-class fix and AI error outputs.
3. **Onboarding + canvas + accessibility** (#5, #6, #11) — POLISH Streams 2–3,
   extended for a11y and templates.
4. **Installation + live + subflows** (#7, #8, #12) — the persona-critical capability
   tiers; subflow rebuild gates on the modular engine.
5. **Big bets** (#14 multiplayer, #15 determinism) — architected-for now, built when
   the foundation is proven.

## The one-paragraph "why LATCH wins"

Every incumbent forces a trade the research shows creators resent: pay forever or be
capped (TD/Notch/Resolume/Isadora/Vuo), live on one OS (vvvv/Notch/QC/Origami), trust
a vendor not to delete your work (Spark/QC/Flash), or accept a node graph that's a
binary blob no one can review (all of them). **LATCH refuses all four at once** — free
and open, everywhere, your files, diffable — and adds what they under-deliver:
accessibility, on-wire debugging, in-browser ML, and one-folder extensibility. It
will not beat TouchDesigner on raw GPU throughput, and shouldn't try. It wins on
**access, ownership, openness, and developer joy** — the axes the incumbents
structurally can't move on.
