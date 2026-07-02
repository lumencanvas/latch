/**
 * Shared control-rendering helpers (Phase 3, step 1 — de-duplication ahead of a unified
 * `<ControlRenderer>`). `BaseNode.vue` and `PropertiesPanel.vue` each carried byte-identical
 * copies of the select-option resolver + the number clamp; this is the single source.
 *
 * The pieces are split by purity: `isDeviceOptions` + `clampControlNumber` are pure
 * functions; `useControlSelectOptions` is a composable because option resolution reads the
 * live device enumeration. Each caller keeps its own thin wrapper (value source + write path
 * differ per component), so behavior is preserved exactly.
 */

import { useDeviceEnumeration, type DeviceType, type DeviceOption } from './useDeviceEnumeration'
import type { WhenSchema } from '@/stores/nodes'

export type { DeviceOption, DeviceType }

/** Whether `cond` is a non-null object carrying operator key `k` (e.g. `{ in }`, `{ gt }`). */
function hasOp<K extends string>(cond: unknown, k: K): cond is Record<K, unknown> {
  return typeof cond === 'object' && cond !== null && k in cond
}

/**
 * Evaluate the unified conditional-visibility schema (Phase 3). Returns true when EVERY key matches
 * the corresponding value in `values` (AND). A bare condition tests strict equality; the operator
 * objects add `{ in }` (membership), `{ ne }` (inequality), and `{ gt }`/`{ lt }` (numeric ordering,
 * false for non-numbers). An absent/undefined schema is always visible. Pure — the single source of
 * truth the three legacy schemas (`visibleWhen`/`showWhen`/`showIf`) each map onto at their call site.
 */
export function evaluateWhen(when: WhenSchema | undefined, values: Record<string, unknown>): boolean {
  if (!when) return true
  for (const [key, cond] of Object.entries(when)) {
    const actual = values[key]
    if (hasOp(cond, 'in') && Array.isArray(cond.in)) {
      if (!cond.in.includes(actual)) return false
    } else if (hasOp(cond, 'ne')) {
      if (actual === cond.ne) return false
    } else if (hasOp(cond, 'gt')) {
      if (!(typeof actual === 'number' && actual > (cond.gt as number))) return false
    } else if (hasOp(cond, 'lt')) {
      if (!(typeof actual === 'number' && actual < (cond.lt as number))) return false
    } else if (actual !== cond) {
      return false
    }
  }
  return true
}

/** Options are device options (objects with value/label) rather than a plain `string[]`. */
export function isDeviceOptions(options: DeviceOption[] | string[]): options is DeviceOption[] {
  return options.length > 0 && typeof options[0] === 'object' && 'value' in options[0]
}

/**
 * Parse + clamp a number-control input. `fallback` is used when the raw value isn't finite
 * (the caller supplies it from its own current value / default). Pure — returns the value;
 * the caller commits it however it persists.
 */
export function clampControlNumber(
  raw: string,
  opts: { min?: unknown; max?: unknown; fallback: number }
): number {
  let value = parseFloat(raw)
  if (!Number.isFinite(value)) value = opts.fallback
  if (typeof opts.min === 'number' && value < opts.min) value = opts.min
  if (typeof opts.max === 'number' && value > opts.max) value = opts.max
  return value
}

/**
 * Resolve a select control's options, supporting dynamic device enumeration
 * (`props.deviceType`) with a fallback to the static `props.options`. A composable because
 * it reads the reactive device lists.
 */
export function useControlSelectOptions() {
  const { audioInputDevices, audioOutputDevices, videoInputDevices } = useDeviceEnumeration()

  function getSelectOptions(control: { props?: Record<string, unknown> }): DeviceOption[] | string[] {
    const deviceType = control.props?.deviceType as DeviceType | undefined
    if (deviceType) {
      switch (deviceType) {
        case 'audio-input':
          return audioInputDevices.value
        case 'audio-output':
          return audioOutputDevices.value
        case 'video-input':
          return videoInputDevices.value
      }
    }
    return (control.props?.options as string[] | DeviceOption[]) ?? []
  }

  return { getSelectOptions, isDeviceOptions }
}
