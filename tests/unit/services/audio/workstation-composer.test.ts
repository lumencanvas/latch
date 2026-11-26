import { describe, it, expect } from 'vitest'
import { compose, euclid, Markov, rngFor, STYLES, plan } from '@/services/audio/workstation/composer'

/** The Bellows Workstation composer: a seed becomes a whole, repeatable piece. */
describe('workstation composer', () => {
  it('spreads Euclidean pulses evenly', () => {
    expect(euclid(3, 8)).toEqual([1, 0, 0, 1, 0, 0, 1, 0])
    expect(euclid(4, 16).reduce((a, b) => a + b)).toBe(4)
    expect(euclid(3, 8, 1)).toEqual([0, 1, 0, 0, 1, 0, 0, 1])
    expect(euclid(0, 8).every((v) => v === 0)).toBe(true)
  })

  it('walks a trained Markov chain and says when it has never seen a context', () => {
    const m = new Markov(1).train([1, 2, 1, 2, 1, 2])
    const r = rngFor('s', 'm')
    expect(m.next([1], r)).toBe(2)
    expect(m.next([9], r)).toBeNull()
  })

  it('the same seed gives the same piece; another seed a different one', () => {
    const a = compose('night-bus', { style: 'lofi' })
    expect(compose('night-bus', { style: 'lofi' })).toEqual(a)
    const b = compose('sunrise', { style: 'lofi' })
    expect(JSON.stringify(b.bars.map((x) => x.events))).not.toBe(JSON.stringify(a.bars.map((x) => x.events)))
  })

  it('a later cycle keeps the song (key, chords) and varies details', () => {
    const one = compose('night-bus', { style: 'synthwave' }, 0)
    const two = compose('night-bus', { style: 'synthwave' }, 1)
    expect(two.key).toBe(one.key)
    expect(two.bars.map((b) => b.chord.degree)).toEqual(one.bars.map((b) => b.chord.degree))
  })

  it('every style writes a full form with bass, chords, arp and a lead, all in key', () => {
    const dorianD = new Set([2, 4, 5, 7, 9, 11, 0])
    for (const s of STYLES) {
      const p = compose('seed-1', { style: s.id, key: 'D', scale: 'dorian' })
      expect(p.key).toBe('D')
      expect(p.bars.length).toBeGreaterThanOrEqual(36)
      const parts = new Set(p.bars.flatMap((b) => b.events.map((e) => e.part)))
      for (const part of ['bass', 'chords', 'lead', 'arp'] as const) expect(parts.has(part), `${s.id} ${part}`).toBe(true)
      // Everything pitched stays in the scale, except the bass's chromatic approach notes.
      const pitched = p.bars.flatMap((b) => b.events)
        .filter((e) => !['kick', 'snare', 'hat', 'clap'].includes(e.part) && !(e.part === 'bass' && e.step === 14))
      expect(pitched.every((e) => dorianD.has(e.midi % 12)), s.id).toBe(true)
      for (const e of p.bars.flatMap((b) => b.events)) {
        expect(e.step >= 0 && e.step < 16).toBe(true)
        expect(e.midi > 20 && e.midi < 100, `${s.id} ${e.part} ${e.midi}`).toBe(true)
      }
    }
  })

  it('melodies repeat their motif, so phrases have a shape', () => {
    const p = compose('motif-check', { style: 'folk' })
    const a = p.bars.filter((b) => b.section === 'A')
    const rhythm = (i: number) => a[i].events.filter((e) => e.part === 'lead').map((e) => e.step).join(',')
    expect(rhythm(0)).toBe(rhythm(1))
  })

  it('tempo, key and mode come from the style unless set', () => {
    const p = plan('x', { style: 'house' })
    expect(p.bpm).toBeGreaterThanOrEqual(120)
    expect(p.bpm).toBeLessThanOrEqual(126)
    expect(plan('x', { style: 'house', bpm: 99 }).bpm).toBe(99)
  })

  it('includes the bellows workbench moods; Strike keeps its melody pentatonic', () => {
    for (const id of ['ember', 'draw', 'temper', 'billow', 'quench', 'strike']) expect(STYLES.some((s) => s.id === id), id).toBe(true)
    const p = compose('strike-check', { style: 'strike', key: 'A' })
    expect(p.scale).toBe('minor pentatonic')
    expect(p.bpm).toBe(126)
    const penta = new Set([9, 0, 2, 4, 7]) // A C D E G
    const melodic = p.bars.flatMap((b) => b.events).filter((e) => e.part === 'lead' || e.part === 'arp')
    expect(melodic.length).toBeGreaterThan(50)
    expect(melodic.every((e) => penta.has(e.midi % 12))).toBe(true)
    // Draw and Quench have no kit, as in the workbench.
    expect(compose('x', { style: 'draw' }).bars.some((b) => b.events.some((e) => e.part === 'kick'))).toBe(false)
  })
})
