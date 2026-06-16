<script setup lang="ts">
/**
 * GamepadDisplay — an interactive SVG controller. It lights up buttons/sticks from
 * `displayState` and, when interacted with, emits an updated `interactiveState`
 * (logical ControllerState). Shared by the Visual Gamepad node and the Control Panel.
 */
import { computed, ref } from 'vue'
import {
  emptyControllerState,
  type ControllerState,
  type LogicalButton,
} from '@/services/input/controllerState'

const props = defineProps<{
  displayState: ControllerState
  interactiveState: ControllerState
}>()

const emit = defineEmits<{
  (e: 'update:interactiveState', value: ControllerState): void
}>()

interface CircleBtn { id: LogicalButton; cx: number; cy: number; r: number; label: string }
interface RectBtn { id: LogicalButton; x: number; y: number; w: number; h: number; rx: number; label?: string }

const CIRCLE_BUTTONS: CircleBtn[] = [
  { id: 'y', cx: 168, cy: 46, r: 9, label: 'Y' },
  { id: 'b', cx: 185, cy: 63, r: 9, label: 'B' },
  { id: 'a', cx: 168, cy: 80, r: 9, label: 'A' },
  { id: 'x', cx: 151, cy: 63, r: 9, label: 'X' },
]

const RECT_BUTTONS: RectBtn[] = [
  // d-pad
  { id: 'up', x: 28, y: 40, w: 14, h: 17, rx: 2 },
  { id: 'down', x: 28, y: 71, w: 14, h: 17, rx: 2 },
  { id: 'left', x: 12, y: 57, w: 17, h: 14, rx: 2 },
  { id: 'right', x: 41, y: 57, w: 17, h: 14, rx: 2 },
  // shoulders
  { id: 'l1', x: 16, y: 10, w: 36, h: 12, rx: 5, label: 'L' },
  { id: 'r1', x: 148, y: 10, w: 36, h: 12, rx: 5, label: 'R' },
  // center
  { id: 'select', x: 82, y: 38, w: 14, h: 8, rx: 4 },
  { id: 'start', x: 104, y: 38, w: 14, h: 8, rx: 4 },
]

const STICKS = [
  { side: 'left' as const, axX: 'lx' as const, axY: 'ly' as const, cx: 74, cy: 96 },
  { side: 'right' as const, axX: 'rx' as const, axY: 'ry' as const, cx: 126, cy: 96 },
]
const STICK_R = 15
const KNOB_R = 9

function isActive(id: LogicalButton): boolean {
  return (props.displayState.buttons[id] ?? 0) > 0.4
}

function knobPos(axX: 'lx' | 'rx', axY: 'ly' | 'ry', cx: number, cy: number) {
  const dx = (props.displayState.axes[axX] ?? 0) * (STICK_R - KNOB_R)
  const dy = (props.displayState.axes[axY] ?? 0) * (STICK_R - KNOB_R)
  return { cx: cx + dx, cy: cy + dy }
}

function clone(): ControllerState {
  const base = props.interactiveState ?? emptyControllerState()
  return {
    connected: true,
    id: base.id,
    buttons: { ...emptyControllerState().buttons, ...base.buttons },
    axes: { ...base.axes },
  }
}

// --- button press / release ---
function press(id: LogicalButton) {
  const next = clone()
  next.buttons[id] = 1
  emit('update:interactiveState', next)
  const up = () => {
    const rel = clone()
    rel.buttons[id] = 0
    emit('update:interactiveState', rel)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

// --- stick drag ---
const dragSvg = ref<SVGSVGElement | null>(null)

function svgPoint(e: PointerEvent): { x: number; y: number } | null {
  const svg = dragSvg.value
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  // viewBox is 0 0 200 124
  const x = ((e.clientX - rect.left) / rect.width) * 200
  const y = ((e.clientY - rect.top) / rect.height) * 124
  return { x, y }
}

function startStick(
  e: PointerEvent,
  axX: 'lx' | 'rx',
  axY: 'ly' | 'ry',
  cx: number,
  cy: number,
) {
  const move = (ev: PointerEvent) => {
    const p = svgPoint(ev)
    if (!p) return
    let nx = (p.x - cx) / STICK_R
    let ny = (p.y - cy) / STICK_R
    const mag = Math.hypot(nx, ny)
    if (mag > 1) { nx /= mag; ny /= mag }
    const next = clone()
    next.axes[axX] = nx
    next.axes[axY] = ny
    emit('update:interactiveState', next)
  }
  const end = () => {
    const next = clone()
    next.axes[axX] = 0
    next.axes[axY] = 0
    emit('update:interactiveState', next)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  move(e)
}

const connected = computed(() => props.displayState.connected)
</script>

<template>
  <svg
    ref="dragSvg"
    class="gamepad-svg"
    viewBox="0 0 200 124"
    :class="{ disconnected: !connected }"
  >
    <!-- body -->
    <rect
      x="4"
      y="6"
      width="192"
      height="112"
      rx="22"
      class="pad-body"
    />

    <!-- rect buttons (dpad / shoulders / center) -->
    <g
      v-for="b in RECT_BUTTONS"
      :key="b.id"
    >
      <rect
        :x="b.x"
        :y="b.y"
        :width="b.w"
        :height="b.h"
        :rx="b.rx"
        class="btn"
        :class="{ active: isActive(b.id) }"
        @pointerdown.stop.prevent="press(b.id)"
      />
      <text
        v-if="b.label"
        :x="b.x + b.w / 2"
        :y="b.y + b.h / 2 + 3"
        class="btn-label"
      >{{ b.label }}</text>
    </g>

    <!-- circle face buttons -->
    <g
      v-for="b in CIRCLE_BUTTONS"
      :key="b.id"
    >
      <circle
        :cx="b.cx"
        :cy="b.cy"
        :r="b.r"
        class="btn"
        :class="{ active: isActive(b.id) }"
        @pointerdown.stop.prevent="press(b.id)"
      />
      <text
        :x="b.cx"
        :y="b.cy + 3"
        class="btn-label"
      >{{ b.label }}</text>
    </g>

    <!-- analog sticks -->
    <g
      v-for="s in STICKS"
      :key="s.side"
    >
      <circle
        :cx="s.cx"
        :cy="s.cy"
        :r="STICK_R"
        class="stick-well"
        @pointerdown.stop.prevent="(e) => startStick(e as PointerEvent, s.axX, s.axY, s.cx, s.cy)"
      />
      <circle
        :cx="knobPos(s.axX, s.axY, s.cx, s.cy).cx"
        :cy="knobPos(s.axX, s.axY, s.cx, s.cy).cy"
        :r="KNOB_R"
        class="stick-knob"
        :class="{ active: isActive(s.side === 'left' ? 'l3' : 'r3') }"
        @pointerdown.stop.prevent="(e) => startStick(e as PointerEvent, s.axX, s.axY, s.cx, s.cy)"
      />
    </g>
  </svg>
</template>

<style scoped>
.gamepad-svg {
  width: 100%;
  height: auto;
  display: block;
  user-select: none;
  touch-action: none;
}
.gamepad-svg.disconnected {
  opacity: 0.55;
}
.pad-body {
  fill: var(--color-neutral-100);
  stroke: var(--color-neutral-300);
  stroke-width: 1.5;
}
.btn {
  fill: var(--color-neutral-0);
  stroke: var(--color-neutral-400);
  stroke-width: 1.25;
  cursor: pointer;
  transition: fill 0.06s ease;
}
.btn.active {
  fill: var(--color-primary-500);
  stroke: var(--color-primary-600);
}
.btn-label {
  fill: var(--color-neutral-500);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  text-anchor: middle;
  pointer-events: none;
}
.stick-well {
  fill: var(--color-neutral-200);
  stroke: var(--color-neutral-300);
  stroke-width: 1.25;
  cursor: grab;
}
.stick-knob {
  fill: var(--color-neutral-0);
  stroke: var(--color-neutral-400);
  stroke-width: 1.5;
  cursor: grab;
  transition: fill 0.06s ease;
}
.stick-knob.active {
  fill: var(--color-primary-500);
  stroke: var(--color-primary-600);
}
</style>
