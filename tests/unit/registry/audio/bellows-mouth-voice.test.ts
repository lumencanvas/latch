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

import {
  mouthFeatures, buildCalibration, calibratedPrototypes, featureDistance, activityFrom, towards,
  lipGeometry, parseCalibration, CALIBRATION_STEPS, type Features,
} from '@/registry/audio/bellows-mouth-voice/mouthFeatures'

/** A face mesh with the inner lips `gap` apart and the corners `width` apart (face width 1). */
function mesh(gap: number, width: number) {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  pts[234] = { x: 0, y: 0.5 }; pts[454] = { x: 1, y: 0.5 }
  pts[13] = { x: 0.5, y: 0.6 }; pts[14] = { x: 0.5, y: 0.6 + gap }
  pts[61] = { x: 0.5 - width / 2, y: 0.62 }; pts[291] = { x: 0.5 + width / 2, y: 0.62 }
  return pts
}

describe('mouth voice v2: lip geometry', () => {
  it('measures the inner-lip gap and width as fractions of face width', () => {
    const g = lipGeometry(mesh(0.08, 0.4))!
    expect(g.lipGap).toBeCloseTo(0.08, 5)
    expect(g.width).toBeCloseTo(0.4, 5)
    expect(lipGeometry([])).toBeNull()
  })

  it('parted lips read as open even when the jaw blendshape is still', () => {
    expect(readMouth({ jawOpen: 0 }, 1, mesh(0.1, 0.4)).open).toBeGreaterThan(0.5)
  })

  it('learns the resting width, then reads wider as spread and narrower as round', () => {
    const rest = { width: null as number | null }
    readMouth({}, 1, mesh(0, 0.4), rest)
    expect(readMouth({}, 1, mesh(0, 0.48), { ...rest }).spread).toBeGreaterThan(0.5)
    expect(readMouth({}, 1, mesh(0, 0.32), { ...rest }).round).toBeGreaterThan(0.5)
  })

  it('a funnel with teeth showing is sh', () => {
    expect(mouthSound(face({ mouthFunnel: 0.6, mouthUpperUpLeft: 0.4, mouthUpperUpRight: 0.4, jawOpen: 0.1 })).ipa).toBe('ʃ')
  })
})

describe('mouth voice v2: calibration', () => {
  // An unusual face: small jaw movement, big lip movement. The generic chart misreads it.
  const shapes: Record<string, Features> = {
    rest: mouthFeatures({ jawOpen: 0.02 }, mesh(0.005, 0.38)),
    'ɑ': mouthFeatures({ jawOpen: 0.25 }, mesh(0.07, 0.36)),
    i: mouthFeatures({ jawOpen: 0.05, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 }, mesh(0.02, 0.46)),
    u: mouthFeatures({ jawOpen: 0.04, mouthPucker: 0.5 }, mesh(0.01, 0.3)),
    o: mouthFeatures({ jawOpen: 0.12, mouthFunnel: 0.4 }, mesh(0.04, 0.32)),
    'ɛ': mouthFeatures({ jawOpen: 0.15, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 }, mesh(0.045, 0.41)),
  }
  const cal = buildCalibration(shapes)!

  it('builds from rest + vowels and derives all twelve vowels', () => {
    expect(cal).not.toBeNull()
    expect(calibratedPrototypes(cal).map((p) => p.ipa).sort()).toEqual(['e', 'i', 'o', 'u', 'æ', 'ɑ', 'ɔ', 'ə', 'ɛ', 'ɪ', 'ʊ', 'ʌ'].sort())
    expect(buildCalibration({ rest: shapes.rest })).toBeNull()
  })

  it('matches each recorded shape back to its own vowel', () => {
    const protos = calibratedPrototypes(cal)
    for (const ipa of ['ɑ', 'i', 'u', 'o', 'ɛ']) {
      const best = protos.reduce((a, p) => (featureDistance(shapes[ipa], p.f, cal.scale) < featureDistance(shapes[ipa], a.f, cal.scale) ? p : a))
      expect(best.ipa).toBe(ipa)
    }
  })

  it('activity is ~0 at rest and ~1 on a vowel; towards() places a frame between rest and a vowel', () => {
    expect(activityFrom(cal, shapes.rest)).toBeLessThan(0.05)
    expect(activityFrom(cal, shapes['ɑ'])).toBeGreaterThan(0.6)
    expect(towards(cal, shapes['ɑ'], cal.vowels['ɑ'])).toBeCloseTo(1, 5)
    expect(towards(cal, shapes.rest, cal.vowels['ɑ'])).toBeCloseTo(0, 5)
  })

  it('round-trips through JSON (how Mouth Calibrate saves it) and rejects junk', () => {
    expect(parseCalibration(JSON.stringify(cal))?.vowels.u).toEqual(cal.vowels.u)
    expect(parseCalibration('nope')).toBeNull()
    expect(parseCalibration('')).toBeNull()
    expect(CALIBRATION_STEPS[0].id).toBe('rest')
  })
})
