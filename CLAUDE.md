# LATCH — Project Rules & Context for AI Agents

## Commit & attribution rules (MANDATORY)

- **NEVER add Claude / AI attribution to git commits.** Do not append
  `Co-Authored-By: Claude ...`, `Generated with Claude Code`, `🤖` trailers, or
  any similar AI-authorship line to commit messages.
- **No AI attribution anywhere in git history or PR bodies** — commit messages,
  PR descriptions, and tags must read as if authored by the human maintainer.
- Author/committer identity stays the human's (`Moheeb Zara`). Do not set or
  suggest a Claude author/committer.
- Write commit messages in the repository's existing voice: concise, imperative
  subject line, body explaining *why* when non-trivial. Match the style of
  recent commits (e.g. `Fix connection-added event not being emitted`).
- Only commit or push when explicitly asked. If on `main`, branch first.

## What LATCH is

Node-based creative flow programming environment ("Live Art Tool for Creative
Humans"). Vue 3 + TypeScript + Vite, packaged for web and desktop (Electron
Forge). 133+ nodes across 18 categories. Targets creative coders, VJs,
installation artists, hardware hackers, IoT makers.

Key libraries: Vue Flow (node editor), Pinia (state), Three.js (3D/shaders),
Tone.js + Meyda (audio), Transformers.js + ONNX Runtime + MediaPipe (in-browser
ML), Dexie (IndexedDB), `@clasp-to/core` (realtime connectivity — first-party
LumenCanvas protocol).

## Architecture map

- `src/renderer/registry/<category>/` — node **definitions** (ports, controls, metadata)
- `src/renderer/engine/executors/<category>.ts` — node **runtime behavior**
- `src/renderer/engine/ExecutionEngine.ts` — graph execution (topo sort, per-frame rAF loop)
- `src/renderer/components/nodes/BaseNode.vue` — generic node UI shell
- `src/renderer/services/` — audio / visual / ai / connections / clasp services
- `src/renderer/stores/` — `flows` (graph), `runtime` (execution), `ui`, `assets`, `connections`, `nodes`
- `docs/` — architecture, node specs, plans, handoffs. `HANDOFF.md` — running session log.

## Dev commands

```bash
npm run dev          # web dev server (Vite)
npm run dev:electron # electron-vite dev
npm run build        # vue-tsc --noEmit && vite build
npm test             # vitest (watch)
npm run test:unit    # vitest run
npm run typecheck    # vue-tsc --noEmit
npm run lint         # eslint --fix
```

## Working conventions

- Match surrounding code style. Executors keep per-node state in module-level
  Maps and MUST register a `dispose*`/`gc*` cleanup path (see existing
  executors) — resource leaks have been a recurring bug class here.
- Run `npm run typecheck` before declaring work done. Pre-existing `.vue` module
  resolution warnings are expected; don't chase them.
- Never assume — read the actual implementation or verify with research before
  changing behavior.
