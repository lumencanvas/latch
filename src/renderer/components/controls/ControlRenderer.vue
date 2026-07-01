<script setup lang="ts">
import type { ControlDefinition } from '@/stores/nodes'
import {
  useControlSelectOptions,
  isDeviceOptions,
  clampControlNumber,
  type DeviceOption,
} from '@/composables/useControlHelpers'

const props = defineProps<{
  control: ControlDefinition
  modelValue: unknown
  context?: string
}>()

const emit = defineEmits<{
  update: [value: unknown]
}>()

// Select-option resolution (device enumeration + static options).
const { getSelectOptions } = useControlSelectOptions()

/**
 * Clamp a number control to its declared min/max — on blur only. We bind
 * :min/:max for spinner + validation affordances but deliberately do NOT clamp
 * per keystroke (that breaks typing intermediate values, e.g. "1" before "10").
 * Controls without a min/max stay unbounded.
 */
function clampNumberControl(control: ControlDefinition, raw: string) {
  const fallback = (props.modelValue as number) ?? (control.default as number) ?? 0
  emit('update', clampControlNumber(raw, { min: control.props?.min, max: control.props?.max, fallback }))
}
</script>

<template>
  <!-- Slider -->
  <div
    v-if="control.type === 'slider'"
    class="control-slider"
  >
    <input
      type="range"
      :value="(modelValue as number) ?? 0"
      :min="(control.props?.min as number) ?? 0"
      :max="(control.props?.max as number) ?? 1"
      :step="(control.props?.step as number) ?? 0.01"
      @input="emit('update', parseFloat(($event.target as HTMLInputElement).value))"
      @mousedown.stop
    >
    <span class="slider-value">{{ ((modelValue as number) ?? 0).toFixed(2) }}</span>
  </div>

  <!-- Toggle -->
  <label
    v-else-if="control.type === 'toggle'"
    class="control-toggle"
    @mousedown.stop
  >
    <input
      type="checkbox"
      :checked="modelValue as boolean"
      @change="emit('update', ($event.target as HTMLInputElement).checked)"
    >
    <span class="toggle-track">
      <span class="toggle-thumb" />
    </span>
    <span class="toggle-label">{{ modelValue ? 'ON' : 'OFF' }}</span>
  </label>

  <!-- Select -->
  <select
    v-else-if="control.type === 'select'"
    class="control-select"
    :value="modelValue"
    @change="emit('update', ($event.target as HTMLSelectElement).value)"
    @mousedown.stop
  >
    <template v-if="isDeviceOptions(getSelectOptions(control))">
      <option
        v-for="option in getSelectOptions(control) as DeviceOption[]"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </template>
    <template v-else>
      <option
        v-for="option in getSelectOptions(control) as string[]"
        :key="option"
        :value="option"
      >
        {{ option }}
      </option>
    </template>
  </select>

  <!-- Number -->
  <input
    v-else-if="control.type === 'number'"
    type="number"
    class="control-number"
    :value="(modelValue as number) ?? 0"
    :min="control.props?.min as number"
    :max="control.props?.max as number"
    :step="(control.props?.step as number) ?? 1"
    @input="emit('update', parseFloat(($event.target as HTMLInputElement).value) || 0)"
    @blur="clampNumberControl(control, ($event.target as HTMLInputElement).value)"
    @mousedown.stop
  >

  <!-- Text -->
  <input
    v-else-if="control.type === 'text'"
    type="text"
    class="control-text"
    :value="(modelValue as string) ?? ''"
    :placeholder="(control.props?.placeholder as string) ?? ''"
    @input="emit('update', ($event.target as HTMLInputElement).value)"
    @mousedown.stop
  >

  <!-- Color -->
  <div
    v-else-if="control.type === 'color'"
    class="control-color"
    @mousedown.stop
  >
    <input
      type="color"
      :value="(modelValue as string) ?? '#808080'"
      @input="emit('update', ($event.target as HTMLInputElement).value)"
    >
    <span class="color-value">{{ modelValue }}</span>
  </div>
</template>

<style scoped>
.control-slider {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.control-slider input[type="range"] {
  flex: 1;
  height: 3px;
  -webkit-appearance: none;
  background: var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
}

.control-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--color-primary-400);
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  min-width: 32px;
  font-size: 9px;
  color: var(--color-neutral-600);
  text-align: right;
}

.control-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
}

.control-toggle input {
  display: none;
}

.toggle-track {
  position: relative;
  width: 24px;
  height: 12px;
  background: var(--color-neutral-200);
  border-radius: 6px;
  transition: background var(--transition-fast);
}

.control-toggle input:checked + .toggle-track {
  background: var(--color-primary-400);
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.control-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(12px);
}

.toggle-label {
  font-size: 9px;
  color: var(--color-neutral-500);
  font-weight: var(--font-weight-medium);
}

.control-select {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
  cursor: pointer;
}

.control-select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-number {
  width: 60px;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.control-number:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-text {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.control-text:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-color {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.control-color input[type="color"] {
  width: 24px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
  -webkit-appearance: none;
}

.control-color input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 1px;
}

.control-color input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 1px;
}

.color-value {
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}
</style>
