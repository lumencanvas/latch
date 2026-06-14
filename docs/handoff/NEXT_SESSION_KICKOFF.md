# Next-Session Kickoff Prompt

Copy everything in the code block below as your first message to a fresh Claude
Code session to resume the LATCH modernization with full context.

---

```
You're resuming an in-progress modernization of LATCH (a Vue 3 + TypeScript +
Electron node-based creative-coding app) on the `modernization` git branch. Do
NOT start coding yet — get context and confirm the baseline first.

## Rules (mandatory, non-negotiable)
- NEVER put AI/Claude attribution in git. No "Co-Authored-By: Claude", no
  "Generated with Claude Code", no robot emoji, no Anthropic mention — in commit
  messages, PR bodies, or anywhere in history. The author stays me (Moheeb Zara).
  This is codified in CLAUDE.md and has held across all commits so far; keep it.
- NEVER assume. Back every claim by reading the actual implementation or doing
  current research (WebSearch/WebFetch). If you can't verify it, say so. Reading
  the real code has repeatedly overturned stale docs this project (e.g. test
  baselines, already-installed deps, hidden node state).
- Commit ONLY when I ask. We keep ALL phases on the single `modernization`
  branch. Nothing is pushed or merged — don't push/merge without asking.
- Work test-driven: write/extend the test, watch it fail, implement, watch it
  pass. Never let the suite drop below baseline. Keep typecheck + lint + build
  green. Update the plan doc + HANDOFF.md as you complete items.

## Get context (read these in order, then run the checks)
1. CLAUDE.md — project rules + architecture map.
2. docs/plans/MODERNIZATION_PLAN_2026.md — THE SOURCE OF TRUTH for what's done /
   next (phase checkboxes + a status board). Start here for the work list.
3. docs/MODERNIZATION_ASSESSMENT_2026-06.md — the sourced findings + rationale.
4. docs/AUDIT_2026-06-14.md — deep audit notes: latent bugs, design decisions,
   and what still needs in-browser validation.
5. HANDOFF.md — the top entry is the modernization change log (Phases 0-4).
Then run:
- `git log --oneline -20` and `git status` to see the work and tree state.
- `npm run test:unit` to confirm the baseline (~1165 passing / 11 todo).
- `npm run typecheck` (expect 0 errors).

## Current state (verify, don't trust this blindly)
- Branch `modernization`, ~15 commits, not pushed/merged. Suite ~1165 passing /
  11 todo; typecheck + lint + `npm run build:web` all clean.
- DONE: Phase 0 (engine O(1) lookup, COOP/COEP + coi-serviceworker, vite-env),
  Phase 1 (render-loop visibility pause / FPS cap / delta clamp + race fix),
  Phase 2 (golden oracle, OPT-IN dirty/change-driven mode, OPT-IN deferred
  fire-and-latch async — both DEFAULT OFF so production is unchanged), Phase 3a
  (Vue Flow alias to 1.48.2 + only-render-visible-elements), Phase 3d
  (transformers.js 3.8.1 -> 4.2.0), Phase 4 start (in-browser RAG: VectorStore
  service + Retrieve node; Embed already exists as the feature-extraction node).
- The engine's dirty/deferred modes are opt-in via `setExecutionMode('dirty')` /
  `setDeferredNodeTypes(...)`. Nothing in the app enables them yet (safe).

## 3 things that need a one-time in-browser check (I, the human, must do or confirm)
1. `npm run dev` → console logs `crossOriginIsolated=true`; AI/MediaPipe nodes
   still load (validates the COOP/COEP headers + service worker).
2. Pan a large node graph → `onlyRenderVisibleElements` renders correctly.
3. Load an AI model → transformers.js v4 actually runs (the worker uses
   `(pipeline as any)`, so v4's runtime device/dtype/messages aren't type-checked).
Before relying on any of these, remind me to validate them.

## What to do next
Read docs/plans/MODERNIZATION_PLAN_2026.md, then propose the next step and ask me
to confirm. Likely candidates: stateful "Vector Memory" node (incremental RAG
corpus, headless-testable), WebLLM streaming LLM node (marquee feature, WebGPU-
only — needs browser validation), model-catalog refresh (verify repo IDs via
network first), OPFS model caching, three.js r162->r184 (3b), or clasp 3->4 (3c).
Prefer headless-verifiable work unless I ask otherwise; flag anything that needs
my browser validation.
```
