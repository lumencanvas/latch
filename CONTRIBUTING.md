# Contributing to LATCH

Thanks for your interest in contributing! LATCH (**L**ive **A**rt **T**ool for
**C**reative **H**umans) is a node-based creative-coding environment for VJs,
installation artists, hardware hackers, and IoT makers. Contributions of all
kinds are welcome — new nodes, bug fixes, docs, examples, and ideas.

## Code of conduct

Be kind and constructive. Assume good faith, keep discussion focused on the work,
and help newcomers. Harassment or hostility isn't tolerated in issues, PRs, or
discussions.

## Getting set up

**Prerequisites:** Node.js 18+ (the project is developed on Node 22) and npm.

```bash
git clone https://github.com/lumencanvas/latch.git
cd latch
npm install

npm run dev          # web dev server (Vite)
npm run dev:electron # desktop dev (electron-vite)
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Web dev server |
| `npm run dev:electron` | Desktop (Electron) dev |
| `npm run build` | Type-check + production web build |
| `npm run test:unit` | Run the unit suite once (Vitest) |
| `npm test` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests with a coverage report |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run lint` | ESLint (auto-fix) |

## Project structure

LATCH separates a node's **definition** (its ports, controls, and metadata) from
its **runtime behavior** (its executor):

- `src/renderer/registry/<category>/` — node **definitions**
- `src/renderer/engine/executors/<category>.ts` — node **runtime behavior**
- `src/renderer/engine/ExecutionEngine.ts` — graph execution (topo sort, per-frame rAF loop)
- `src/renderer/components/nodes/BaseNode.vue` — generic node UI shell
- `src/renderer/services/` — audio / visual / ai / connections / clasp services
- `src/renderer/stores/` — Pinia stores (`flows`, `runtime`, `ui`, `assets`, `connections`, `nodes`)
- `docs/` — architecture notes, node specs, and plans

## Adding a node

Node authoring has its own detailed guide:
**[docs/nodes/contributing.md](docs/nodes/contributing.md)**. In short, you add a
definition under `registry/<category>/` and matching runtime under
`engine/executors/`, then register it. A few things that are easy to miss:

- A node with a custom Vue component must be registered in
  `registry/components.ts` (both the `nodeTypes` map and `CUSTOM_NODE_TYPE_IDS`),
  or it silently falls back to `BaseNode`.
- **Executors that keep per-node state in a module-level `Map` MUST register a
  cleanup path** (a `gc*`/`dispose*` function wired into `ExecutionEngine` — see
  any existing stateful executor). Resource leaks have been a recurring bug class
  here, so this is non-negotiable.

## Coding conventions

- **Match the surrounding code** — naming, structure, comment density, and idiom.
- Prefer reading the actual implementation over assuming behavior.
- Keep TypeScript honest; avoid `any` where a real type fits.
- Run **`npm run typecheck`** and **`npm run lint`** before opening a PR.
  (Pre-existing `.vue` module-resolution warnings from `vue-tsc` are expected and
  not something you need to chase.)

## Tests

- Unit tests live in `tests/unit/` and run on Vitest + happy-dom.
- Add or update tests for any behavior you change; bug fixes should come with a
  regression test.
- `npm run test:unit` must pass before you submit.
- `npm run test:coverage` shows coverage for `src/`; new code should be covered
  where it's practical to test (pure logic, stores, executors).

## Commits & pull requests

1. Fork and create a feature branch: `git checkout -b feature/your-change`
2. Make your change, with tests.
3. Ensure `npm run typecheck`, `npm run lint`, and `npm run test:unit` pass.
4. Write a clear commit message: a concise, imperative subject line
   (e.g. `Fix connection-added event not being emitted`), and a body explaining
   *why* when the change isn't obvious.
5. Push and open a Pull Request describing the change and how you tested it. Link
   any related issue. Screenshots/GIFs are very welcome for UI changes.

Keep PRs focused — one logical change per PR is much easier to review than a
sprawling one.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
