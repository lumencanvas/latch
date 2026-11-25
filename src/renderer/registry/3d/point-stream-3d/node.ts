import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { nearestContact } from '../collide-3d/node'

/**
 * Point Stream 3D: a field of points that keeps flowing in one direction (toward the camera by
 * default) and respawns at the far end, as positions for Instances 3D. Asteroid fields, warp
 * stars, rain, snow, a road of obstacles. Each point that makes it past the end fires Passed,
 * which counts as "dodged" in a game.
 */
const definition: NodeDefinition = {
  id: 'point-stream-3d',
  name: 'Point Stream 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Endless stream of points flowing past the camera (asteroids, stars, rain): positions for Instances 3D',
  icon: 'sparkles',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'speed', type: 'number', label: 'Speed' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
    { id: 'paused', type: 'boolean', label: 'Paused' },
    { id: 'playerX', type: 'number', label: 'Player X' },
    { id: 'playerY', type: 'number', label: 'Player Y' },
    { id: 'playerZ', type: 'number', label: 'Player Z' },
  ],
  outputs: [
    { id: 'positions', type: 'data', label: 'Positions' },
    { id: 'passed', type: 'trigger', label: 'Passed' },
    { id: 'passedCount', type: 'number', label: 'Passed Count' },
    { id: 'currentSpeed', type: 'number', label: 'Current Speed' },
    { id: 'hit', type: 'trigger', label: 'Player Hit' },
    { id: 'impact', type: 'number', label: 'Impact (1 → 0 after a hit)' },
    { id: 'hits', type: 'number', label: 'Hit Count' },
  ],
  controls: [
    {
      id: 'direction', type: 'select', label: 'Flow', default: 'toward',
      props: { options: [
        { value: 'toward', label: 'Toward the camera (+Z)' },
        { value: 'away', label: 'Away from the camera (−Z)' },
        { value: 'down', label: 'Falling (rain, snow)' },
        { value: 'up', label: 'Rising (bubbles, embers)' },
      ] },
    },
    { id: 'count', type: 'number', label: 'Count', default: 40, props: { min: 1, max: 3000, step: 1 } },
    { id: 'speed', type: 'number', label: 'Speed (units/s)', default: 10, props: { min: 0, max: 200, step: 0.5 } },
    { id: 'accel', type: 'number', label: 'Speed Up Per Point Passed', default: 0, props: { min: 0, max: 10, step: 0.05 }, description: 'Each point that passes adds this much speed (a game getting harder); Reset goes back to Speed.' },
    { id: 'maxSpeed', type: 'number', label: 'Max Speed', default: 60, props: { min: 0, max: 400, step: 1 } },
    { id: 'spreadX', type: 'number', label: 'Spread X', default: 6, props: { min: 0, max: 200, step: 0.5 } },
    { id: 'spreadY', type: 'number', label: 'Spread Y', default: 0, props: { min: 0, max: 200, step: 0.5 } },
    { id: 'length', type: 'number', label: 'Stream Length', default: 60, props: { min: 1, max: 500, step: 1 } },
    { id: 'end', type: 'number', label: 'End (where points respawn)', default: 6, props: { min: -100, max: 100, step: 0.5 } },
    { id: 'sizeMin', type: 'number', label: 'Size Min', default: 0.6, props: { min: 0.01, max: 20, step: 0.05 } },
    { id: 'sizeMax', type: 'number', label: 'Size Max', default: 1.4, props: { min: 0.01, max: 20, step: 0.05 } },
    { id: 'seed', type: 'number', label: 'Seed', default: 7, props: { min: 0, max: 9999, step: 1 } },
    { id: 'playerRadius', type: 'number', label: 'Player Radius', default: 0.45, props: { min: 0, max: 20, step: 0.05 }, description: 'With a Player X / Y / Z wired, points touching the player count as a hit.' },
    { id: 'pointSize', type: 'number', label: 'Drawn Size', default: 1, props: { min: 0, max: 20, step: 0.05 }, description: 'The Size of the Instances 3D drawing the points, so hits match what you see.' },
    { id: 'hitCooldown', type: 'number', label: 'Hit Cooldown (s)', default: 1, props: { min: 0, max: 10, step: 0.05 } },
  ],
  info: {
    overview:
      'Keeps Count points flowing along the stream and respawns each one at the far end, at a fresh random spot across Spread X / Spread Y. Wire Positions into Instances 3D to draw them. Toward the camera, the stream runs from End − Length up to End on Z; points that reach End fire Passed. Speed can be wired, so a score can make it faster.',
    tips: [
      'Spread Y = 0 keeps everything on one lane height, which suits a dodge game on a floor.',
      'For warp-speed stars: Count 800, Spread X and Y 40, Speed 60, small sizes, Sphere shape.',
      'For rain: Flow = Falling, Spread X and Y 20, Stream Length 20, End 0 (falls to the floor).',
      'Collide 3D takes the same Positions to test a player against every point.',
      'Speed Up Per Point Passed makes a game harder as you score; wire Current Speed into other streams (floor dashes, stars) so they keep pace.',
      'For a dodge game wire the player’s position into Player X / Y / Z: Player Hit fires on contact, the point that hit is sent back, and the speed-up starts over. (A separate Collide 3D cannot reset the stream: that would loop the graph.)',
    ],
    pairsWith: ['instances-3d', 'collide-3d', 'counter', 'scene-3d'],
  },
  tags: ['particles', 'stream', 'asteroids', 'stars', 'rain', 'snow', 'obstacles', 'game', '3d', 'field'],
}

export interface StreamPoint { x: number; y: number; z: number; s: number }

interface StreamState { pts: StreamPoint[]; seed: number; rnd: () => number; last: number; passed: number; key: string; boost: number; lastHit: number; hits: number; touching: boolean }

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

const streamState = defineNodeState<StreamState>({ label: 'point-stream-3d' })

interface Cfg { dir: string; spreadX: number; spreadY: number; length: number; end: number; sMin: number; sMax: number }

/** Place a point somewhere along the stream (`along` 0 = far start, 1 = the end). */
function place(p: StreamPoint, c: Cfg, rnd: () => number, along: number) {
  const a = (rnd() * 2 - 1) * (c.spreadX / 2)
  const b = (rnd() * 2 - 1) * (c.spreadY / 2)
  const t = c.end - c.length * (1 - along) // position along the stream axis
  p.s = c.sMin + rnd() * Math.max(0, c.sMax - c.sMin)
  if (c.dir === 'down') { p.x = a; p.z = b; p.y = -t } // falls from +(length-end) down to -end
  else if (c.dir === 'up') { p.x = a; p.z = b; p.y = t }
  else if (c.dir === 'away') { p.x = a; p.y = b; p.z = -t }
  else { p.x = a; p.y = b; p.z = t }
}

/** Progress of a point along its stream axis (grows toward `end`). */
function axisOf(p: StreamPoint, dir: string): number {
  return dir === 'down' ? -p.y : dir === 'up' ? p.y : dir === 'away' ? -p.z : p.z
}
function advance(p: StreamPoint, dir: string, d: number) {
  if (dir === 'down') p.y -= d
  else if (dir === 'up') p.y += d
  else if (dir === 'away') p.z -= d
  else p.z += d
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const c: Cfg = {
    dir: ctx.str('direction', 'toward'),
    spreadX: ctx.num('spreadX', 6),
    spreadY: ctx.num('spreadY', 0),
    length: Math.max(1, ctx.num('length', 60)),
    end: ctx.num('end', 6),
    sMin: ctx.num('sizeMin', 0.6),
    sMax: ctx.num('sizeMax', 1.4),
  }
  const n = Math.max(1, Math.min(3000, Math.round(ctx.num('count', 40))))
  const seed = ctx.num('seed', 7)
  const now = performance.now() / 1000
  const key = `${n}|${seed}|${c.dir}|${c.spreadX}|${c.spreadY}|${c.length}|${c.end}|${c.sMin}|${c.sMax}`
  let st = streamState.get(ctx.nodeId)
  const reset = ctx.trig('reset')
  if (!st || st.key !== key || reset) {
    const rnd = rng(seed)
    const pts: StreamPoint[] = []
    // Spread the first points across the far 85% of the stream so the player gets a moment.
    for (let i = 0; i < n; i++) { const p = { x: 0, y: 0, z: 0, s: 1 }; place(p, c, rnd, rnd() * 0.85); pts.push(p) }
    st = { pts, seed, rnd, last: now, passed: st && !reset ? st.passed : 0, key, boost: st && !reset ? st.boost : 0, lastHit: st?.lastHit ?? -1e9, hits: st && !reset ? st.hits : 0, touching: false }
    streamState.set(ctx.nodeId, st)
  }

  const dt = Math.min(0.1, Math.max(0, now - st.last))
  st.last = now
  const speed = Math.min(ctx.num('maxSpeed', 60), ctx.num('speed', 10) + st.boost)
  let passedNow = 0
  if (!ctx.bool('paused', false) && dt > 0) {
    const d = speed * dt
    for (const p of st.pts) {
      advance(p, c.dir, d)
      if (axisOf(p, c.dir) >= c.end) { place(p, c, st.rnd, 0); passedNow++ }
    }
  }
  st.passed += passedNow
  st.boost += passedNow * Math.max(0, ctx.num('accel', 0))

  // Optional player: contact with any point is a hit (sends that point back, restarts the speed-up)
  let hit = 0
  const cooldown = Math.max(0.05, ctx.num('hitCooldown', 1))
  const px = ctx.inputs.get('playerX'), py = ctx.inputs.get('playerY'), pz = ctx.inputs.get('playerZ')
  if (typeof px === 'number' || typeof py === 'number' || typeof pz === 'number') {
    const r = nearestContact(+(px ?? 0) || 0, +(py ?? 0) || 0, +(pz ?? 0) || 0, st.pts, ctx.num('playerRadius', 0.45), ctx.num('pointSize', 1))
    if (r.touching && !st.touching && now - st.lastHit >= cooldown) {
      hit = 1
      st.lastHit = now
      st.hits++
      st.boost = 0
      if (r.idx >= 0) place(st.pts[r.idx], c, st.rnd, 0)
    }
    st.touching = r.touching
  }
  return new Map<string, unknown>([
    ['currentSpeed', speed],
    ['hit', hit],
    ['impact', Math.max(0, 1 - (now - st.lastHit) / cooldown)],
    ['hits', st.hits],
    ['positions', st.pts.map((p) => ({ ...p }))],
    ['passed', passedNow > 0 ? 1 : 0],
    ['passedCount', st.passed],
  ])
}

export default defineNode({ definition, executor })
