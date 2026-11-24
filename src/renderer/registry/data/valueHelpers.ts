/**
 * Shared value helpers for the data / logic nodes. These run EVERY frame on `any`-typed
 * values, which can be textures, audio nodes, typed arrays or cyclic objects — so nothing
 * here may throw, and deep comparison is limited to plain JSON-like data.
 */

/** True for plain arrays and `{}` / `Object.create(null)` objects (JSON-like containers). */
export function isPlainData(v: unknown): v is Record<string, unknown> | unknown[] {
  if (Array.isArray(v)) return true
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

const MAX_DEPTH = 32
const MAX_NODES = 20000

/**
 * Structural equality that never throws: SameValueZero for primitives (so NaN equals NaN and
 * 1 !== '1'), deep comparison for plain arrays/objects (key order insensitive, cycle-safe,
 * bounded), and reference equality for everything else (textures, class instances, typed
 * arrays). Replaces per-frame `JSON.stringify(a) === JSON.stringify(b)`, which threw on
 * cycles, ignored NaN/undefined, depended on key order, and serialized textures.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  // Fast path (no allocation) — the common per-frame case is primitives/references.
  if (a === b || (a !== a && b !== b)) return true
  if (!isPlainData(a) || !isPlainData(b)) return false
  let budget = MAX_NODES
  const seen = new Map<object, object>()
  const eq = (x: unknown, y: unknown, depth: number): boolean => {
    if (x === y || (x !== x && y !== y)) return true // SameValueZero (NaN === NaN)
    if (!isPlainData(x) || !isPlainData(y)) return false
    if (Array.isArray(x) !== Array.isArray(y)) return false
    if (depth > MAX_DEPTH || --budget < 0) return false
    const prev = seen.get(x as object)
    if (prev === y) return true // already being compared (cycle)
    seen.set(x as object, y as object)
    if (Array.isArray(x)) {
      const ya = y as unknown[]
      if (x.length !== ya.length) return false
      for (let i = 0; i < x.length; i++) if (!eq(x[i], ya[i], depth + 1)) return false
      return true
    }
    const xo = x as Record<string, unknown>
    const yo = y as Record<string, unknown>
    const xk = Object.keys(xo)
    if (xk.length !== Object.keys(yo).length) return false
    for (const k of xk) {
      if (!Object.prototype.hasOwnProperty.call(yo, k)) return false
      if (!eq(xo[k], yo[k], depth + 1)) return false
    }
    return true
  }
  return eq(a, b, 0)
}

/**
 * Parse a text control as JSON when it is valid JSON (`5` → 5, `true` → true, `[1]` → [1]),
 * otherwise keep the raw text. Empty text → `undefined` (unset).
 */
export function parseLooseJson(text: unknown): unknown {
  if (typeof text !== 'string') return text
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** JSON.stringify that never throws (cycles / BigInt → `undefined`). */
export function safeStringify(v: unknown, space?: number): string | undefined {
  try {
    return JSON.stringify(v, null, space)
  } catch {
    return undefined
  }
}
