/**
 * Must-not-break public-export contract (POLICIES_2026-06-28 §1).
 *
 * A *checked-in fixture*, not a test. It enumerates the named exports LATCH
 * treats as a governed public contract; the accompanying gate
 * (`tests/unit/contracts/public-exports.test.ts`) asserts every name below
 * still resolves from its module. Adding or removing an entry is a deliberate,
 * reviewed change — that is the whole point.
 *
 * SCOPE — what this contract governs (and, just as importantly, what it does not):
 *  1. The `@/engine/executors` barrel surface the de-monolith split of
 *     `executors/index.ts` is responsible for keeping re-exported: `builtinExecutors`,
 *     the per-node state stores + debug/RAG/LLM executors the moved groups own, and
 *     the cleanup utilities re-exported "for external use".
 *  2. Every name PRODUCTION (`src/`) code imports by name from a per-category path
 *     (`@/engine/executors/<cat>`) — e.g. the preview components' palette/noise/easing
 *     helpers, EmulatorNode's registration API, the engine's clasp cleanup. These are
 *     the true external surface: a refactor could drop one together with its consumer,
 *     or an out-of-repo consumer could rely on it, and no in-repo test would notice.
 *  3. The per-category stores the leak/gc guard tests import directly (`spring`,
 *     `signal`, `gamepad`).
 *  4. `CUSTOM_NODE_TYPE_IDS`, the custom-node id list the flows store depends on.
 *
 * Deliberately NOT mirrored here:
 *  - Individual arithmetic / logic / timing executors that only flow through
 *    `builtinExecutors`. Their "still reachable" contract is owned by the
 *    registry-count-equality gate; their by-name barrel imports (math/timing tests)
 *    are self-guarding — the owning test fails if the split drops a re-export.
 *  - Test-only deep imports into stable per-category files (messaging/http/mqtt/…
 *    internals). Those are self-guarding via their owning unit test; centralizing
 *    them here would make this fixture a brittle mirror of the suite for no added
 *    governance value.
 *
 * NOTE (POLICIES path deviation): POLICIES §1 writes the id-list module as
 * `@/registry`, but `CUSTOM_NODE_TYPE_IDS` actually lives at — and is consumed
 * from — `@/registry/components` (the `@/registry` barrel does not re-export it).
 * This fixture pins the path real consumers use.
 */

export interface ExportContract {
  /** Module specifier exactly as a public consumer imports it. */
  module: string
  /** Named exports that MUST resolve (be defined) from `module`. */
  exports: string[]
}

export const PUBLIC_EXPORT_CONTRACT: ExportContract[] = [
  {
    module: '@/engine/executors',
    exports: [
      // Runtime executor registry (consumed by the execution engine).
      'builtinExecutors',

      // Cleanup utilities re-exported "for external use".
      'disposeClaspNode',
      'disposeAllClaspConnections',
      'getClaspConnectionStatus',
      'disposeMqttNode',
      'disposeAllMqttNodes',
      'gcMqttState',
      'disposeWebSocketNode',
      'disposeAllWebSocketNodes',
      'gcWebSocketState',
      'disposeHttpNode',
      'disposeAllHttpNodes',
      'gcHttpState',
      'gcEmulationState',
      'disposeAllEmulationNodes',

      // Per-node state stores the de-monolith split moves out of index.ts (the
      // leak-class surface; imported by the engine-leak / executor-gc gates and
      // dispose tests). The barrel must keep re-exporting them across the split.
      'triggerPrevPressed',
      'smoothState',
      'gateLastValue',
      'startFiredNodes',
      'intervalState',
      'delayState',
      'timerState',
      'metronomeState',
      'stepSequencerState',
      'consolePrevValues',
      'monitorLastValue',
      'scopeAnalyzers',
      'eqAnalyzers',
      'vectorMemoryStores',
      'llmTriggerPrev',
      'llmPrevStatus',

      // Debug / RAG / LLM executors + helpers imported by name in the unit suite
      // (so the de-monolith split must keep them resolvable from the barrel).
      'consoleExecutor',
      'monitorExecutor',
      'smoothExecutor',
      'gateExecutor',
      'startExecutor',
      'oscilloscopeExecutor',
      'equalizerExecutor',
      'retrieveExecutor',
      'llmExecutor',
      'vectorMemoryExecutor',
      'disposeAnalyzer',
    ],
  },

  // ── Per-category paths consumed by PRODUCTION (`src/`) code ──────────────────
  {
    // EmulatorNode.vue drives the emulator through these.
    module: '@/engine/executors/emulation',
    exports: ['registerEmulatorNode', 'unregisterEmulator', 'getEmulatorLoader'],
  },
  {
    // ExecutionEngine.ts calls these for clasp teardown / gc.
    module: '@/engine/executors/clasp',
    exports: ['disposeAllClaspConnections', 'gcClaspState'],
  },
  {
    // EasingPreview.vue renders curves from this table.
    module: '@/engine/executors/easing',
    exports: ['EASINGS'],
  },
  {
    // NoisePreview.vue samples this.
    module: '@/engine/executors/noise',
    exports: ['fbmNoise'],
  },
  {
    // EuclideanPreview.vue renders the rhythm from this.
    module: '@/engine/executors/euclidean',
    exports: ['bjorklund'],
  },
  {
    // ColorRampPreview.vue renders palettes/stops from these.
    module: '@/engine/executors/color-ramp',
    exports: ['PALETTES', 'sampleStops'],
  },

  // ── Per-category stores imported directly by the leak/gc guard tests ─────────
  {
    module: '@/engine/executors/spring',
    exports: ['springState'],
  },
  {
    module: '@/engine/executors/signal',
    exports: ['signalState', 'tapState'],
  },
  {
    module: '@/engine/executors/gamepad',
    exports: ['gamepadState'],
  },

  // ── Custom-node id list ──────────────────────────────────────────────────────
  {
    module: '@/registry/components',
    exports: ['CUSTOM_NODE_TYPE_IDS'],
  },
]
