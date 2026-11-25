import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'
import { layoutPositions, readPositions, blendHue } from '@/registry/3d/instances-3d/node'
import pointStream from '@/registry/3d/point-stream-3d/node'
import { nearestContact } from '@/registry/3d/collide-3d/node'
import keyInput, { __keys } from '@/registry/inputs/key-input/node'
import { fillText } from '@/registry/visual/text-overlay/node'
import { spectrumBands } from '@/registry/audio/audio-analyzer/node'
import { THREE } from '@/services/visual/ThreeRenderer'

afterEach(() => vi.restoreAllMocks())
const run = (node: { executor: (c: never) => unknown }, inputs: Record<string, unknown>, controls: Record<string, unknown>, nodeId: string) =>
  node.executor(makeContext(inputs, controls, { nodeId }) as never) as Map<string, unknown>

describe('instances-3d helpers', () => {
  it('lays out n copies in each layout, centred', () => {
    for (const l of ['grid', 'ring', 'spiral', 'line', 'random']) expect(layoutPositions(l, 25, 1)).toHaveLength(25)
    const grid = layoutPositions('grid', 9, 2)
    expect(grid[0]).toEqual({ x: -2, y: 0, z: -2 })
    expect(grid[8]).toEqual({ x: 2, y: 0, z: 2 })
    expect(layoutPositions('random', 5, 1, 3)).toEqual(layoutPositions('random', 5, 1, 3)) // seeded
  })

  it('reads positions as objects or arrays and drops junk', () => {
    expect(readPositions([{ x: 1, y: 2, z: 3, s: 2 }, [4, 5, 6], 'nope', { y: 1 }])).toEqual([
      { x: 1, y: 2, z: 3, s: 2 }, { x: 4, y: 5, z: 6, s: undefined },
    ])
    expect(readPositions('x')).toBeNull()
  })

  it('blends hue the short way round (orange → red does not pass through green)', () => {
    const out = new THREE.Color()
    const hsl = { h: 0, s: 0, l: 0 }
    blendHue(new THREE.Color('#ff8a00'), new THREE.Color('#ff2d55'), 0.5, out).getHSL(hsl)
    expect(hsl.h < 0.1 || hsl.h > 0.9).toBe(true)
  })
})

describe('point-stream-3d', () => {
  it('flows toward the camera, fires Passed at the end and speeds up per point passed', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    const c = { count: 10, speed: 20, accel: 1, maxSpeed: 100, spreadX: 4, length: 20, end: 5, seed: 2 }
    let out = run(pointStream, {}, c, 'ps1')
    const z0 = (out.get('positions') as { z: number }[]).map((p) => p.z)
    expect(z0.every((z) => z <= 5 && z >= -15)).toBe(true)
    let passed = 0
    for (let i = 0; i < 120; i++) { t += 1000 / 60; out = run(pointStream, {}, c, 'ps1'); passed += out.get('passed') as number }
    expect(passed).toBeGreaterThan(0)
    expect(out.get('passedCount')).toBeGreaterThan(5)
    expect(out.get('currentSpeed')).toBeGreaterThan(20)
  })

  it('a player in the path is hit once, which restarts the speed-up', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    const c = { count: 30, speed: 15, accel: 0.5, spreadX: 0, length: 30, end: 6, seed: 5, playerRadius: 0.5, pointSize: 1, hitCooldown: 0.5 }
    let hits = 0
    let out = new Map<string, unknown>()
    for (let i = 0; i < 240; i++) { t += 1000 / 60; out = run(pointStream, { playerX: 0, playerZ: 0 }, c, 'ps2'); hits += out.get('hit') as number }
    expect(hits).toBeGreaterThan(0)
    expect(out.get('hits')).toBe(hits)
    // a player far to the side is never hit
    let side = 0
    for (let i = 0; i < 120; i++) { t += 1000 / 60; side += run(pointStream, { playerX: 50 }, c, 'ps3').get('hit') as number }
    expect(side).toBe(0)
  })
})

describe('collide-3d', () => {
  it('measures the gap to the nearest target and flags contact', () => {
    const targets = [{ x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0, s: 2 }]
    const r = nearestContact(0, 0, 0, targets, 0.5, 1)
    expect(r.idx).toBe(1)
    expect(r.touching).toBe(true)
    expect(nearestContact(0, 0, 0, [{ x: 3, y: 0, z: 0 }], 0.5, 1)).toMatchObject({ touching: false, gap: 2 })
  })
})

describe('key-input', () => {
  it('turns arrows / WASD into axes, latches quick taps and releases on blur', () => {
    run(keyInput, {}, {}, 'k1')
    __keys.down('ArrowRight')
    expect(run(keyInput, {}, {}, 'k1').get('x')).toBe(1)
    __keys.up('ArrowRight')
    __keys.down('w')
    expect(run(keyInput, {}, {}, 'k1').get('y')).toBe(1)
    expect(run(keyInput, {}, { keys: 'arrows' }, 'k1').get('y')).toBe(0)
    __keys.down(' '); __keys.up(' ') // a tap between frames
    const o = run(keyInput, {}, {}, 'k1')
    expect(o.get('spacePressed')).toBe(1)
    expect(o.get('space')).toBe(false)
    __keys.blur()
    expect(run(keyInput, {}, {}, 'k1').get('y')).toBe(0)
  })
})

describe('text-overlay + spectrum', () => {
  it('fills {value} placeholders with rounded numbers', () => {
    expect(fillText('SCORE {value} / {value2}', 12.6, 'x', 0)).toBe('SCORE 13 / x')
    expect(fillText('{value}', undefined, null, 2)).toBe('')
  })
  it('folds FFT dB bins into 0–1 bands', () => {
    const bands = spectrumBands(new Float32Array(256).fill(-20), 32)
    expect(bands).toHaveLength(32)
    expect(bands.every((b) => b === 1)).toBe(true)
    expect(spectrumBands(new Float32Array(256).fill(-Infinity), 8).every((b) => b === 0)).toBe(true)
  })
})
