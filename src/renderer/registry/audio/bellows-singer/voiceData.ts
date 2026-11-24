/**
 * bellows-voice option tables — DATA (no bellows-voice import).
 *
 * Like engineParams.ts, the node definitions need their selects synchronously at registry time
 * while bellows-voice (and its ~160 KB worklet) stays lazy. Transcribed from bellows-voice@0.8.0
 * (`VOICE_PRESETS`, `ACCENTS` + `ACCENT_REGIONS`, `SHAPE_PRESETS`); the "voiceData matches
 * bellows-voice" suite in tests/unit/registry/audio/bellows-voice.test.ts diffs them against the
 * installed package so an upgrade can't drift silently.
 */

export interface VoiceOption { value: string; label: string }

/** Starter voices: [id, display name]. */
export const VOICE_PRESET_OPTIONS: VoiceOption[] = [
  ['narrator-male', 'Narrator (male)'], ['narrator-female', 'Narrator (female)'], ['child', 'Child'],
  ['bass', 'Bass'], ['baritone', 'Baritone'], ['tenor', 'Tenor'], ['contralto', 'Contralto'],
  ['mezzo', 'Mezzo-soprano'], ['soprano', 'Soprano'], ['pop-female', 'Pop (female)'],
  ['pop-male', 'Pop (male)'], ['rock', 'Rock (gravel)'], ['elder', 'Elder'], ['beatboxer', 'Beatboxer'],
].map(([value, label]) => ({ value, label }))

/** The 31 built-in accents: [id, region, display name]. */
export const ACCENTS: readonly [string, string, string][] = [
  ['general-american', 'North America', 'General American'], ['canadian', 'North America', 'Canadian'],
  ['californian', 'North America', 'Californian'], ['new-york', 'North America', 'New York'],
  ['boston', 'North America', 'Boston'], ['inland-north', 'North America', 'Inland North (Chicago, Detroit)'],
  ['southern-us', 'North America', 'Southern US'],
  ['received-pronunciation', 'England', 'Received Pronunciation (traditional)'],
  ['southern-british', 'England', 'Southern British'], ['london', 'England', 'London'],
  ['west-country', 'England', 'West Country'], ['brummie', 'England', 'Brummie (Birmingham)'],
  ['scouse', 'England', 'Scouse (Liverpool)'], ['northern-english', 'England', 'Northern English'],
  ['geordie', 'England', 'Geordie (Tyneside)'],
  ['scottish', 'Scotland, Wales and Ireland', 'Scottish'], ['welsh', 'Scotland, Wales and Ireland', 'Welsh'],
  ['irish', 'Scotland, Wales and Ireland', 'Irish'],
  ['northern-irish', 'Scotland, Wales and Ireland', 'Northern Irish (Belfast)'],
  ['australian', 'Southern hemisphere', 'Australian'], ['new-zealand', 'Southern hemisphere', 'New Zealand'],
  ['south-african', 'Southern hemisphere', 'South African'],
  ['nigerian', 'Africa', 'Nigerian'], ['ghanaian', 'Africa', 'Ghanaian'], ['kenyan', 'Africa', 'Kenyan'],
  ['jamaican', 'Caribbean', 'Jamaican'], ['trinidadian', 'Caribbean', 'Trinidadian'],
  ['indian', 'Asia', 'Indian'], ['singaporean', 'Asia', 'Singaporean'], ['filipino', 'Asia', 'Filipino'],
  ['russian', 'Europe', 'Russian'],
]

export const ACCENT_OPTIONS: VoiceOption[] = ACCENTS.map(([value, region, name]) => ({
  value,
  label: `${region} · ${name}`,
}))

/** Mouth postures laid over every sound ('neutral' = none). */
export const SHAPE_OPTIONS: VoiceOption[] = [
  'neutral', 'smile', 'pout', 'operatic', 'belt', 'nasal', 'muffled', 'tense', 'giant', 'tiny',
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))

const VOICE_IDS = new Set(VOICE_PRESET_OPTIONS.map((o) => o.value))
const ACCENT_IDS = new Set(ACCENTS.map(([id]) => id))
const SHAPE_IDS = new Set(SHAPE_OPTIONS.map((o) => o.value))

export const safeVoice = (id: unknown, fallback: string): string =>
  typeof id === 'string' && VOICE_IDS.has(id) ? id : fallback
export const safeAccent = (id: unknown): string =>
  typeof id === 'string' && ACCENT_IDS.has(id) ? id : 'general-american'
export const safeShape = (id: unknown): string =>
  typeof id === 'string' && SHAPE_IDS.has(id) ? id : 'neutral'
