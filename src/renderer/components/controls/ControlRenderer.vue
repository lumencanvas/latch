<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
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
 * Context seam: `canvas` (on-node, default) vs `panel` (Properties panel). It drives the
 * per-context styling (via the ctx-* class on each widget root) plus two behavioral forks —
 * the panel omits the @mousedown.stop drag guard and the toggle's ON/OFF caption. Any
 * unrecognised context falls back to canvas behavior.
 */
const ctxClass = computed(() => `ctx-${props.context ?? 'canvas'}`)
const showToggleLabel = computed(() => props.context !== 'panel')

/**
 * On-canvas controls stop mousedown from reaching Vue Flow's node-drag handler. The panel
 * host isn't a draggable node, so it opts out — byte-faithful to PropertiesPanel's original
 * markup, which carried no such guard.
 */
function onControlMousedown(e: MouseEvent) {
  if (props.context !== 'panel') e.stopPropagation()
}

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

/**
 * Drag-to-scrub on the number input (Phase 3 bullet 3). A HORIZONTAL drag past a small threshold scrubs
 * the value; a plain click still focuses + edits normally (the hot-path invariant, shared by ~566
 * controls). Safe-by-design: mousedown NEVER preventDefaults (that would kill focus/caret) — we only
 * preventDefault once the threshold proves scrub intent. Value maps ABSOLUTELY from the mousedown value +
 * total dx, snapped to step and clamped only against DECLARED (finite) min/max (both are optional here).
 */
const SCRUB_THRESHOLD = 4 // px of horizontal travel before a drag counts as a scrub, not a click
const isScrubbing = ref(false)
let scrubArmed = false
let scrubStartX = 0
let scrubStartValue = 0
let scrubControl: ControlDefinition | null = null

function guardedStep(c: ControlDefinition): number {
  const s = c.props?.step as number
  return Number.isFinite(s) && s > 0 ? s : 1
}

function scrubUnitsPerPx(c: ControlDefinition): number {
  const min = c.props?.min, max = c.props?.max
  // bounded: whole range over ~200px; unbounded (the common case): one step per 4px.
  if (typeof min === 'number' && typeof max === 'number' && max > min) return (max - min) / 200
  return guardedStep(c) / 4
}

function snapClamp(c: ControlDefinition, v: number): number {
  const step = guardedStep(c)
  let nv = Math.round(v / step) * step
  const decimals = (String(step).split('.')[1] || '').length
  nv = Number(nv.toFixed(decimals)) // kill float dust so scrub matches typed values
  const min = c.props?.min, max = c.props?.max
  if (typeof min === 'number') nv = Math.max(min, nv) // clamp ONLY against finite bounds (min/max optional)
  if (typeof max === 'number') nv = Math.min(max, nv)
  return nv
}

function endScrub() {
  scrubArmed = false
  isScrubbing.value = false
  scrubControl = null
  window.removeEventListener('mousemove', onScrubMove)
  window.removeEventListener('mouseup', endScrub)
}

function onScrubMove(e: MouseEvent) {
  if (!scrubArmed || !scrubControl) return
  const dx = e.clientX - scrubStartX
  if (!isScrubbing.value) {
    if (Math.abs(dx) < SCRUB_THRESHOLD) return // still could be a click — don't scrub, don't preventDefault
    isScrubbing.value = true
  }
  e.preventDefault() // now suppress text selection while dragging
  const fine = e.shiftKey ? 0.25 : 1 // Shift = finer control
  emit('update', snapClamp(scrubControl, scrubStartValue + dx * scrubUnitsPerPx(scrubControl) * fine))
}

function onNumberMousedown(e: MouseEvent, control: ControlDefinition) {
  onControlMousedown(e) // preserve the canvas node-drag guard
  if (scrubArmed) return // ignore a second button while armed
  scrubArmed = true
  scrubStartX = e.clientX
  scrubStartValue = (props.modelValue as number) ?? (control.default as number) ?? 0
  scrubControl = control
  // NOTE: no preventDefault here — a plain click must still focus the input + place the caret.
  window.addEventListener('mousemove', onScrubMove)
  window.addEventListener('mouseup', endScrub)
}

onUnmounted(() => {
  if (scrubArmed) endScrub() // no leaked window listeners if unmounted mid-scrub
})
</script>

<template>
  <!-- Slider -->
  <div
    v-if="control.type === 'slider'"
    class="control-slider"
    :class="ctxClass"
  >
    <input
      type="range"
      :aria-label="control.label"
      :value="(modelValue as number) ?? 0"
      :min="(control.props?.min as number) ?? 0"
      :max="(control.props?.max as number) ?? 1"
      :step="(control.props?.step as number) ?? 0.01"
      @input="emit('update', parseFloat(($event.target as HTMLInputElement).value))"
      @mousedown="onControlMousedown"
    >
    <span class="slider-value">{{ ((modelValue as number) ?? 0).toFixed(2) }}</span>
  </div>

  <!-- Toggle -->
  <label
    v-else-if="control.type === 'toggle'"
    class="control-toggle"
    :class="ctxClass"
    @mousedown="onControlMousedown"
  >
    <input
      type="checkbox"
      :aria-label="control.label"
      :checked="modelValue as boolean"
      @change="emit('update', ($event.target as HTMLInputElement).checked)"
    >
    <span class="toggle-track">
      <span class="toggle-thumb" />
    </span>
    <span
      v-if="showToggleLabel"
      class="toggle-label"
    >{{ modelValue ? 'ON' : 'OFF' }}</span>
  </label>

  <!-- Select -->
  <select
    v-else-if="control.type === 'select'"
    class="control-select"
    :class="ctxClass"
    :aria-label="control.label"
    :value="modelValue"
    @change="emit('update', ($event.target as HTMLSelectElement).value)"
    @mousedown="onControlMousedown"
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
    :class="[ctxClass, { scrubbing: isScrubbing }]"
    :aria-label="control.label"
    :value="(modelValue as number) ?? 0"
    :min="control.props?.min as number"
    :max="control.props?.max as number"
    :step="(control.props?.step as number) ?? 1"
    @input="emit('update', parseFloat(($event.target as HTMLInputElement).value) || 0)"
    @blur="clampNumberControl(control, ($event.target as HTMLInputElement).value)"
    @mousedown="onNumberMousedown($event, control)"
  >

  <!-- Text -->
  <input
    v-else-if="control.type === 'text'"
    type="text"
    class="control-text"
    :class="ctxClass"
    :aria-label="control.label"
    :value="(modelValue as string) ?? ''"
    :placeholder="(control.props?.placeholder as string) ?? ''"
    @input="emit('update', ($event.target as HTMLInputElement).value)"
    @mousedown="onControlMousedown"
  >

  <!-- Color -->
  <div
    v-else-if="control.type === 'color'"
    class="control-color"
    :class="ctxClass"
    @mousedown="onControlMousedown"
  >
    <input
      type="color"
      :aria-label="control.label"
      :value="(modelValue as string) ?? '#808080'"
      @input="emit('update', ($event.target as HTMLInputElement).value)"
    >
    <span class="color-value">{{ modelValue }}</span>
  </div>
</template>

<style scoped>
/* ─── Canvas context (on-node; compact) ─── */
.control-slider.ctx-canvas {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.control-slider.ctx-canvas input[type="range"] {
  flex: 1;
  height: 3px;
  -webkit-appearance: none;
  background: var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
}

.control-slider.ctx-canvas input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--color-primary-400);
  border-radius: 50%;
  cursor: pointer;
}

.control-slider.ctx-canvas .slider-value {
  min-width: 32px;
  font-size: 9px;
  color: var(--color-neutral-600);
  text-align: right;
}

.control-toggle.ctx-canvas {
  position: relative; /* contain the absolutely-positioned (visually hidden) checkbox */
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
}

/* Visually hidden but still focusable + operable by keyboard (NOT display:none, which drops it from the
   tab order). The faux switch (.toggle-track) is driven by the real checkbox's :checked state. */
.control-toggle.ctx-canvas input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}

.control-toggle.ctx-canvas .toggle-track {
  position: relative;
  width: 24px;
  height: 12px;
  background: var(--color-neutral-200);
  border-radius: 6px;
  transition: background var(--transition-fast);
}

.control-toggle.ctx-canvas input:checked + .toggle-track {
  background: var(--color-primary-400);
}

.control-toggle.ctx-canvas .toggle-thumb {
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

.control-toggle.ctx-canvas input:checked + .toggle-track .toggle-thumb {
  transform: translateX(12px);
}

.control-toggle.ctx-canvas .toggle-label {
  font-size: 9px;
  color: var(--color-neutral-500);
  font-weight: var(--font-weight-medium);
}

.control-select.ctx-canvas {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
  cursor: pointer;
}

.control-select.ctx-canvas:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-number.ctx-canvas {
  width: 60px;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.control-number.ctx-canvas:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

/* Drag-to-scrub affordance: horizontal-resize cursor when hovering an unfocused field (so it still
   reads as editable once focused); lock out text selection while actively scrubbing. Scoped to
   .control-number so no other widget shifts. */
.control-number:hover:not(:focus) {
  cursor: ew-resize;
}

.control-number.scrubbing {
  cursor: ew-resize;
  user-select: none;
}

.control-text.ctx-canvas {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.control-text.ctx-canvas:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-color.ctx-canvas {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.control-color.ctx-canvas input[type="color"] {
  width: 24px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
  -webkit-appearance: none;
}

.control-color.ctx-canvas input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 1px;
}

.control-color.ctx-canvas input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 1px;
}

.control-color.ctx-canvas .color-value {
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

/* ─── Panel context (Properties panel; roomier) — lifted byte-faithful from PropertiesPanel ─── */
.control-slider.ctx-panel {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-slider.ctx-panel input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: var(--color-neutral-200);
  border-radius: 2px;
}

.control-slider.ctx-panel input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--color-primary-400);
  border-radius: 50%;
  cursor: pointer;
}

.control-slider.ctx-panel .slider-value {
  min-width: 40px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  text-align: right;
}

.control-toggle.ctx-panel {
  position: relative; /* contain the absolutely-positioned (visually hidden) checkbox */
  display: flex;
  align-items: center;
  cursor: pointer;
}

.control-toggle.ctx-panel input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}

.control-toggle.ctx-panel .toggle-track {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-neutral-200);
  border-radius: 10px;
  transition: background var(--transition-fast);
}

.control-toggle.ctx-panel input:checked + .toggle-track {
  background: var(--color-primary-400);
}

.control-toggle.ctx-panel .toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.control-toggle.ctx-panel input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
}

.control-select.ctx-panel {
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  cursor: pointer;
}

.control-select.ctx-panel:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

/* Number + text share PropertiesPanel's original .control-input styling. */
.control-number.ctx-panel,
.control-text.ctx-panel {
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
}

.control-number.ctx-panel:focus,
.control-text.ctx-panel:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

.control-color.ctx-panel {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-color.ctx-panel input[type="color"] {
  width: 36px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
  -webkit-appearance: none;
}

.control-color.ctx-panel input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.control-color.ctx-panel input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}

.control-color.ctx-panel .color-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

/* Keyboard focus rings (WCAG 2.4.7). The per-control `:focus { outline: none }` rules above clear the
   ring for MOUSE focus (keeping just the border tint); these same-specificity `:focus-visible` rules come
   later in source order so they win for KEYBOARD focus, restoring a visible ring. The toggle's ring sits
   on the faux switch since the real checkbox is visually hidden. */
.control-select.ctx-canvas:focus-visible,
.control-number.ctx-canvas:focus-visible,
.control-text.ctx-canvas:focus-visible,
.control-select.ctx-panel:focus-visible,
.control-number.ctx-panel:focus-visible,
.control-text.ctx-panel:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: 1px;
}

.control-toggle input:focus-visible + .toggle-track {
  outline: 2px solid var(--color-primary-400);
  outline-offset: 2px;
}
</style>
