# bellowsjs 0.1.5 — LLM reference (source material for Thread D)

> Provided by the maintainer, generated from the library source + type declarations.
> **Exact for version 0.1.5.** License Apache-2.0. Site: https://bellows.live
> Repo: https://github.com/virgilvox/bellowsjs
>
> This file is reference-only (uncommitted until the maintainer approves Thread D).
> See `docs/plans/` for the bellowsjs node + audio-engine-evaluation plan (Thread D).

bellowsjs is a browser-native audio engine for synthesis, samples, sequencing,
analysis, and I/O. One AudioWorklet kernel hosts every voice and effect; musical
logic runs on the main thread and compiles to sample-accurate events. The DSP
core has zero browser dependencies, so offline rendering and analysis also run
in Node. Every stochastic decision flows from named, seeded PRNG streams.

## Install and import

```
npm:            npm install bellowsjs
webpage (CDN):  import { play } from 'https://unpkg.com/bellowsjs/dist/bellows.js'
Node (offline): import { registerBuiltins, renderOffline, encodeWav } from 'bellowsjs'
```

In the browser, the AudioContext needs a user gesture: call `Bellows.boot()` or
`play()` from a click handler. In Node there is no audio device: use
`registerBuiltins()` once, then `renderOffline()`.

## Tier 1: immediate sound

```js
import { play, instrument } from 'bellowsjs';
play('pluck', 'C4');                                   // engine id, note
play('kick', 'C2', { vel: 1 });
const piano = await instrument('sf2:./gm.sf2#0:0');    // url#bank:program
piano.note('E3', { dur: '8n', vel: 0.7 });
```

## Tier 2: the Bellows facade

```js
const b = await Bellows.boot({ seed: 'forge-01' });
```

- `b.voice(engineId, params?)` creates an instrument channel in the kernel and
  returns an `Instrument` handle. Engine ids listed under Engines.
- `Instrument.note(note, { at, dur, vel })` plays one note. NoteValue accepts a
  midi number, a name like `'C#4'`, `{ hz: 440 }`, or `{ degree, octave }`
  resolved through the active scale + tuning. `at` is absolute context time in
  seconds (pass the clock callback's `t`). `dur` is musical time (`'8n'`,
  `'3/8'`, `2` = two beats) or `{ seconds }`.
- `Instrument.on(note, vel?, at?)` returns a note id for indefinite holds;
  `Instrument.off(id, at?)` releases it.
- `b.clock.at('16n', (t, step) => ...)` fires ahead of every subdivision tick;
  schedule with the provided `t` — sample-accurate even under main-thread load
  or background-tab timer throttling.
- `b.bus([fx...], { level })` makes a send bus; `instrument.send(bus, amount)`
  routes to it. `instrument.fx('tapeDelay', ['eq', {}])` replaces the insert
  chain. `b.masterFx(...)` sets the master chain.
- Musical time strings: `'1n'` whole, `'2n'`, `'4n'` (one beat), `'8n'`,
  `'16n'`, `'32n'`, dotted `'4n.'`/`'4nd'`, triplet `'8t'`, measures `'2m'`,
  fractions of a whole note `'3/8'`, bar:beat:sixteenth positions `'2:1:2'`, or
  plain numbers (beats).
- `b.transport` is the Transport; `b.bpm(v)`, `b.rampBpm(v, '8m')`,
  `b.swing(amount, '8n')`, `b.start()`, `b.stop()`, `b.pause()`, `b.resume()`.
- `b.rng(label)` returns a named seeded stream; same boot seed + label always
  yields the same sequence.
- `b.render({ bars | beats | seconds, sampleRate? })` re-runs the recorded setup
  + clock callbacks offline → `{ left, right, sampleRate, wav(bitDepth?) }`.
  Renders equal a fresh page load of the same seed as long as randomness flows
  through `b.rng()`.
- `b.tuning` is settable: `Tuning.edo(19)`, `Tuning.ji([...ratios])`, or
  `tuningFromScala(parseScl(text))`. All note resolution flows through it.
- `b.defEngine(def)` / `b.defEffect(def)` register custom DSP (tier 3): the def
  must be self-contained (no imports, no closures) — serialized into the worklet.

### Facade declaration (exact, from dist/bellows.d.ts)

```ts
export interface BootOptions {
    seed?: string;
    context?: AudioContext;
    workletUrl?: string;
    masterGain?: number;
    bpm?: number;
    meter?: Meter;
}
export interface NoteOptions {
    at?: number;   // Absolute context time in seconds. Defaults to a few ms from now.
    dur?: TimeValue | { seconds: number };  // beats, notation ('8n','3/8'), or { seconds }. Default '8n'.
    vel?: number;  // 0..1. Default 0.8.
}
export type NoteValue = number | string | { hz: number } | { degree: number; octave?: number };
export type FxInput = string | [string, Record<string, number>] | FxSpec;

export declare class Bellows {
    readonly ctx: AudioContext;
    readonly seed: string;
    readonly transport: Transport;
    readonly analyser: AnalyserNode;
    readonly kernelErrors: string[];
    onError: ((message: string) => void) | null;
    tuning: Tuning;
    static boot(opts?: BootOptions): Promise<Bellows>;
    now(): number;
    rng(label: string): NamedRng;
    voice(engineId: string, params?: Record<string, number>, opts?: { polyphony?: number }): Instrument;
    instrument(uri: string): Promise<Instrument>;   // 'sf2:<url>#<bank>:<program>' or plain engine id
    sf2Instrument(data: ArrayBuffer | SoundFont, bank: number, program: number): Instrument;
    samplerInstrument(zones: SamplerZoneData[], bankId?: string): Instrument;
    granular(data: Float32Array, sampleRate: number, params?: Record<string, number>): Instrument;
    defEngine(def: EngineDef): void;
    defEffect(def: EffectDef): void;
    bus(fx: FxInput[], opts?: { level?: number }): BusHandle;
    masterFx(...fx: FxInput[]): void;
    masterGain(gain: number): void;
    panic(): void;
    get meter(): MeterFrame | null;
    readonly clock: { at: (subdivision: TimeValue, cb: TickCallback) => (() => void) };
    start(): void; stop(): void;
    bpm(value: number): void;
    rampBpm(value: number, over: TimeValue): void;
    pause(): void; resume(): void;
    swing(amount: number, subdivision?: TimeValue): void;
    scale(spec: string): Scale;
    scale(root: string | number, name: string): Scale;
    euclid(steps: number, pulses: number, rotation?: number): number[];
    freqOf(note: NoteValue, scale?: Scale): number;
    durationSeconds(dur: TimeValue | { seconds: number }, atSeconds: number): number;
    render(opts: { bars?: number; beats?: number; seconds?: number; sampleRate?: number }):
        Promise<RenderedAudio & { wav(bitDepth?: 16 | 24 | 32): ArrayBuffer }>;
    dispose(): void;
}
export declare class Instrument {
    readonly channel: number;
    note(note: NoteValue, opts?: NoteOptions, scale?: Scale): this;
    chord(notes: NoteValue[], opts?: NoteOptions): this;
    on(note: NoteValue, vel?: number, at?: number): number;
    off(noteId: number, at?: number): this;
    param(name: string, value: number, at?: number): this;
    fx(...fx: FxInput[]): this;
    fxParam(fxIndex: number, name: string, value: number): this;
    send(bus: BusHandle, level: number): this;
    gain(value: number): this;
    pan(value: number): this;
    allOff(): this;
}
export declare class BusHandle {
    readonly id: number;
    fxParam(fxIndex: number, name: string, value: number): this;
}
```

## Engines (create with `b.voice(id, params?)`; params are numbers, live-settable via `instrument.param(name, value, at?)`)

- **va** (Virtual Analog) poly 8: shape 0–3(0), detune 0–100c(7), sub 0–1(0),
  cutoff 20–20000Hz(9000,exp), resonance 0–1(0.2), filterType 0–1(0),
  envAmount −6–6oct(0), attack/decay/release 0–10s(0.005/0.1/0.2,exp),
  sustain 0–1(0.8), fAttack/fDecay/fRelease 0–10s(0.003/0.15/0.2), fSustain
  0–1(0.5), drift 0–1(0), pan −1–1(0), velLevel 0–1(0.5), velFilter 0–4oct(0).
- **fm** (FM) poly 8: ops 2–6(4), algorithm 1–8(1), feedback 0–1(0), brightness
  0–2(0.5), a/d/s/r envs, mA/mD/mS/mR mod envs, and ratioN/levelN/fixedN for
  N=1..6 (ratio 0–16, level 0–1, fixed 0–10000Hz).
- **additive** poly 8: morph 0–1(0), inharm 0–0.02(0), decay 0.01–20s(2,exp),
  rolloff 0.3–1(0.8), attack/release, gain 0–2(1), partialN/targetN/detuneN for
  N=1..32 (partial 0–1 = 1/N default, target 0–1(0), detune ±100c(0)).
- **wavetable** poly 8: position 0–1(0), scanRate 0–20Hz(0.5,exp), scanDepth
  0–1(0), envToPosition −1–1(0), a/d/s/r, filter 0–1(0), cutoff 20–20000(8000),
  resonance 0–1(0.1), pan.
- **kick** poly 4: clickTune 1–16(6), pitchDecay 0.005–0.5s(0.05), decay
  0.05–2s(0.4), drive 0–10(2).
- **snare** poly 4: tone 0–1(0.5), decay 0.05–1s(0.18), snap 0.02–1s(0.15).
- **hat** poly 4: decay 0.02–2s(0.08), tone 0.2–2(1).
- **clap** poly 4: decay 0.05–2s(0.25), spread 0.005–0.05s(0.012), tone
  400–4000Hz(1200).
- **tom** poly 4: decay 0.05–2s(0.35), sweep 0.01–0.5s(0.08), noise 0–1(0.15).
- **noise** (Noise Synth) poly 8: color 0–4(0), filterMode 0–2(0), cutoff
  20–20000(2000), resonance, envAmount, keyTrack, a/d/s/r + f-envs, pan.
- **pluck** poly 16: damp 0–1(0.35), pickPos 0–0.95(0.28), exciteType 0–1(0),
  decay 0.05–20s(2.5), level 0–1(0.9).
- **string** (Waveguide String) poly 12: damp, sustain, dispersion, bow,
  bowPressure, bowSpeed, level, body, bodySize, bowNoise, attackBite, vibRate
  3–9Hz(6.1), vibDepth 0–50c(0), vibOnset, bowPos 0.06–0.2(0.11), dynamics,
  polDetune, glide, legatoScratch.
- **tube** (Waveguide Tube) poly 8: breath 0–1(0.85), noise 0–1(0.1), level
  0–1(0.7), glide, legatoScratch.
- **modal** poly 16: material 0–4(0), decay 0.05–30s(2), brightness 0–1(0.5),
  strikeHardness 0–1(0.6), level 0–1(0.6).
- **westcoast** poly 8: foldAmount, foldStages 1–6(2), foldEnv, lpgColor,
  lpgDecay, level.
- **formant** poly 8: vowel 0–4(0), breath, vibratoRate, vibratoDepth, shape,
  level 0–2(1).
- **granular** poly 8: grainSize 10–500ms(80), density 0.5–400Hz(20), position,
  spray, pitch 0.25–4(1), pitchJitter, spread, reverse, baseNote 24–96(69),
  level.
- **harmonic** (Harmonic + Noise) poly 8: brightness, evenOdd, formantShift
  0.25–4(1), noiseMix, noiseColor, portamento, attack, release, level.

Sample-backed: register zones then use id `'sampler:<bankId>'`. From SF2:
`SoundFont.parse(arrayBuffer)` → `samplerBankFromSf2(sf, bank, program).zones` →
`b.samplerInstrument(zones)`, or `b.sf2Instrument(buffer, bank, program)`, or
`await b.instrument('sf2:url#0:0')`. SAMPLER_PARAMS: attack/decay/sustain/release,
loopXfade 0–100ms(8), veltrack 0–100%(100), gain −60–24dB(0,db), pan.
Granular over your own buffer: `b.granular(float32Data, sampleRate, params?)`.

## Instrument presets

`getPreset(id)` → full InstrumentPreset (engine + curated params + optional fx +
gain + suggested octave). `INSTRUMENT_PRESETS` is the whole bank;
`presetsByFamily()` groups it. Create with
`b.voice(preset.engineId, preset.params)` + `instrument.fx(...preset.fx)` +
`instrument.gain(preset.gain)`. bellows.live selects these via engine ids
`preset:<id>`. Families: guitars (nylon/steel/twelve-string/muted/clean-electric/
bass/banjo/sitar/koto/harp/clavinet — all pluck), strings (violin/viola/cello/
double-bass/pizzicato — string+plate), winds (flute/pan-flute/clarinet/recorder/
ocarina/shakuhachi — harmonic or tube), brass (trumpet/trombone/brass-section/
fm-horn — harmonic or fm), keys (dx-epiano fm, organs additive, harpsichord
pluck, celesta/music-box additive), mallets (marimba/vibraphone/glockenspiel/
tubular-bells/kalimba/steel-drum/woodblock/timpani — modal), voices (choir-aah/
voice-ooh formant, whistle additive), synth (analog-lead/fat-saw-pad/acid-bass/
sub-bass va, west-coast-pluck westcoast, motion-pad wavetable, fm-bell-lead fm).

## Effects (in `instrument.fx(...)`, `b.bus([...])`, or `b.masterFx(...)`; entry = id string, `[id, {params}]`, or `{ effectId, params }`)

delay, tapeDelay, multitap, fdn (FDN reverb), plate (reverb), compressor,
limiter, gate, transient, chorus, flanger, phaser, tremolo, autopan, ringmod,
freqshift, eq (6-band parametric), saturator, pitchshift, freeze (spectral),
blur (spectral), robot, whisper, denoise (spectral). Each has documented param
ranges (see maintainer's full reference; e.g. delay: timeL/timeR/feedback/
crossFeedback/damping/mix; plate: decay/damping/bandwidth/predelay/modDepth/mix;
compressor: threshold/ratio/knee/attack/release/makeup/lookahead/mix).

## Theory

`Scale(root, name)`; names include major/dorian/…/minor/blues/whole tone/
octatonic/hirajoshi/… (35+). Methods: degreeToMidi, quantize, contains,
degrees, intervals. Chords: `CHORD_TYPES`, `parseChord`, `detectChord`,
`diatonicTriads/Sevenths`, `romanToChord`, `chordToRoman`. Voice leading:
`voiceLead`, `negativeHarmony`, `invert`. Progressions:
`buildProgression(rng, bars, {cadence?})`. Notes: `parseNote` (C4=60),
`noteName`, `pitchClass`, `octaveOf`, `mtof`, `ftom`. Tuning: `Tuning.edo/ji/
fromCents`, `Tuning.default12`, Scala `parseScl/parseKbm/tuningFromScala`.

## Sequencing

Transport: closed-form tempo integration — beatAt, secondsAt, setBpm, rampBpm,
setSwing, setMeter, position, scheduleHorizon; TempoMap. Generators (all
deterministic given a NamedRng): `euclid` (Bjorklund), `Markov`, `lsystem`,
`ElementaryCA`, `Arpeggiator` (up/down/updown/downup/random/order), Pattern
combinators (seq/stack/fromArray/gates/every/sometimes/fast/slow/rev/rotate,
`at(step)`+length). PRNG `rng(label)` → NamedRng: `()`, fork, int, pick, range,
chance, shuffle, gauss, weighted.

## Analysis

`yin`, `mpm` (pitch), `detectOnsets`, `estimateTempo`, `chroma`+`keyEstimate`,
`spectralCentroid/Flatness/Rolloff/Spread`, `rms`, `zcr`, `mfcc`,
`LoudnessMeter` (BS.1770-4), streaming `YinDetector`/`OnsetDetector`.

## I/O and rendering

`encodeWav`/`decodeWav`, `parseMidi`/`writeMidi`/`toScore`, `MidiInput`/
`MidiOutput` (Web MIDI — Chromium+Firefox only, feature-detect;
`parseMidiMessage` pure), `SoundFont.parse` (SF2), `parseSfz`, `encodeAudio`
(WebCodecs Opus where present). Offline (Node): `registerBuiltins()` then
`renderOffline(setup, { seconds, sampleRate })` → `{ left, right }`
Float32Arrays, identical every run. Event fields: time, kind
(EventKind.NoteOn/NoteOff/Param/AllNotesOff), target (channel), a (note/param
idx), b (Hz/value), c (vel).

## Tier 3 contracts (exact, from dist/types.d.ts)

`Rng`/`NamedRng`, `ParamSpec {name,min,max,default,curve?,unit?}`,
`Voice {noteOn,noteOff,process,setParam,active}`,
`EngineDef {id,label,params,polyphony?,createVoice}`,
`Effect {process,setParam,reset}`, `EffectDef {id,label,params,create}`,
`Analyzer {push,reset}`, `TimeValue`, `TempoPoint`, `EventKind` (const enum),
`KernelEvent`, `StepPattern`, `mtof/ftom/clamp/dbToGain/gainToDb`.

## Rules an integration MUST follow

- Boot from a user gesture or the context stays suspended and silent.
- In Node, call `registerBuiltins()` before `renderOffline`/engine lookups.
- Voices ADD into output over (from,to); effects process IN PLACE. Custom defs
  must not allocate inside `process()` at steady state.
- `defEngine`/`defEffect` defs are serialized with `toString()` into the worklet:
  self-contained functions, numeric params only. Hosts whose CSP blocks
  `blob:`/`eval` need `{ workletUrl }` → `bellowsjs/worklet.js`.
- Route every random choice through `b.rng(label)` for reproducible renders;
  create generators fresh inside setup.
- Web MIDI absent in Safari. WebCodecs Opus feature-detected; WAV always works.

---

### Integration notes for LATCH (Thread D)

- **CSP / worklet**: LATCH runs cross-origin-isolated (COEP credentialless). If a
  `blob:`/`eval` CSP ever blocks the serialized worklet, pass `{ workletUrl }`
  pointing at a bundled `bellowsjs/worklet.js`. Verify during the spike.
- **User gesture**: LATCH already gates audio behind Play — reuse that gesture to
  `Bellows.boot()`. Matches Tone.js `Tone.start()` today.
- **Tone.js comparison surface**: ~24 `from 'tone'` imports across
  `services/audio/AudioManager.ts` + co-located `registry/audio/*/node.ts` +
  `registry/audio/shared.ts`. Parity + dispose/gc lifecycle per node is the crux
  of the migration decision — see the Thread D plan.
