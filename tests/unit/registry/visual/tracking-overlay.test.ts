import { describe, it, expect } from 'vitest'
import { landmarkSets, noteName } from '@/registry/visual/tracking-overlay/node'

const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5, z: 0 }))

describe('tracking-overlay helpers', () => {
  it('accepts one landmark list, a list of lists, or MediaPipe Hand "All Hands" objects', () => {
    expect(landmarkSets(pts(21))).toHaveLength(1)
    expect(landmarkSets([pts(21), pts(21)])).toHaveLength(2)
    expect(landmarkSets([{ landmarks: pts(21), handedness: 'Left' }, { landmarks: pts(21) }])).toHaveLength(2)
    expect(landmarkSets([])).toEqual([])
    expect(landmarkSets(null)).toEqual([])
    expect(landmarkSets({ x: 1 })).toEqual([])
  })

  it('names MIDI notes', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(69)).toBe('A4')
    expect(noteName(61.4)).toBe('C#4')
  })
})
