import type { ControlDefinition } from '@/stores/nodes'

/**
 * Control-value rules shared by the control UI (ControlRenderer's drag-to-scrub) and the
 * agent tools (`latch_set_controls`), so a value an agent sets lands exactly where the same
 * value typed or scrubbed by a person would.
 */

/** A control's step, or 1 when it has none (or a nonsense one). */
export function guardedStep(c: Pick<ControlDefinition, 'props'>): number {
  const s = c.props?.step as number
  return Number.isFinite(s) && s > 0 ? s : 1
}

/** Snap to the control's step, then clamp ONLY against declared (finite) min/max. */
export function snapClamp(c: Pick<ControlDefinition, 'props'>, v: number): number {
  const step = guardedStep(c)
  let nv = Math.round(v / step) * step
  const decimals = (String(step).split('.')[1] || '').length
  nv = Number(nv.toFixed(decimals)) // kill float dust so scrub matches typed values
  const min = c.props?.min, max = c.props?.max
  if (typeof min === 'number') nv = Math.max(min, nv)
  if (typeof max === 'number') nv = Math.min(max, nv)
  return nv
}

/** A select control's allowed values (options may be strings or `{ value, label }`). */
export function selectOptionValues(c: Pick<ControlDefinition, 'props'>): unknown[] | null {
  const opts = c.props?.options
  if (!Array.isArray(opts)) return null
  return opts.map((o) => (o && typeof o === 'object' && 'value' in o ? (o as { value: unknown }).value : o))
}

export type CoerceResult =
  | { ok: true; value: unknown; clamped?: boolean }
  | { ok: false; error: string }

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const MAX_TEXT = 10_000
const MAX_CODE = 50_000

/**
 * Coerce and validate a value for a control. Numbers are snapped and clamped (reported, not
 * refused); selects must match an option; colours must be #rrggbb. Control types that need a
 * person (device pairing) are refused.
 */
export function coerceControlValue(c: ControlDefinition, raw: unknown): CoerceResult {
  switch (c.type) {
    case 'slider':
    case 'number': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
      if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false, error: 'expected a finite number' }
      const v = snapClamp(c, n)
      return v === n ? { ok: true, value: v } : { ok: true, value: v, clamped: true }
    }
    case 'toggle': {
      if (typeof raw === 'boolean') return { ok: true, value: raw }
      if (raw === 'true' || raw === 1) return { ok: true, value: true }
      if (raw === 'false' || raw === 0) return { ok: true, value: false }
      return { ok: false, error: 'expected true or false' }
    }
    case 'select': {
      const values = selectOptionValues(c)
      // Options resolved at runtime (device lists) can't be checked here: accept strings.
      if (!values || values.length === 0) {
        return typeof raw === 'string' ? { ok: true, value: raw } : { ok: false, error: 'expected a string' }
      }
      const hit = values.find((v) => v === raw || (typeof v === 'number' && Number(raw) === v))
      if (hit === undefined) return { ok: false, error: `expected one of ${values.map((v) => JSON.stringify(v)).join(', ')}` }
      return { ok: true, value: hit }
    }
    case 'color':
      return typeof raw === 'string' && HEX_COLOR.test(raw) ? { ok: true, value: raw } : { ok: false, error: 'expected a #rrggbb colour' }
    case 'code':
      return typeof raw === 'string' && raw.length <= MAX_CODE ? { ok: true, value: raw } : { ok: false, error: `expected a string of at most ${MAX_CODE} characters` }
    case 'ble-pair':
      return { ok: false, error: 'device pairing needs the person at the computer: ask them to pair it in the node' }
    case 'text':
    case 'connection':
    case 'asset-picker':
    default:
      if (typeof raw === 'number' || typeof raw === 'boolean') raw = String(raw)
      return typeof raw === 'string' && raw.length <= MAX_TEXT ? { ok: true, value: raw } : { ok: false, error: `expected a string of at most ${MAX_TEXT} characters` }
  }
}
