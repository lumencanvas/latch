import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineLifecycle } from '@/engine/nodeState'

/**
 * Key Input: the computer keyboard as game controls. Arrow keys and WASD become X / Y axes, plus
 * Space, Shift and any one key you name. One window listener is shared by every Key Input node and
 * removed when the last one goes; everything releases when the window loses focus (so a key held
 * while switching apps never sticks).
 */
const definition: NodeDefinition = {
  id: 'key-input',
  name: 'Key Input',
  version: '1.0.0',
  category: 'inputs',
  description: 'Arrow keys / WASD as X and Y axes, plus Space, Shift and a custom key: game controls from the keyboard',
  icon: 'keyboard',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'x', type: 'number', label: 'X (← −1 … +1 →)' },
    { id: 'y', type: 'number', label: 'Y (↓ −1 … +1 ↑)' },
    { id: 'space', type: 'boolean', label: 'Space' },
    { id: 'spacePressed', type: 'trigger', label: 'Space Pressed' },
    { id: 'shift', type: 'boolean', label: 'Shift' },
    { id: 'custom', type: 'boolean', label: 'Custom Key' },
    { id: 'customPressed', type: 'trigger', label: 'Custom Key Pressed' },
    { id: 'lastKey', type: 'string', label: 'Last Key' },
    { id: 'anyPressed', type: 'trigger', label: 'Any Key Pressed' },
  ],
  controls: [
    {
      id: 'keys', type: 'select', label: 'Axis Keys', default: 'both',
      props: { options: [
        { value: 'both', label: 'Arrows and WASD' },
        { value: 'arrows', label: 'Arrows only' },
        { value: 'wasd', label: 'WASD only' },
      ] },
    },
    { id: 'customKey', type: 'text', label: 'Custom Key', default: 'e', props: { placeholder: 'e, Enter, 1…' } },
    { id: 'smoothing', type: 'slider', label: 'Axis Smoothing', default: 0, props: { min: 0, max: 0.95, step: 0.05 }, description: '0 = instant; higher eases the axes in and out like an analog stick.' },
  ],
  info: {
    overview:
      'Use the keyboard as a game controller. X is −1 with ← (or A) and +1 with → (or D); Y is +1 with ↑ (or W) and −1 with ↓ (or S). Space, Shift and one Custom Key come out as held booleans and press triggers, and Last Key names the most recent key. Keys typed into a text field are ignored, and everything releases when the window loses focus.',
    tips: [
      'Feed X through a Spring or Slew Limiter, then into a Transform 3D position, to steer an object.',
      'Space Pressed makes a good jump / fire / restart trigger.',
      'Raise Axis Smoothing for a softer, analog feel without extra nodes.',
    ],
    pairsWith: ['transform-3d', 'spring', 'slew-limiter', 'counter', 'collide-3d'],
  },
  tags: ['keyboard', 'keys', 'arrows', 'wasd', 'game', 'controls', 'input', 'space'],
}

// ── shared window listener ─────────────────────────────────────────────────
const held = new Set<string>()
/** Keys pressed since each node last ran, so a quick tap between frames is never missed. */
const pressedSince = new Map<string, Set<string>>()
let lastKey = ''
let listening = false
const users = new Set<string>()

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable)
}
const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k)

function onDown(e: KeyboardEvent) {
  if (isTyping(e.target)) return
  const k = norm(e.key)
  if (!held.has(k)) for (const s of pressedSince.values()) s.add(k)
  held.add(k)
  lastKey = e.key === ' ' ? 'Space' : e.key
}
function onUp(e: KeyboardEvent) { held.delete(norm(e.key)) }
function releaseAll() { held.clear() }

function listen() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', releaseAll)
  listening = true
}
function unlisten() {
  if (!listening) return
  window.removeEventListener('keydown', onDown)
  window.removeEventListener('keyup', onUp)
  window.removeEventListener('blur', releaseAll)
  listening = false
  held.clear()
}

const axisState = new Map<string, { x: number; y: number }>()

function drop(nodeId: string) {
  users.delete(nodeId)
  pressedSince.delete(nodeId)
  axisState.delete(nodeId)
  if (users.size === 0) unlisten()
}

defineLifecycle({
  label: 'key-input',
  gc: (valid) => { for (const id of [...users]) if (!valid.has(id)) drop(id) },
  disposeAll: () => { for (const id of [...users]) drop(id) },
})

/** Test seam: feed key events without a window. */
export const __keys = { down: (key: string) => onDown({ key, target: null } as unknown as KeyboardEvent), up: (key: string) => onUp({ key } as KeyboardEvent), blur: releaseAll }

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  if (!users.has(ctx.nodeId)) { users.add(ctx.nodeId); pressedSince.set(ctx.nodeId, new Set()); listen() }
  const mode = ctx.str('keys', 'both')
  const arrows = mode !== 'wasd'
  const wasd = mode !== 'arrows'
  const h = (k: string) => held.has(k)
  const left = (arrows && h('ArrowLeft')) || (wasd && h('a'))
  const right = (arrows && h('ArrowRight')) || (wasd && h('d'))
  const up = (arrows && h('ArrowUp')) || (wasd && h('w'))
  const down = (arrows && h('ArrowDown')) || (wasd && h('s'))
  const tx = (right ? 1 : 0) - (left ? 1 : 0)
  const ty = (up ? 1 : 0) - (down ? 1 : 0)
  const sm = Math.max(0, Math.min(0.95, ctx.num('smoothing', 0)))
  const ax = axisState.get(ctx.nodeId) ?? { x: 0, y: 0 }
  ax.x = sm > 0 ? ax.x + (tx - ax.x) * (1 - sm) : tx
  ax.y = sm > 0 ? ax.y + (ty - ax.y) * (1 - sm) : ty
  if (Math.abs(ax.x) < 1e-3) ax.x = 0
  if (Math.abs(ax.y) < 1e-3) ax.y = 0
  axisState.set(ctx.nodeId, ax)

  const custom = norm(ctx.str('customKey', 'e') || 'e')
  const pressed = pressedSince.get(ctx.nodeId)!
  const out = new Map<string, unknown>([
    ['x', ax.x], ['y', ax.y],
    ['space', h(' ')], ['spacePressed', pressed.has(' ') ? 1 : 0],
    ['shift', h('Shift')],
    ['custom', h(custom)], ['customPressed', pressed.has(custom) ? 1 : 0],
    ['lastKey', lastKey], ['anyPressed', pressed.size > 0 ? 1 : 0],
  ])
  pressed.clear()
  return out
}

export default defineNode({ definition, executor })
