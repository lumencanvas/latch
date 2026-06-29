import { describe, it, expect } from 'vitest'
import { PUBLIC_EXPORT_CONTRACT } from '../../contracts/public-exports'

/**
 * Must-not-break export-list gate (POLICIES_2026-06-28 §1).
 *
 * Asserts every named export in the checked-in contract
 * (`tests/contracts/public-exports.ts`) still resolves from its module. The
 * de-monolith split of `executors/index.ts` could silently drop a re-export
 * from the barrel; this gate turns that into a red test.
 *
 * Import thunks are static `import()` literals (not `import(variable)`) so Vite
 * resolves the `@/...` aliases at analysis time.
 */

// The `@/engine/executors` barrel pulls in Tone.js + three on first import,
// which can exceed the default 5s timeout; the cost is paid once (module cache).
const IMPORT_TIMEOUT = 30_000
const LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  '@/engine/executors': () => import('@/engine/executors'),
  '@/engine/executors/emulation': () => import('@/engine/executors/emulation'),
  '@/engine/executors/clasp': () => import('@/engine/executors/clasp'),
  '@/engine/executors/easing': () => import('@/engine/executors/easing'),
  '@/engine/executors/noise': () => import('@/engine/executors/noise'),
  '@/engine/executors/euclidean': () => import('@/engine/executors/euclidean'),
  '@/engine/executors/color-ramp': () => import('@/engine/executors/color-ramp'),
  '@/engine/executors/spring': () => import('@/engine/executors/spring'),
  '@/engine/executors/signal': () => import('@/engine/executors/signal'),
  '@/engine/executors/gamepad': () => import('@/engine/executors/gamepad'),
  '@/registry/components': () => import('@/registry/components'),
}

describe('public-export contract (POLICIES §1)', () => {
  it('covers every contract module with a loader', () => {
    // Guards against adding a module to the fixture without wiring its import.
    const fixtureModules = PUBLIC_EXPORT_CONTRACT.map((c) => c.module).sort()
    const loaderModules = Object.keys(LOADERS).sort()
    expect(loaderModules).toEqual(fixtureModules)
  })

  for (const { module, exports } of PUBLIC_EXPORT_CONTRACT) {
    describe(module, () => {
      it.each(exports)(
        'exports "%s"',
        async (name) => {
          const mod = await LOADERS[module]()
          expect(mod, `${module} failed to load`).toBeDefined()
          expect(
            name in mod && mod[name] !== undefined,
            `Public export "${name}" no longer resolves from "${module}". ` +
              `If this removal is intentional, update tests/contracts/public-exports.ts.`,
          ).toBe(true)
        },
        IMPORT_TIMEOUT,
      )
    })
  }

  it('builtinExecutors is a non-empty record of functions', async () => {
    const mod = await LOADERS['@/engine/executors']()
    const registry = mod.builtinExecutors as Record<string, unknown>
    expect(registry && typeof registry === 'object').toBe(true)
    const entries = Object.entries(registry)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(([, fn]) => typeof fn === 'function')).toBe(true)
  }, IMPORT_TIMEOUT)
})
