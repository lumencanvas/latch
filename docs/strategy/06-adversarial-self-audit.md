# Adversarial Self-Audit

A deliberate attempt to break the strategy (`01`–`05`) and the implementation plans
(`docs/plans/*`). The goal is to catch overclaiming, confirmation bias, and
execution risk *before* they cost us. If a section reads as reassuring, it has
failed.

---

## 1. Overclaim check (claims that would damage credibility)

| Tempting claim | Why it's wrong / risky | Honest version |
|---|---|---|
| "Faster than TouchDesigner / runs heavy scenes" | Browser has less GPU/CPU headroom; TD/Notch run native (`01` §F#16). | "Runs everywhere; for the heaviest scenes use the desktop build — and we won't out-muscle native." |
| "No memory leaks / rock-solid for months" | V8 is GC'd; LATCH's *own* recurring bug class is unwired dispose paths (AUDIT). Long-uptime is unproven. | "We're making leak-prevention structural (`defineNodeState`) and targeting unattended uptime — *to be earned, with evidence.*" |
| "Your work survives forever (open, durable)" | **Only true if we actually ship** an open license + documented format + export + self-host. Today the format isn't guaranteed diff-friendly or documented; export validation is shallow (AUDIT §G). | "We're committing to it" — and then *doing* it. Until then it's a promise, not a feature. |
| "The accessible node editor" | Today canvas controls have ~no keyboard/ARIA (AUDIT §B). | "Accessibility is a priority and a real opportunity — currently unimplemented." |
| "Easy multiplayer / collaboration" | Not built; the hardest item; needs format/ID groundwork first. | "Architected-for; a future bet." |
| "Declarative custom UI handles everything" | n8n proves declarative UIs hit a hard ceiling (`02` #1, #3). | "Declarative for the common case, with a first-class code escape hatch and a visible boundary." |
| "Register a model/connection once — done" | That convenience is the exact n8n breach surface (`02` #2). | "Register once, with capability-scoped, user-approved access and a trust tier." |
| "Touch-first node editing solved" | Partly inherent (gesture ambiguity, precision; `03` #4). | "Best-in-class touch for view/tweak/perform; honest about from-scratch authoring." |

**Rule:** never claim a win on a DON'T-OVERCLAIM item (`05`), and never state a
PLAUSIBLE win in the present tense until it's shipped and measured.

---

## 2. Is the *strategy itself* right? (steelman the objections)

- **"Open + durable + accessible isn't a moat — incumbents can copy it."** Partly
  true. Cables is already free+open+web (the nearest rival) and could add local-
  first + ML. **Mitigation:** the moat is the *combination* (open + everywhere +
  local-file + in-browser ML + realtime + extensibility + a11y) plus execution
  velocity; no single incumbent can move on *all* axes (TD won't go web; Notch won't
  go free; n8n won't relicense cleanly). But we must not assume openness alone wins —
  **execution quality is the real moat.**
- **"Free/open is a business-model risk, not just a feature."** Real. QC died because
  Apple didn't care; Vuo struggles as a tiny vendor; "free" tools need a
  sustainability story (Cables uses client work + grants). **If LATCH has no funding/
  maintenance model, the durability promise we're selling could ironically apply to
  *us*.** This is the deepest strategic risk and is *not* a code problem. Flag it for
  the maintainer: a governance/sustainability plan is part of the "durability" pitch.
- **"Chicken-and-egg community."** vvvv's small community is a named pain; a new tool
  is worse. Extensibility + an open node ecosystem + great docs/examples are the only
  levers, and they take years. **Don't assume "build it and they'll come."**
- **"Mixed audience is a positioning trap."** Serving Explorers *and* Builders *and*
  Extenders risks a tool that's mediocre for all (the "for everyone = for no one"
  failure). **Mitigation:** progressive disclosure + beginner mode + templates, so
  depth doesn't tax the surface. But this tension is real and recurring; revisit if
  onboarding metrics and power-user retention diverge.
- **"Performance honesty may undercut the pitch to pros."** VJs/installers care about
  stability above all (`01` Resolume). If LATCH can't prove uptime, the pro segment
  won't adopt regardless of openness. **The installation/VJ personas are gated on the
  least-certain capability (long-uptime stability).** Sequence accordingly.

---

## 3. Critique of the implementation plans

The plans are strong but have real risks, several already caught by the foolproofing
pass and the dev-experience research:

- **EXTENSIBILITY (the auto-registry):** the glob matches *zero files today* (inert
  until co-location); eager glob exposure for `.vue` under happy-dom; the
  must-not-break export contract; pure-set must be exact (24, not 28); `_`-folders;
  `counter`/`sample-hold` dedup. *All have mitigations in the plan's risk register —
  but they are gates, not footnotes; CI must enforce them.*
- **Declarative-UI ceiling (highest design risk):** if the code escape hatch is
  second-class or the boundary is invisible, we repeat n8n's worst DX failure.
  **Amendment required** (below).
- **Security of register-once:** the plan's convenience is n8n's breach surface.
  **Amendment required:** capability-scoping + user approval + trust tier.
- **Versioning:** must be migration functions + stable type-IDs + missing-node
  placeholders, not pinning. **Amendment required.**
- **`defineNode` as a frozen contract:** a future v2 rewrite would strand the
  community (Rete/ComfyUI). **Amendment required:** deprecation policy from v1.
- **Big-graph perf:** Vue Flow inherits React Flow's re-render storms; selection in
  Pinia and cosmetic-edit-triggers-execution are footguns. **Amendment required.**
- **SUBFLOW rebuild:** `expandGraph` interactions with dirty-mode/`_dynamic*`/golden
  harness; opaque-id invariant; reverse map mandatory — hardened in the spec, but it
  is the largest, riskiest piece; do it behind golden tests, last.
- **Confirmation-bias risk in *this* research:** four of five research agents were
  asked partly to *validate* our design; they did find validation, but `02`'s
  "Reconsider" section is the part that matters most — weight the warnings over the
  confirmations.

---

## 4. Risk register (existential + execution)

| Risk | Severity | Type | Mitigation / owner |
|---|---|---|---|
| No sustainability/governance model → LATCH itself becomes the next "discontinued tool" | **Critical** | Strategic | Maintainer decision: funding/governance is part of the durability pitch. |
| The durability promise ships hollow (format not documented/diff-friendly/exportable) | High | Execution | Make the format spec + export validation a Phase-A deliverable (`05` #1/#2). |
| Long-uptime instability blocks the pro (VJ/installation) segment | High | Execution | Earn it with `defineNodeState` + atomic autosave + soak tests; don't market until measured. |
| Declarative-UI ceiling repeats n8n's DX failure | High | Design | First-class escape hatch + visible boundary (amendment). |
| Register-once leaks credentials (n8n-style) | High | Security | Capability-scoped, user-approved access + trust tier (amendment). |
| Auto-registry ships a zero-node app / silent drops | Med | Execution | Count-equality + default-export + dup-id guard tests from commit 1 (in plan). |
| Saved flows break on schema change | Med | Execution | Versioning/migration before any schema change (in plan). |
| Big-graph perf wall at scale | Med | Execution | CSS-driven selection, decouple cosmetic edits, profile 500+. |
| Mixed-audience positioning dilutes the product | Med | Strategic | Progressive disclosure + beginner mode; watch metrics. |
| Community/adoption never reaches critical mass | Med | Strategic | Docs/examples/extensibility; realistic expectations. |
| Research over-indexed on anecdote / snippet-only sources | Low-Med | Methodological | Honesty flags kept; re-verify before public quotation. |

---

## 5. What would falsify this strategy (how we'd know we're wrong)

- Beginners still hit a blank canvas and bounce → onboarding thesis wrong; revisit
  `03` #4 assumptions.
- Power users route around the node graph to code for *everything* → the visual layer
  isn't pulling its weight (Houdini VOP→VEX pattern at LATCH scale); rebalance toward
  code-first with visual assist.
- Teams still can't review a LATCH diff cleanly → the format wasn't actually layout-
  separated/stable; the centerpiece win evaporates.
- An installation can't run a week unattended → the pro pitch collapses regardless of
  openness.
- A custom-node author needs to touch >1 location or can't hot-reload → the
  extensibility thesis failed in practice.
- A malicious community node exfiltrates a connection → the security model failed
  (the `02` #2 warning was not heeded).

Each is a concrete, testable failure — instrument for them.

---

## 6. Plan amendments required (consolidated — apply to `docs/plans/*`)

These are the non-negotiables this research adds to the plans (also linked from the
EXTENSIBILITY doc):

1. **Durable format is a Phase-A deliverable:** documented spec, stable IDs,
   deterministic key order, **positions/colors separated from logic**, guaranteed
   export + import validation (AUDIT §G), and a forward-compat commitment.
2. **Declarative `ui` needs a first-class code/component escape hatch with the
   boundary visible *before* a dev commits** (n8n lesson).
3. **Register-once protocols/models = capability-scoped + user-approved access +
   provenance/trust tier** (n8n breach lesson). No blanket credential handoff.
4. **`defineModel` must version-resolve (not last-writer-wins) and lazy-load**
   (ComfyUI/Unreal lesson).
5. **Versioning = migration functions + stable node-type IDs + graceful missing-node
   placeholders** (degrade, never shatter).
6. **`defineNode` is a frozen public contract** — deprecation cycles, never removals,
   from v1 (Rete/ComfyUI lesson).
7. **Big-graph perf discipline:** selection/hover in CSS not Pinia; decouple cosmetic
   edits from execution; profile at 500+ nodes.
8. **Ship node testing (isolated, no upstream re-fire) + inline "which folder failed
   and why" + a scaffolding CLI + API-versioned docs.**
9. **Accessibility is in-scope, not later:** keyboard wiring (WCAG 2.5.7/2.1.1),
   non-color port cues (1.4.1), ARIA for nodes/edges, modal focus traps.
10. **Earn, don't claim, stability:** atomic autosave, recoverable JSON, kiosk/
    restart mode, and soak tests before any "runs for months" messaging.

---

## 7. Honest scorecard (today)

| Axis | LATCH today | Target | Gap size |
|---|---|---|---|
| Open / free | ✅ strong | maintain + honest license | small |
| Cross-platform | ✅ web+Electron | maintain | small |
| Durable open format | ⚠️ JSON but not spec'd/diff-optimized/validated | the centerpiece | **large** |
| Extensibility DX | ⚠️ monolithic, leak-prone | `defineNode` ecosystem | large (planned) |
| Onboarding | ⚠️ blank canvas | templates + suggestions | medium |
| Debugging/observability | ⚠️ errors hidden, no on-wire | freeze+inspect | medium |
| Accessibility | ❌ ~none | the differentiator | **large (open field)** |
| Live/VJ | ❌ no transport/learn/perform | the layer | large |
| Installation/kiosk | ❌ none + uptime unproven | first-class | large |
| Subflows/reuse | ❌ inert | true references | large (planned) |
| Performance (raw) | ⚠️ browser-bound | *don't overclaim* | n/a (accept) |
| Multiplayer | ❌ none | future bet | large (deferred) |
| Sustainability/governance | ❓ unknown | required for the pitch | **unknown — flag** |

The two largest *strategic* unknowns are **sustainability/governance** (non-code,
maintainer-owned) and **earned long-uptime stability** (gates the pro segment). The
largest *open-field opportunity* is **accessibility**. The single highest-leverage
*execution* item is the **durable, diff-friendly file format**, because trust,
collaboration, multiplayer, and refactor-safety all depend on it.
