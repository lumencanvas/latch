/**
 * Shared helpers for the string-* nodes (and the data nodes that split/join text).
 */

/**
 * Coerce any upstream value to text without throwing. String ports only coerce numbers and
 * booleans at the engine boundary; an `any` upstream can still deliver an object/array,
 * and `(v as string).toUpperCase()` then threw every frame. Objects/arrays → compact JSON.
 */
export function toStr(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  try {
    const json = JSON.stringify(v)
    if (json !== undefined) return json
  } catch {
    // cyclic / non-serializable — fall through
  }
  return String(v)
}

/**
 * A text control can't hold a literal newline/tab, so separators accept the escapes
 * `\n`, `\t`, `\r` and `\\` (a literal backslash).
 */
export function unescapeSeparator(s: string): string {
  return s.replace(/\\([ntr\\])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : '\\'))
}

/** Small per-pattern RegExp cache so regex nodes don't recompile every frame. */
const regexCache = new Map<string, RegExp>()
export function cachedRegExp(pattern: string, flags: string): RegExp {
  const key = `${flags}/${pattern}`
  let re = regexCache.get(key)
  if (!re) {
    re = new RegExp(pattern, flags) // throws on invalid — callers catch
    if (regexCache.size > 256) regexCache.clear()
    regexCache.set(key, re)
  }
  re.lastIndex = 0
  return re
}
