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

export type { DeviceOption, DeviceType }

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
