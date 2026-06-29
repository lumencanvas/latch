# Next-Session Kickoff Prompt

Copy everything in the code block below as your first message to a fresh Claude
Code session to resume the LATCH Phase-1 work with full context.
(Last updated 2026-06-29.)

---

```
ultrathink You're picking up Phase 1 of LATCH — a free/open web+desktop node-based
creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at
/Users/obsidian/Projects/lumencanvas/latch. Branch: phase0-file-format (54 commits in,
tree clean, all green). Get up to speed before touching code.

## STEP 1 — Read, in order
1. CLAUDE.md (project rules — authoritative; NO AI attribution in git, ever).
2. docs/HANDOFF.md — read the TOP entries (newest first). "(later 6)" is the deep-audit
   + plan-adherence checkpoint; "(later 1..5)" are the per-category migration entries.
3. docs/plans/ROADMAP_2026-06-28.md — canonical sequencing. The "Progress snapshot —
   2026-06-29" block at the top is the at-a-glance status.
4. docs/plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md §4 (defineNodeState + lifecycle)
   and docs/plans/POLICIES_2026-06-28.md §1 (the CI gate list).
5. Recall the memories: latch-smoke-test-harness, latch-nanoid-underscore-split,
   latch-component-test-gotchas.
Then run the baseline: npm run typecheck (clean) · npm run lint (0 errors; 49 pre-existing
`any` warnings are fine) · npm run test:unit (**1616 pass** + 11 todo) · npm run build (ok).

## MANDATORY RULES
- NO AI attribution anywhere in git (commits/PRs/tags) — history reads as Moheeb Zara's.
- Commit ONLY when asked. Stay on phase0-file-format. Logical, individually-revertible commits.
- NEVER assume — read the actual implementation or verify in-app before changing behavior.
- Every step ends green (typecheck + lint + test:unit), build before declaring larger work
  done. Honor strategy/05 DON'T-OVERCLAIM (no raw-perf / GC-free / scales-to-huge claims).

## WHERE WE ARE (Phase 0 DONE; Phase 1 ~70%; Phases 2–9 not started)
Phase 1 = "de-monolith executors/index.ts + kill the leak class" (convert ~23 hand-wired
gc/disposeAll state groups onto the engine's generic lifecycle loop so the leak class is
structurally impossible). Status of Phase 1's four deliverables:
1. State-group migration: **18/23 done.** Remaining 4 heavy (visual, 3d, connectivity, clasp)
   + subflow (deferred to its Phase-7 rebuild). Engine gc/disposeAll loops now hold only those.
2. Per-type leak gate: DONE — tests/unit/engine/engine-leak.test.ts (in CI, mutation-verified).
3. Exact-pure-set gate: DONE — tests/unit/engine/pure-node-types.test.ts (pins 24); full
   derive-from-pure:true is a Phase-6 co-location follow-up (0 co-located node.ts files yet).
4. De-monolith split: PARTIAL — 24 category files extracted; executors/index.ts still ~1482
   lines (input/timing/debug/math/logic/RAG/WebLLM groups + the builtinExecutors registry).

## TWO CONVERSION MODES (pick per category — this is the key judgment)
- defineNodeState (self-cleaning store, the ideal): for INDEPENDENT per-node state where each
  entry's teardown doesn't depend on others. Used for the sockets (websocket/mqtt): each
  store gets a dispose(state) callback; the rewire/.delete() paths need care (avoid
  double-fire). Eliminates intra-category leak risk too.
- defineLifecycle-wrap (behavior-identical, SAFE): keep the existing plain Map(s) +
  gcXState/disposeAllXState/reset functions UNCHANGED, just `defineLifecycle({ label, gc,
  disposeAll, onStart? })` at the bottom of the file, and delete the engine's import + gc +
  disposeAll (+ explicit onStart reset) lines. Correct for ordering-sensitive (audio's Tone
  disposal SEQUENCE), marker (opencv/ai disposedNodes Set that survives gc, clears onStart),
  or asymmetric (emulation keeps registration on stop) teardown — where a store restructure
  would risk real bugs. emulation/opencv/ai/audio all went this way. Tradeoff: leaves the
  intra-category leak risk; a later pass can refine into stores with in-app verification.
Recipe per category: convert → add to engine-leak.test.ts (a store goes in CONVERTED_STORES;
a defineLifecycle category goes in the self-registration guard list) → remove the engine
wiring → grep ALL of tests/ before deleting any gc/disposeAll fn (keep as store-backed
helpers if tests/index re-exports use them) → run the FULL test:unit (module state crosses
files) → smoke-verify.

## ▶ NEXT ACTIONS (Phase 1, prioritized)
A. **Finish the 4 heavy conversions** (visual, 3d, connectivity, clasp) via defineLifecycle-wrap,
   one per green commit, each verified with the smoke harness (run→stop, 0 real errors;
   3d/visual also screenshot the render). clasp is the biggest (1604 lines, mixed media +
   subscriptions + connections). FOLD IN the latent _-split fix when doing `visual` (and patch
   `audio`): gcAudioState/gcVisualState do key.split('_')[0], but nanoid ids contain '_' (~26%)
   so live nodes' state is wrongly GC'd on any node removal — strip only known suffixes
   (e.g. /_(meter|input|fft)$/) or switch the suffix separator to '::'. See the
   latch-nanoid-underscore-split memory.
B. **Build the must-not-break export-list gate** (POLICIES §1 — NOT yet built): a checked-in
   fixture tests/contracts/public-exports.ts asserting every documented public export still
   resolves from @/engine/executors{,/<cat>} + @/registry. Do this BEFORE/with finishing the
   de-monolith split (the split is exactly what could silently break an export).
C. **Finish the de-monolith split** of executors/index.ts (extract the remaining groups; barrels
   preserve imports; the export-list gate from (B) guards it).

## SMOKE HARNESS (you CAN drive the app — use it to verify each heavy conversion)
Playwright + system Chrome are installed. `npm run dev` serves localhost:5173. A node script with
NODE_PATH=<repo>/node_modules and chromium.launch({ channel:'chrome', headless:true }) loads the
page; the first-visit Starter Flow (19 nodes incl. audio/3d/visual) auto-runs. To exercise the
cleanup paths: click button[title="Play"], wait ~4s, click button[title="Stop"] (→ engine.stop()
→ the disposeAll lifecycle loop), then read console errors. Filter noise: headless Chrome has no
camera (Webcam/Hand/Face nodes spam NotAllowedError — pass args:['--use-fake-ui-for-media-stream',
'--use-fake-device-for-media-stream'] + permissions:['camera','microphone']) and a benign MediaPipe
`INFO`. Clean = 0 real errors through boot→run→stop. (Full recipe: latch-smoke-test-harness memory.)
A worthwhile harness upgrade: add a delete-a-node step — it would catch the _-split bug.

## KEY INVARIANTS / GOTCHAS
- defineNodeState store API = get/has/set/getOrCreate/delete/gc/disposeAll/entries/size (NO
  keys/clear/add). Compound keys → keyToNodeId (':' is safe; ids never contain ':'). '_' is NOT
  safe (the bug above). Sets → defineNodeState<true> presence store.
- Production cleanup registers via useExecutionEngine setup → registerLifecycles(collectedLifecycles())
  (live-array reference — order-independent, sees late registrations). The engine never imports
  nodeState.ts. start() runs `for (l of lifecycles) l.onStart?.()`; stop() the disposeAll loop;
  updateGraph (on node removal) the gc loop.
- Component tests: import stores before the .vue (circular markRaw crash); stub Vue Flow Handle;
  `as number | undefined` in a template trips eslint's deprecated-filter rule (use `as number`).
- CI (.github/workflows/ci.yml) = typecheck + lint + test:unit + build-web. The leak + pure gates
  run via test:unit, so they ARE enforced. (must-not-break export gate still TODO — see (B).)

Dev: npm run dev · dev:electron · build · typecheck · lint · test:unit · test:e2e (playwright,
no tests yet). Pick a NEXT ACTION, confirm with the maintainer, keep each step green, update
docs/HANDOFF.md, commit only when asked.
```
