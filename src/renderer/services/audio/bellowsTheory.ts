/**
 * Lazy, cached accessor for bellowsjs' pure THEORY / sequencing exports
 * (Scale, chord, invert, Arpeggiator, rng, …) used by the D2 generative nodes.
 *
 * Uses the SAME dynamic `import('bellowsjs')` specifier as `bellowsManager`, so it
 * resolves to the already-lazy bellows chunk — pulling theory adds ZERO weight to the
 * main bundle and no second copy of bellows. (The package only exposes the bundled `.`
 * entry — no theory subpath — and a static import would risk dragging bellows into the
 * main chunk, which the lazy split exists to avoid.)
 *
 * `getTheory()` is synchronous and non-blocking: it kicks a one-time load and returns
 * `null` until the module resolves, then the cached module. Callers pass their input
 * through unchanged for the first few frames (no audible glitch — an un-quantized note
 * is still a valid note), then use the real theory once loaded.
 */

import type { Scale } from 'bellowsjs'

type TheoryModule = typeof import('bellowsjs')

let cached: TheoryModule | null = null
let loading: Promise<void> | null = null

/** The bellows theory module once loaded, else null (load is kicked on first call). */
export function getTheory(): TheoryModule | null {
  if (cached) return cached
  if (!loading) {
    loading = import('bellowsjs')
      .then((m) => { cached = m })
      .catch(() => { loading = null }) // allow a retry on the next frame
  }
  return null
}

// Scales are cheap but not free to build; cache by root|name across all nodes so per-frame
// executors never allocate. Bounded by the (roots × curated scales) product.
const scaleCache = new Map<string, Scale>()

/**
 * A cached bellows `Scale`. Guards the name: `new Scale(root, name)` THROWS on an unknown
 * SCALES key, so an out-of-range name falls back to `major` rather than crashing the frame.
 */
export function getScale(theory: TheoryModule, root: string, name: string): Scale {
  const safeName = theory.SCALES[name] ? name : 'major'
  const key = `${root}|${safeName}`
  let scale = scaleCache.get(key)
  if (!scale) {
    scale = new theory.Scale(root, safeName)
    scaleCache.set(key, scale)
  }
  return scale
}

/** Test hook: inject (or clear) the cached module so nodes can be exercised synchronously. */
export function __setTheoryForTest(m: TheoryModule | null): void {
  cached = m
  loading = null
}
