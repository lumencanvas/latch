# bellowsjs — nodes + audio-engine evaluation (2026-07-13)

**Status:** DESIGN / RECOMMENDATION — direction confirmed 2026-07-13.
**Thread:** D. **Bottom line up front: ADD bellowsjs alongside Tone.js as a first-class, flexible surface; do NOT
replace Tone.js.**

> **Maintainer intent (2026-07-13):** the maintainer **authored bellowsjs** and wants it *in* LATCH with a **flexible
> way to use its many complex features** — not a token one or two nodes. So the design target is a *comprehensive,
> flexible* bellows surface (engines · effects · theory · sequencing · deterministic render · analysis), including a
> low-level/power-user escape hatch, layered so casual users get simple nodes and advanced users get the full engine.
> The "keep Tone.js" call is purely architectural (Tone backs LATCH's free patch-graph; bellows is a scheduled kernel);
> the two coexist, and bellows is a *headline* capability, not a fallback. Replacement was not requested.

Reference: `docs/reference/bellowsjs-0.1.5-llm-reference.md` (exact 0.1.5 API). Site: https://bellows.live ·
Repo: https://github.com/virgilvox/bellowsjs · **License Apache-2.0** (compatible with LATCH's MIT — Apache-2.0 is
one-way compatible into MIT-licensed projects; keep the NOTICE/attribution).

---

## 1. What bellowsjs is

A browser-native **music engine**: one AudioWorklet kernel hosts every voice + effect; musical logic runs on the main
thread and **compiles to sample-accurate scheduled events**. Zero-dependency DSP core → also runs offline in Node.
Every stochastic choice flows through named, seeded PRNG streams (deterministic renders). Rich built-ins: ~19 synth
**engines** (va/fm/additive/wavetable/pluck/string/modal/granular/formant/west-coast + drum engines), ~24 **effects**,
a full **theory** layer (scales/chords/voice-leading/progressions/tunings incl. microtonal), **sequencing** generators
(euclid/markov/l-system/CA/arpeggiator/pattern combinators), and **analysis** (yin/mpm pitch, onset/tempo, chroma/key,
spectral, loudness BS.1770).

## 2. How LATCH uses audio today (from the audio-subsystem audit)

- **A shared `AudioContext`** (`AudioManager`) with a master `Tone.Gain` → analyser + meter → destination; user-gesture
  gate + iOS interruption recovery.
- **Tone.js as a free Web Audio node graph**: ~20 co-located audio nodes wrap Tone primitives (Synth/Mono/FM/AM/
  Oscillator/Player; Gain/Filter/FeedbackDelay/Reverb/Distortion/Compressor/BitCrusher; FFT/Meter; native pitch/beat)
  that users **wire arbitrarily** (oscillator → filter → delay → output).
- **rAF-driven, not scheduled**: the `ExecutionEngine` runs every frame; audio params are updated via `.value = …` and
  synths fire immediately (`triggerAttack(freq, Tone.now(), vel)`). **Tone.Transport / Loop / scheduling are deliberately
  unused.** 24 `from 'tone'` sites; an ordering-sensitive 8-map dispose sequence; no Meyda.

## 3. The architectural verdict: bellows is not a Tone replacement for LATCH

| Dimension | Tone.js (what LATCH needs) | bellowsjs |
|---|---|---|
| Model | **Free Web Audio node graph** — wire any node to any node | **Closed worklet kernel** — voices+effects live inside; no free graph out |
| Routing | `.connect()` arbitrary nodes; effects are standalone wireable nodes | fx are per-instrument **insert chains** / buses declared on the voice |
| Timing | Per-frame `.value =` + immediate triggers (rAF) | **Sample-accurate scheduled events** (`.note({at})`, `b.clock.at`) — its core strength, which LATCH doesn't use |
| Live signal in | mic (`UserMedia`), `Player`, any node tapped for analysis | synthesis/sample/offline focused; analysis works on **buffers**, not a live arbitrary-node tap |
| Lifecycle | per-node `.dispose()` (LATCH's 8-map teardown) | kernel-managed voice pool; `allOff`/`panic`/`b.dispose()` — no per-node graph disposal |

**Why replacement is the wrong move:** LATCH's audio paradigm is a *patch graph with per-frame modulation*. bellows
exposes **no free node graph** — you cannot wire a LATCH `filter` node between a bellows voice and a bellows effect,
because they're inside the worklet. Standalone-effect nodes (filter/delay/reverb between arbitrary nodes), the
analysis nodes that tap any signal, and mic input **have no bellows equivalent**. And LATCH would be using bellows
*against its grain* — bypassing the sample-accurate scheduler that is its entire value proposition. A "replacement"
is therefore not a library swap but a **rewrite of LATCH's audio model** onto a kernel that doesn't support that model.
The audio audit independently flagged Reverb, MonoSynth, FMSynth, and custom PeriodicWave as the hardest ports even
before this mismatch. **Recommendation: keep Tone.js. Do not migrate.**

## 4. The opportunity: add bellowsjs where it's *additive and distinctive*

bellows is excellent at exactly what LATCH's Tone graph is weak at: **generative music, musical theory, deterministic
composition, and a huge synth palette**. Add it as a new capability surface, not a replacement:

- **`bellows-instrument`** — pick an engine (va/fm/pluck/string/modal/granular/…) + curated preset + params; play it
  from LATCH triggers/notes (keyboard, sequencer, euclid, MIDI nodes). One `Bellows.boot()` per flow; each instrument
  is a `b.voice()`. Its output shares LATCH's `AudioContext` (see §5) and taps into the analysis/output graph.
- **Generative/theory nodes** (bellows' standout, no Tone equivalent): `euclid`, `markov`, `l-system`, `arpeggiator`,
  `scale`/`chord`/`progression`, `tuning` (microtonal EDO/JI/Scala) → emit note/degree streams that drive
  `bellows-instrument` *or* LATCH's existing synths. These are genuinely new creative primitives.
- **`bellows-render`** — bellows' unique **deterministic offline render**: a seed + a pattern → a WAV/AudioBuffer,
  identical every run. Feeds LATCH's `audio-player`/sample nodes. Great for reproducible generative loops.
- **Analysis** (optional): bellows' pitch/onset/tempo/key/loudness on captured buffers, if we want higher-quality
  analysis than the in-house autocorrelation/FFT nodes.

**Layered for flexibility (the maintainer's explicit goal — expose the full engine, not a toy subset):**
- **Casual layer** — preset instrument nodes (`bellows-instrument` with the built-in preset bank: dx-epiano, marimba,
  acid-bass, …), drum nodes, ready-to-play. Zero theory knowledge required.
- **Structured layer** — engine + params exposed as controls (`va`/`fm`/`granular`/… with their exact param ranges from
  the reference), fx chains (`instrument.fx(...)`, buses, master fx), and the generative/theory nodes as wireable
  primitives. Microtonal tunings (EDO/JI/Scala) as a first-class control.
- **Power layer (the escape hatch)** — a `bellows-script` node: a sandboxed live-code surface where an advanced user
  writes against the `Bellows` facade (`b.voice`, `b.clock.at`, `b.rng`, patterns, `b.render`) for complex, seeded,
  sample-accurate compositions LATCH's graph can't express. Gated by the security/trust model like any code node
  (`code`/`expression` precedent). This is what makes "all of bellows" reachable without a node per feature.

This plays to LATCH's strategy (open / durable / accessible; expand creative range) without a risky rewrite, and
without overclaiming (per `strategy/05`). It also showcases a first-party LumenCanvas library end-to-end (bellows is
the maintainer's), the way the `clasp` connectivity does.

## 5. The one hard integration question: routing bellows into LATCH's graph

bellows boots its own kernel and connects internally toward `ctx.destination`. LATCH routes everything through its
`AudioManager` master gain, not `ctx.destination` directly. Two facts make this tractable:

- `Bellows.boot({ context })` accepts an **existing `AudioContext`** → boot bellows on `AudioManager`'s context (no
  second context, one gesture gate, shared clock).
- bellows exposes `b.analyser` (an `AnalyserNode`) and `b.masterGain(gain)`, but the 0.1.5 facade does **not** clearly
  expose its master *output node* to reroute into LATCH's master gain. **Open question / spike:** confirm whether
  bellows' output can be inserted before LATCH's master (so LATCH's master volume/analysis see it), or whether bellows
  renders straight to destination in parallel (acceptable for v1, but LATCH's master meter/recording wouldn't include
  it). If needed, upstream a small "expose output node" ask, or run bellows through a `MediaStreamDestination` we tap.

Other integration notes:
- **Worklet under COEP/CSP:** bellows serializes custom defs into the worklet via `blob:`/`eval`. LATCH is
  cross-origin-isolated (COEP credentialless) and sets no restrictive CSP today, so blob worklets should load; if a CSP
  is ever added, pass `{ workletUrl }` → bundled `bellowsjs/worklet.js`. **Verify in the spike.**
- **User gesture:** reuse LATCH's existing Play gesture to `Bellows.boot()` (same as `Tone.start()` today).
- **Lifecycle/GC:** one `Bellows` instance per flow, disposed on stop via the engine's `defineLifecycle` path (like the
  audio category); instruments are `allOff()` on stop. Must register cleanup — the repo's recurring leak class.
- **Web MIDI / WAV:** Web MIDI absent in Safari (bellows + LATCH both feature-detect); WAV export always works.

## 6. Recommendation & phasing (each phase: co-located `defineNode`, gates + adversarial review + browser smoke, sign-off between phases)

**Do not replace Tone.js.** Add bellowsjs as a new, additive surface:

- **D0 — spike (small, decides the rest):** add the `bellowsjs` dep; boot on LATCH's `AudioContext`; prove one
  `va`/`pluck` voice makes sound and can be **routed into LATCH's master graph** (resolve §5). Confirm the blob worklet
  loads under COEP. If routing is impossible without upstream changes, decide parallel-to-destination vs. MediaStream tap.
- **D1 — `bellows-instrument` node** (engine + preset + params; played by LATCH triggers/notes) + lifecycle/GC.
- **D2 — generative/theory nodes** (euclid/arp/scale/chord/progression/tuning) emitting note streams — the distinctive win.
- **D3 (optional) — `bellows-render`** (deterministic offline → AudioBuffer) + optional analysis nodes.

Tone.js stays the backbone of the existing audio graph indefinitely. Revisit "replace" only if LATCH's audio model
ever shifts from a free patch-graph to a scheduled-composition model — not on the current roadmap.

## 7. Open questions for sign-off

1. Endorse **add-alongside, do-not-replace**? *(Strong recommendation: yes.)*
2. Priority of the additive nodes: **instrument first** (D1) vs. **generative/theory first** (D2)? *(Recommend D0 spike,
   then D1, since instruments are the audible payoff and unblock D2's targets.)*
3. Acceptable for v1 if bellows renders **parallel to `ctx.destination`** (not through LATCH's master meter/recording),
   pending an upstream "expose output node"? *(Recommend yes for the spike; revisit for release.)*
4. Bundle-size budget: bellows adds a DSP core + worklet; LATCH already ships large ML bundles. OK to add? *(Likely yes;
   measure in D0.)*
