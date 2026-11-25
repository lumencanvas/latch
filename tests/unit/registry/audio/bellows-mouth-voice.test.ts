import { describe, it, expect } from 'vitest'
import { readMouth, mouthSound, nearestShape } from '@/registry/audio/bellows-mouth-voice/node'

const face = (b: Record<string, number>) => readMouth(b, 1)

describe('mouth voice: mouth shape → sound', () => {
  it('a wide-open jaw is "ah", a tight pucker is "oo", a closed smile is "ee"', () => {
    expect(mouthSound(face({ jawOpen: 0.6 })).ipa).toBe('ɑ')
    expect(mouthSound(face({ jawOpen: 0.05, mouthPucker: 0.9 })).ipa).toBe('u')
    expect(mouthSound(face({ jawOpen: 0.05, mouthSmileLeft: 0.8, mouthSmileRight: 0.8 })).ipa).toBe('i')
  })

  it('a half-open rounded mouth is "oh" or "aw"', () => {
    expect(['o', 'ɔ']).toContain(mouthSound(face({ jawOpen: 0.3, mouthFunnel: 0.6 })).ipa)
  })

  it('pressed lips hum, lower lip under the teeth is v, tongue out is th', () => {
    expect(mouthSound(face({ mouthClose: 0.5, jawOpen: 0.02 })).ipa).toBe('m')
    expect(mouthSound(face({ mouthRollLower: 0.6, jawOpen: 0.05 })).ipa).toBe('v')
    expect(mouthSound(face({ tongueOut: 0.6, jawOpen: 0.2 })).ipa).toBe('ð')
  })

  it('sensitivity scales the reading and missing blendshapes read as zero', () => {
    expect(readMouth({ jawOpen: 0.2 }, 2).open).toBeGreaterThan(readMouth({ jawOpen: 0.2 }, 1).open)
    expect(readMouth({}, 1)).toMatchObject({ open: 0, round: 0, spread: 0 })
    expect(nearestShape(readMouth({}, 1)).ipa).toBe('ə')
  })
})
