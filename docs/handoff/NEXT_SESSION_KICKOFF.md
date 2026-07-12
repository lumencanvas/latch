# Next-session kickoff — continue Phase-6 per-node co-location (the confirmed main thread)

Copy everything in the block below as your first message to a fresh Claude Code session to continue LATCH
with full context.
(Last updated 2026-07-12 — branch `phase0-file-format`, everything **committed** through `91cf4d1`.
Tree CLEAN & green. Verify with `git log --oneline -8`.)

---

ultrathink You're continuing **LATCH** — a free/open (MIT), web+desktop, node-based creative-coding tool ("Live
Art Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; **241 nodes**) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. Phases 0–4 are largely done; **Phase 6
(per-node co-location) is the active main thread** — the maintainer's confirmed "whole reason for the plan":
every node becomes a self-contained `registry/<cat>/<node>/node.ts`. **73 of 241 nodes are co-located; ~168
remain.** Everything is committed through `91cf4d1`; `main` untouched.

Baseline (verify with a quick run): `npm run typecheck` clean · `npm run lint` 0 err (49 pre-existing `any`-warns
ok) · `npm run test:unit` **2062 pass + 11 todo** (144 files) · `npm run build` ok · browser smoke 0 real console
errors · live node count **241**.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, EVER** (commits/PRs/tags read as Moheeb Zara's).
   **Commit/push only when explicitly asked.** Stay on `phase0-file-format`. Each step ends green.
   **Never assume — read the real code / diff against the actual git original.** Honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **(later 79 → 71)**, newest first. later-79 = the commit map + remaining-tail
   summary; later-71 = the Phase-6 merge path + the per-node migration recipe; later-73/75/77/78 = the batches
   done so far (image-fx modulation+co-location, math, string, data) and their gotchas.
3. `docs/plans/ROADMAP_2026-06-28.md` — canonical phase order; the Phase-6 note has the progress + tail map.
4. **Recall memories**: **latch-colocation-phase6** (the migration recipe + variants + the full tail map — READ
   THIS FIRST), latch-smoke-test-harness, latch-strategy, audit-against-true-original, latch-component-test-gotchas.

## WHERE WE ARE — Phase 6 co-location (73/241 done)
Done: 4 math (later-71) + 8 image-fx + atan2/min/max + 13 pure math + 6 logic + 12 string + 27 data. The
`nodeRegistry` glob (`registry/**/node.ts`) unions co-located defs/executors into `allNodes` + `builtinExecutors`
(deduped, **colocated-wins**). **The migration recipe (per node):** create `registry/<cat>/<node>/node.ts` =
`export default defineNode({definition, executor, pure?})` (def + executor moved INLINE verbatim); delete the
legacy `<name>.ts` + its barrel refs (export/import/array) + its executor body + the `id: xExecutor` map entry.
Node count must stay **241**.

**Proven variants:** (a) *clean-inline* — trivial self-contained executor moved inline; (b) *shared-executor* —
heavy/service-backed executor stays in `engine/executors/<cat>.ts`, `node.ts` IMPORTS the exported const, only the
map entry is stripped (image-fx pattern); (c) *test-coupled* — a unit test importing the executor is repointed to
the node.ts default (`import xNode from '@/registry/.../node'; const xExecutor = xNode.executor`); (d)
*shared-helper* — a helper used by 2+ nodes moves to a shared `registry/<cat>/helpers.ts`; (e) *fully-migrated
category* — barrel → `export const <cat>Nodes = []`, delete `engine/executors/<cat>.ts` + its map import/spread.
Migrate a pure fn NOT already in `PURE_NODE_TYPES` **without** `pure:true` (behavior-preserving).

**Remaining tail (later-77 classification, ~168 nodes):**
- **clean-inline one-offs (~10):** visual `color`, math `random`, code `template`, logic `match-value`, inputs
  `constant`/`slider`/`xy-pad`, timing `lfo`/`time` (⚠ lfo/time executors live in `input.ts`, not `timing.ts`),
  data `json-parse`/`json-stringify` (⚠ executors in `connectivity.ts`). Cross-file execs = gotchas, still clean.
- **shared-executor sweep (~68):** 3d (16), opencv (9), clasp (10), most ai/audio, visual-remaining (12). All call
  service singletons (three renderer / audio manager / cv). Use the import-variant. **Highest-yield next batch.**
- **stateful `defineNodeState` (~57): NOT yet proven** — the biggest un-de-risked chunk. The state store must move
  too, some are pinned in `tests/contracts/public-exports.ts` (fixture update), + gc lifecycle. Prove on ONE first
  (e.g. `smooth`/`gate`/`counter`) before batching.
- **component (~18):** bespoke `component:` SFCs (ai-vision, debug, inputs). `counter`/`sample-hold` live in two
  categories — resolve to one folder.

## HOW TO WORK
- **Byte-faithful is the safety net.** After creating node.ts files, diff each def + executor against its git
  original: `diff <(git show HEAD:<legacy> | sed -n '/^  id:/,/^}/p') <(sed -n '/^  id:/,/^}/p' <new>)` and the
  executor via awk-extract. For big batches, generate node.ts with a scratchpad `.mjs` (id→executor from the
  category map = source of truth) then diff-verify all — this caught zero drift across math/string/data.
- **Each step ends green:** `npm run typecheck` + `npm run lint` + `npm run test:unit` + `npm run build`. For any
  runtime/registry change, **browser-smoke:** `npm run dev`, then Playwright + system Chrome (channel:'chrome',
  headless; write the `.mjs` in scratchpad, `import pw from '<repo>/node_modules/playwright/index.js'`), reach the
  nodes store via `document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('nodes')`,
  assert `definitions.size===241` + the migrated ids present, filter benign XNNPACK/TensorFlow/WebGL/AudioContext
  noise → 0 real errors. (Vue Flow keeps its own node state, so store-mutation smokes don't render on canvas —
  registry-level checks are the reliable signal.)
- **Gates that guard co-location:** `nodeRegistry.test.ts` (dup-id, exactly-once-in-allNodes), `pure-node-types.test.ts`
  (PURE_NODE_TYPES == the 27-id witness; adding a pure node ⇒ update BOTH), `public-exports.ts`, `registry-integrity.ts`.
- Commit ONLY when asked; author Moheeb Zara; **no AI attribution**; keep commits individually-revertible where the
  file boundaries allow (co-location increments share `executors/index.ts`, so they commit together).
- Update `docs/HANDOFF.md` + the ROADMAP progress note + this kickoff at close.

## RECOMMENDED NEXT — pick with me
The **shared-executor sweep** (3d 16 / opencv 9) is the highest-yield low-risk next batch (import-variant, proven).
Alternatively, **de-risk the stateful `defineNodeState` path** on one node — it's the biggest un-proven bucket and
unblocks ~57 nodes. Confirm which with me before diving; then work per category, byte-faithful + gates green each.
