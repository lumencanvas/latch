/**
 * Format a runtime port value for the on-canvas value preview (on-wire debugging).
 * Keeps it short and non-throwing for any value an executor might emit — numbers
 * are the common case, but audio/texture/data ports carry objects too.
 */
export function formatPortValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '—'

  const t = typeof value
  if (t === 'number') {
    const n = value as number
    if (!Number.isFinite(n)) return String(n) // NaN / Infinity
    if (Number.isInteger(n)) return String(n)
    return n.toFixed(3).replace(/\.?0+$/, '') // trim trailing zeros: 1.500 → 1.5
  }
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'string') {
    const s = value as string
    return s.length > 24 ? `"${s.slice(0, 23)}…"` : `"${s}"`
  }
  if (Array.isArray(value)) return `[${value.length}]`
  if (t === 'object') return '{…}'
  return String(value) // function / symbol / bigint fallback
}
