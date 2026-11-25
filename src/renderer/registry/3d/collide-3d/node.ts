import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { readPositions } from '../instances-3d/node'

/**
 * Collide 3D: is a point (the player) touching any of a list of positions (obstacles, pickups)?
 * Sphere-vs-sphere, so it is cheap for thousands of targets. Hit fires once per new contact, with a
 * cooldown so one crash is one hit.
 */
const definition: NodeDefinition = {
  id: 'collide-3d',
  name: 'Collide 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Detects when a point (a player) touches any of a list of positions: hit trigger, contact, nearest distance',
  icon: 'crosshair',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'x', type: 'number', label: 'X' },
    { id: 'y', type: 'number', label: 'Y' },
    { id: 'z', type: 'number', label: 'Z' },
    { id: 'positions', type: 'data', label: 'Targets (Positions)' },
    { id: 'radius', type: 'number', label: 'Radius' },
  ],
  outputs: [
    { id: 'hit', type: 'trigger', label: 'Hit' },
    { id: 'touching', type: 'boolean', label: 'Touching' },
    { id: 'impact', type: 'number', label: 'Impact (1 → 0 after a hit)' },
    { id: 'hits', type: 'number', label: 'Hit Count' },
    { id: 'nearest', type: 'number', label: 'Nearest Distance' },
    { id: 'nearestIndex', type: 'number', label: 'Nearest Index' },
  ],
  controls: [
    { id: 'x', type: 'number', label: 'X', default: 0 },
    { id: 'y', type: 'number', label: 'Y', default: 0 },
    { id: 'z', type: 'number', label: 'Z', default: 0 },
    { id: 'radius', type: 'number', label: 'Player Radius', default: 0.5, props: { min: 0, max: 50, step: 0.05 } },
    { id: 'targetSize', type: 'number', label: 'Target Size', default: 0.8, props: { min: 0, max: 50, step: 0.05 }, description: 'Match the Size of the Instances 3D drawing the targets (each target’s own s scales it).' },
    { id: 'cooldown', type: 'number', label: 'Cooldown (s)', default: 0.8, props: { min: 0, max: 10, step: 0.05 } },
  ],
  info: {
    overview:
      'Tests one point against every position in Targets, as spheres: the player’s Radius plus half of each target’s size. Touching is true while overlapping; Hit fires once when a new contact starts (then waits Cooldown seconds), and Hit Count adds them up. Nearest Distance is the gap to the closest target, handy for near-miss sounds or a proximity glow.',
    tips: [
      'Wire the same Positions into Instances 3D and here, and the player’s X / Y / Z from whatever moves it.',
      'Hit → Counter Reset restarts a score; Hit → a sound trigger makes the crash.',
      'Nearest Distance → Remap → a light’s intensity gives a danger glow.',
      'Impact jumps to 1 on a hit and fades to 0 over the cooldown: wire it into an LFO amplitude for camera shake, or a light for a flash.',
    ],
    pairsWith: ['point-stream-3d', 'instances-3d', 'key-input', 'counter'],
  },
  tags: ['collision', 'collide', 'hit', 'game', 'physics', 'overlap', 'distance', '3d'],
}

interface CollideState { touching: boolean; lastHit: number; hits: number }
const collideState = defineNodeState<CollideState>({ label: 'collide-3d' })

/** Nearest target and whether the player overlaps it. Pure (tested). */
export function nearestContact(px: number, py: number, pz: number, targets: { x: number; y: number; z: number; s?: number }[], radius: number, targetSize: number) {
  let best = Infinity
  let idx = -1
  let touching = false
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const reach = radius + (targetSize * (t.s ?? 1)) / 2
    const gap = Math.hypot(t.x - px, t.y - py, t.z - pz) - reach
    if (gap < best) { best = gap; idx = i }
    if (gap <= 0) touching = true
  }
  return { gap: Math.max(0, best), idx, touching }
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const st = collideState.getOrCreate(ctx.nodeId, () => ({ touching: false, lastHit: -1e9, hits: 0 }))
  const targets = readPositions(ctx.inputs.get('positions')) ?? []
  const r = nearestContact(ctx.num('x', 0), ctx.num('y', 0), ctx.num('z', 0), targets, ctx.num('radius', 0.5), ctx.num('targetSize', 0.8))
  const now = performance.now() / 1000
  let hit = 0
  if (r.touching && !st.touching && now - st.lastHit >= ctx.num('cooldown', 0.8)) {
    hit = 1
    st.lastHit = now
    st.hits++
  }
  st.touching = r.touching
  const cd = Math.max(0.05, ctx.num('cooldown', 0.8))
  const impact = Math.max(0, 1 - (now - st.lastHit) / cd)
  return new Map<string, unknown>([
    ['hit', hit], ['touching', r.touching], ['impact', impact], ['hits', st.hits],
    ['nearest', Number.isFinite(r.gap) ? r.gap : 999], ['nearestIndex', r.idx],
  ])
}

export default defineNode({ definition, executor })
