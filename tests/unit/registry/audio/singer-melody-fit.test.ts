import { describe, it, expect } from 'vitest'
import { loopNotesToFit, improviseMelody, parseMelody, IMPROV_SCALES } from '@/registry/audio/bellows-singer/voiceNodeShared'

const notes = parseMelody('C4 E4 - G4', 1, 120)

describe('singer: fitting a melody to the words', () => {
  it('loops the melody until every syllable has a pitched note, keeping rests in place', () => {
    const fit = loopNotesToFit(notes, 7)
    expect(fit.filter((n) => n.note !== null)).toHaveLength(7)
    expect(fit.map((n) => n.note)).toEqual(['C4', 'E4', null, 'G4', 'C4', 'E4', null, 'G4', 'C4'])
  })

  it('leaves a melody that is already long enough alone', () => {
    expect(loopNotesToFit(notes, 2)).toBe(notes)
    expect(loopNotesToFit([], 5)).toEqual([])
  })

  it('makes up one note per syllable, in the scale, ending on the root', () => {
    const syls = Array.from({ length: 9 }, (_, i) => ({ stress: i % 2 ? 0 : 1, wordEnd: i % 2 === 1, phraseEnd: i === 8 }))
    const tune = improviseMelody(syls, { root: 62, scale: 'minor pentatonic', bpm: 120, beat: 1, seed: 'hello there' })
    expect(tune).toHaveLength(9)
    for (const n of tune) expect(IMPROV_SCALES['minor pentatonic']).toContain((((n.note as number) - 62) % 12 + 12) % 12)
    expect(tune[tune.length - 1].note).toBe(62)
    expect(improviseMelody(syls, { root: 62, scale: 'minor pentatonic', bpm: 120, beat: 1, seed: 'hello there' })).toEqual(tune)
    // stressed syllables are held longer than unstressed ones
    expect((tune[0].dur as { seconds: number }).seconds).toBeGreaterThan((tune[1].dur as { seconds: number }).seconds)
  })
})
