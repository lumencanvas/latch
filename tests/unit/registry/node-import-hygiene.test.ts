import { describe, it, expect } from 'vitest'

/**
 * Cycle-safety guard for the EAGER co-location glob (deep-audit later-84, cycle-safety finding).
 *
 * `registry/nodeRegistry.ts` does `import.meta.glob('./**\/node.ts', { eager: true })`, so EVERY
 * co-located `node.ts` is evaluated at module-load. If a `node.ts` VALUE-imports (not `import type`)
 * anything that transitively reaches the node/flows stores or the registry, it closes a load-time
 * cycle — `node.ts → @/stores/flows → @/registry/components → @/registry/allNodes →
 * @/registry/nodeRegistry (mid-glob)` — and the offending executor resolves to a TDZ error at boot
 * (see the clasp lazy-import wrapper, which exists precisely to dodge this via a dynamic import).
 *
 * The safety today rests on an "import type only" convention with no enforcement. The realistic
 * footgun is an editor auto-import of an ExecutionEngine VALUE (e.g. `coerceToPortType`,
 * `PURE_NODE_TYPES`) merging into the existing `import type { ExecutionContext }` line and silently
 * dropping `type`. This test makes the convention a gate: a co-located `node.ts` may only VALUE-import
 * `@/engine/defineNode`, `@/engine/executors/*`, `vue`, and its own `./*.vue`; anything reaching the
 * stores/registry/ExecutionEngine values must be `import type`.
 */

// Raw source of every co-located node.ts (relative to this test file → src/renderer/registry).
const sources = import.meta.glob('../../../src/renderer/registry/**/node.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Source specifiers that MUST NOT be value-imported from a co-located node.ts (they pull the
// stores/registry graph into the eager glob and close the cycle).
const FORBIDDEN_VALUE_IMPORT = [
  /^@\/stores\//,
  /^@\/registry\/components$/,
  /^@\/registry\/allNodes$/,
  /^@\/registry\/nodeRegistry$/,
  /^@\/registry$/,
  /^@\/engine\/ExecutionEngine$/, // type-only is fine (ExecutionContext/NodeExecutorFn); values close the cycle
]

// Match each import statement (single- or multi-line) → capture the `type ` flag and the source.
const IMPORT_RE = /import\s+(type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/g

function valueImportViolations(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(IMPORT_RE)) {
    if (m[1]) continue // `import type ...`
    const source = m[2]
    if (FORBIDDEN_VALUE_IMPORT.some((re) => re.test(source))) out.push(source)
  }
  return out
}

describe('co-located node.ts import hygiene (eager-glob cycle safety)', () => {
  const entries = Object.entries(sources)

  it('discovers the co-located node.ts files', () => {
    expect(entries.length).toBeGreaterThan(200)
  })

  it.each(entries)('%s has no cycle-closing value imports', (path, src) => {
    const violations = valueImportViolations(src)
    expect(
      violations,
      `${path} value-imports ${violations.join(', ')} — this closes the eager-glob load-time cycle. ` +
        `Use \`import type\` (for ExecutionEngine types) or a lazy dynamic import (the clasp pattern) ` +
        `if you truly need the runtime value.`,
    ).toEqual([])
  })
})
