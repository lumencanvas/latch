# LATCH Documentation Index

A map of the `docs/` tree — what's **current and governing** vs. **historical/dated reference**.
Most dated files are kept in place because they're cross-referenced from the running log and each
other; this index tells you which to actually read.

> Naming note: the product is **LATCH**. "CLASP" is only the first-party realtime-connectivity
> protocol/service (`@clasp-to/core`), surfaced as the `clasp` node category — not the app.

---

## Start here

| Doc | What it's for |
|-----|---------------|
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) | How the engine, registry, stores, and services fit together (v2.0). |
| [architecture/NODE_SPEC.md](architecture/NODE_SPEC.md) | The `defineNode` contract, ports/controls/`ui` schema, executor + lifecycle (v2.0). |
| [nodes/contributing.md](nodes/contributing.md) | **Author a node** — the practical guide (60-second quickstart, nodesets, drop-in categories, testing). |
| [nodes/README.md](nodes/README.md) | The node **reference catalog** (every built-in node, by category). |
| [HANDOFF.md](HANDOFF.md) | The running session log, newest first — the source of continuity. |

## Node authoring & reference

- [nodes/contributing.md](nodes/contributing.md) — the authoring guide.
- [nodes/README.md](nodes/README.md) — the catalog; per-category files (`nodes/math.md`, `nodes/audio.md`, …).
- Behavior is **co-located**: each node is `registry/<cat>/<id>/node.ts` (Workstream B moved executor
  bodies inline for 3d/audio/visual/ai/connectivity; `clasp` is the documented store-coupled exception).

## Governing specs & plans (current)

- [plans/ROADMAP_2026-06-28.md](plans/ROADMAP_2026-06-28.md) — the canonical roadmap.
- [plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md](plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md) — the extensibility design + risk register.
- [plans/POLICIES_2026-06-28.md](plans/POLICIES_2026-06-28.md) — the frozen-contract / versioning policies.
- [plans/FILE_FORMAT_SPEC_2026-06-28.md](plans/FILE_FORMAT_SPEC_2026-06-28.md) — the `.latch` file format.
- [plans/SECURITY_MODEL_2026-06-28.md](plans/SECURITY_MODEL_2026-06-28.md) + [SECURITY_MODEL_IMPL_2026-07-01.md](plans/SECURITY_MODEL_IMPL_2026-07-01.md) — the custom-node trust model.
- [plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md](plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md) — the `ui` schema / NodeView design.
- [plans/MODEL_REGISTRY_IMPL_2026-06-30.md](plans/MODEL_REGISTRY_IMPL_2026-06-30.md) · [CONNECTION_HANDLE_IMPL_2026-06-29.md](plans/CONNECTION_HANDLE_IMPL_2026-06-29.md) — the model/connection subsystems.
- [plans/BLE_DEVICE_MANAGER_2026-07-13.md](plans/BLE_DEVICE_MANAGER_2026-07-13.md) — **design (in progress)**: BLE device-recognition manager + Muse 2 / thermal-printer device nodes (Threads B/C; B1 green-lit).
- [plans/BELLOWSJS_EVALUATION_2026-07-13.md](plans/BELLOWSJS_EVALUATION_2026-07-13.md) — **design (in progress)**: first-party bellowsjs integration (add alongside Tone.js, layered/flexible surface; Thread D).
- [plans/SUBFLOW_REBUILD_SPEC_2026-06-28.md](plans/SUBFLOW_REBUILD_SPEC_2026-06-28.md) — the subflow runtime rebuild (subflows' authoring UI exists; runtime is being rebuilt).
- [plans/MODERNIZATION_PLAN_2026.md](plans/MODERNIZATION_PLAN_2026.md) — the phased modernization effort.
- [NODE_LIBRARY_REVIEW_2026-06-18.md](NODE_LIBRARY_REVIEW_2026-06-18.md) — the active node backlog.

## Strategy & positioning

- [strategy/README.md](strategy/README.md) — index; `00`–`06` cover repo orientation, competitor landscape,
  developer experience, visual-programming limits, personas, differentiation/roadmap, and an adversarial
  self-audit. Positioning is **open / durable / accessible** — not performance (see `05`/`06`).

## Handoff

- [HANDOFF.md](HANDOFF.md) — the running log.
- [handoff/NEXT_SESSION_KICKOFF.md](handoff/NEXT_SESSION_KICKOFF.md) — current session kickoff.

## Historical & dated reference

Kept in place (cross-referenced from HANDOFF / other docs), but **dated snapshots** — read for provenance,
not current truth:

- Audits: `AUDIT_2026-06-14/16/19/28.md`, `A11Y_APP_AUDIT_2026-07-03.md`, `VISUAL_SYSTEM_AUDIT.md`,
  `MODERNIZATION_ASSESSMENT_2026-06.md`.
- Older plans under `plans/`: `MASTER_PLAN.md`, `PHASE_0_FOUNDATION.md`, `UI_REDESIGN_PLAN.md`,
  `UX_ANALYSIS.md`, `NODE_CONSOLIDATION_PLAN.md`, `POLISH_*_PLAN.md`, `EDITOR_COMPONENTIZATION_PLAN.md`,
  `AI_WEB_WORKERS_PLAN.md`, `OPENCV_WORKER_MIGRATION_2026-06-26.md`, `VISION_NODES_PLAN_2026-06-22.md`,
  `POLISH_AND_ARCHITECTURE_PLAN_2026-06-28.md`.
- [archive/](archive/) — superseded docs with no inbound references (`CLASP_HANDOFF.md`,
  `connection-manager-plan.md`).
