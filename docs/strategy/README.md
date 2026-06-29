# LATCH Strategy, Research & Orientation

This folder is the **"why"** of LATCH — who it's for, where competing tools hurt
people, what would make LATCH genuinely better, and an honest audit of where it
falls short. It complements (does not replace) the existing implementation docs.

## How the docs separate concerns

| Concern | Question it answers | Where it lives |
|---------|--------------------|----------------|
| **Why / strategy / research** | Who is this for? Where do other tools fail? What should we become? | **`docs/strategy/`** (this folder) |
| **What's wrong now** | What's broken/missing in the current code? | `docs/AUDIT_2026-06-28.md` |
| **What & when (canonical order)** | The single source of truth for sequencing | `docs/plans/ROADMAP_2026-06-28.md` |
| **How we'll build it (design)** | Architecture + migration detail | `docs/plans/EXTENSIBILITY_ARCHITECTURE_…`, `POLISH_…`, `SUBFLOW_REBUILD_…` |
| **Specs the build depends on** | File format, security model, policies (CI/deprecation/governance) | `docs/plans/FILE_FORMAT_SPEC_…`, `SECURITY_MODEL_…`, `POLICIES_…` |
| **Running change log** | What changed each session | `docs/HANDOFF.md` |

Implementation plans stay in `docs/plans/` (by repo convention + to avoid breaking
cross-references); this folder links to them rather than moving them. **Sequencing
across all plan docs is owned by `ROADMAP_2026-06-28.md`** (Phases 0–9); individual
plans defer to it.

## Contents (read in this order)

0. **[Repo orientation](00-repo-orientation.md)** — how LATCH is built, by concern.
   Start here if you're new to the codebase.
1. **[Competitor landscape & pain points](01-competitor-landscape.md)** — sourced
   research into where TouchDesigner, Max, vvvv, Cables, Notch, Resolume, Quartz,
   Spark AR, etc. frustrate users; the lock-in/discontinuation lessons.
2. **[Developer experience](02-developer-experience.md)** — sourced research into
   custom-node / extension authoring pain (ComfyUI, Node-RED, n8n, Blender, Unreal,
   embeddable graph libs) and what it means for LATCH's extensibility design.
3. **[Visual-programming limits](03-visual-programming-limits.md)** — the inherent
   "boxes & wires" limitations (scaling, diffing, debugging, accessibility) — what
   LATCH must design around vs. what it can win on.
4. **[Personas & journeys](04-personas-and-journeys.md)** — every skill level and
   interest walked through both *using* and *developing for* LATCH, with friction
   points and needs.
5. **[Differentiation & north star](05-differentiation-and-roadmap.md)** — synthesis:
   what's needed, what would make LATCH stand out, prioritized, tied to the plans.
6. **[Adversarial self-audit](06-adversarial-self-audit.md)** — honest critique of
   LATCH's positioning and of the research/plans themselves; risks; overclaim check.

## Methodology & status

- Research is **web-sourced from real user sentiment** (forums, Reddit, GitHub
  issues, reviews, shutdown post-mortems), cited inline. Synthesis docs (4–6) are
  reasoned from that research + the repo audit; they label claims as *evidenced* vs
  *inferred* and call out uncertainty.
- Every research claim that drives a decision is meant to be **falsifiable** — if a
  source is thin, the doc says so. Doc 6 exists specifically to catch overclaiming.
- Status: this is living documentation. Dates are absolute. Supersede, don't delete,
  when something changes.

## Improved brief (the refined ask driving this folder)

The original request, sharpened into the scope this folder fulfills:

> Research the real, sourced pain points of people who **use** node/flow creative
> tools and people who **build custom nodes** for them, across every skill level
> (curious beginner → working pro → tool developer) and interest (VJ, installation
> artist, generative/creative coder, musician, hardware/IoT maker, educator,
> embedder). For each pain, capture the underlying *need*, whether it's *inherent*
> to visual programming or *addressable*, and whether LATCH — being **free, open,
> web+desktop, local-file, in-browser-ML** — is positioned to do better or would
> share the pain. Synthesize into (a) prioritized opportunities that would make
> LATCH the better alternative, mapped to existing plans, and (b) an adversarial
> self-audit that prevents overclaiming. Organize as a well-separated, durable
> documentation set with a clear reading path per persona. Be accurate, skeptical,
> and complete; cite sources; flag uncertainty.

Acceptance criteria: every "LATCH should do X" traces to a sourced pain or an
explicit hypothesis; no claim that LATCH "wins" on an *inherent* limit; each
persona has at least one concrete first-session and first-custom-node journey.
