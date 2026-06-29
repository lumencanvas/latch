# Visual-Programming Limits — Inherent vs. Addressable

The well-documented limitations of "boxes & wires" programming, separated into what
LATCH **must design around** (don't market against) and what it **can win on**.
This doc exists to keep us honest. Confidence flags inline; the strongest anchor is
peer-reviewed, the weakest is named as folklore.

---

## Inherent limits — design around, never overclaim

1. **Information-density / scalability ceiling ("spaghetti").** Graphics are less
   dense than text; large graphs overload working memory and hide dependencies.
   Anchor: **Green & Petre (1996)** measured a ~**8:1 edit-time penalty** for a
   box-and-wire dataflow language vs. text on the same task (median 508s vs 63s),
   attributed to working-memory load + hidden long-range dependencies. (The "Deutsch
   limit / 50 primitives" is rhetorical folklore — cite as a concept, not data.)
   Mitigations (subgraphs, groups, collapse, search, manual layout) soften but don't
   eliminate it; **auto-layout fights "secondary notation"** (devs arrange nodes to
   encode meaning). → *Don't claim "scales to large programs"; optimize for screen-
   sized graphs + good subgraphs.*
2. **Expression / refactor / abstraction weakness.** Math, loops/recursion,
   refactoring, and copy-paste-edit are structurally worse visually; the academic
   verdict is **"no universal superiority" (match–mismatch)**, not "visual wins."
   Every mature tool converges on *nodes for flow, drop to text for dense logic*
   (Houdini VOP→VEX, Unreal BP→C++, n8n expressions/Code node). → *Make code +
   expression fields first-class and cheap; aim for clean code↔node boundaries.*
3. **Realtime frame-budget pressure.** Per-frame cost is physics, not a UI bug. →
   *Surface per-node cook/timing; budget aggressively. (Shared with native tools —
   and the browser has less headroom, so this is SHARED/WORSE, not a win.)*
4. **Touch precision / gesture ambiguity.** Drag-to-connect collides with pan/zoom;
   the system can't tell intentional node-touch from accidental. No tool has fully
   solved touch-first authoring; research points to **pen + multi-touch**, not touch
   alone. → *Target touch for view/tweak/perform; add an explicit "connect mode" +
   pen support if from-scratch touch authoring matters.* (See `01` §F#12 — LATCH can
   still **lead** here because incumbents do touch so badly, but authoring-on-touch
   is partly inherent.)
5. **Non-determinism of live inputs.** Audio/camera/sensor streams can't be made
   reproducible. → *Isolate live sources; make everything else deterministic.*

---

## Addressable gaps — LATCH can win (ranked by leverage)

1. **Trust / longevity (open, documented, diff-friendly, human-readable format +
   self-host + export).** The cleanest, highest-credibility win; directly negates
   the Adobe-Animate/Quartz/Spark stranding (`01` §D). Digital-preservation
   consensus: open well-documented formats survive vendor death. → *Ship the format
   for survival from day one; market "your work survives this tool."*
2. **Accessibility — near-unclaimed by any incumbent.** Canvas/node editors broadly
   fail WCAG, and **there is no standardized ARIA for node/edge graphs**. Concrete,
   normative targets: **1.4.1 Use of Color** (port/wire type must not be color-only
   → add shape/icon/label), **2.5.7 Dragging Movements** (wiring/moving must have a
   single-pointer/keyboard alternative), **2.1.1 Keyboard** (all functionality
   keyboard-operable), plus ARIA names for nodes/edges. Figma only added canvas
   keyboard nav in 2024; n8n/Unreal don't support screen readers. → *Be "the
   accessible node editor" — a credible, defensible position no incumbent holds.*
3. **Version control & diffing.** A self-inflicted wound everywhere (positions/IDs/
   timestamps serialized into the semantic graph → diff churn; binary formats →
   no merge). True graph-diff is graph-edit-distance (infeasible) so naive text
   merge is semantically wrong. → *Separate positions/colors from logic, stable IDs,
   deterministic key order, and ship a built-in **visual semantic diff**. A concrete
   differentiator git-native teams will notice.*
4. **Onboarding.** The blank-canvas + discoverability problem has known answers:
   **in-context cues beat forced tutorials** (NN/g), templates/example graphs on the
   empty canvas, type-to-search + **drag-a-wire-into-empty-space → filtered list of
   compatible nodes** (Blender), plain-language tooltips, optional beginner mode. →
   *Fastest path to first-hour productivity for a mixed-skill audience.*
5. **Debugging.** Mature prior art under-invested in by most tools: **on-wire value
   inspection**, watchpoints/stepping (Max), per-node cook times (TD), the geometry
   spreadsheet (Houdini). → *Make freeze-the-frame, inspect-the-wire debugging a
   headline feature — LATCH's per-frame rAF engine is well-suited to "pause and
   inspect this frame."*
6. **Collaboration / multiplayer.** Most creative node tools are single-player/file-
   based; the solved blueprint is **Figma's** (central authority + **last-writer-
   wins per property** + **fractional indexing**; checkpoints every 30–60s, 95% of
   edits saved <600ms — they rejected OT and pure CRDTs). Aligns with LATCH's
   existing `@clasp-to/core` realtime layer. → *Achievable and would leapfrog every
   desktop incumbent — but the most expensive item; scope deliberately.*
7. **Determinism / headless execution** (the addressable half of limit #3): content-
   addressed node outputs + seeded randomness → graphs can run **identically in CI /
   for months in an installation**. → *Design the engine for deterministic replay;
   isolate live inputs.*

---

## Implications summary (one line each)

- Position node editing for **screen-sized graphs + strong subgraphs**, not "huge
  programs."
- Treat **code/expression nodes as core**, not bolt-ons.
- Make the **file format diff-friendly and survivable** — this is the strategic
  centerpiece.
- **Accessibility** is an open, defensible differentiator — claim it.
- **Onboarding + on-wire debugging** are the fastest UX wins.
- **Multiplayer** is the big bet (defer, but architect the format/IDs to allow it).
- **Don't market against** raw GPU performance, GC stutter, DSP threading, or
  touch-first from-scratch authoring.

### Sourcing caveats
Lead with Green & Petre (peer-reviewed), not the Deutsch "50" folklore. The "visual
sucks for experts" sentiment is heavily HN/blog-sourced; the defensible academic
claim is the narrower "no universal superiority / match–mismatch." WCAG criteria
and the ARIA gap are normative/authoritative; some accessibility *examples* (n8n/
Unreal) are user reports, not audits. (Sources in `00`-linked research transcripts:
Green & Petre via neverworkintheory; Cognitive Dimensions; NN/g empty states;
W3C WCAG 1.4.1/2.5.7/2.1.1 + WAI-ARIA Graphics; Figma multiplayer engineering
posts; NodeGit ACM TOG 2023; DPC/LoC preservation guidance.)
