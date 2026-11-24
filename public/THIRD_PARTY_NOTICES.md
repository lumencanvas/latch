# LATCH — third-party notices

LATCH bundles bellows-voice (MIT), which carries the notices below. They are reproduced
verbatim from node_modules/bellows-voice/THIRD_PARTY_NOTICES.md and are served at /THIRD_PARTY_NOTICES.md.

---

# Third-party notices

bellows-voice is licensed under MIT (see LICENSE). Parts of it are ported from, or learned
from, the software below, which is distributed under its own license. The notice for each is
reproduced here because the build strips source comments from the executable bundles, so the
headers in the source files do not reach their code. Each bundle (`dist/index.js`,
`dist/text.js`, `dist/engine.js`, `dist/view.js`, `dist/dict.js`, `dist/worklet.js` and the
chunks they share) opens instead with a one-line banner naming bellows-voice's license and
CHIMERA's copyright and MIT license and pointing here, and the bundle that holds the CMU
dictionary's data carries Carnegie Mellon's copyright line beside it; the shipped source maps quote the sources whole, headers included.

This code lived in bellowsjs until 0.4.0 and moved here with its history; the paths below are
this repository's.

## CHIMERA

CHIMERA, a physical-model voice synthesizer by Jameson Hodge.
https://github.com/jamesondh/chimera-vocal-synth

Copyright (c) 2026 Jameson Hodge

Everything below was taken from CHIMERA at commit `1d3ea49`. Where a TypeScript original is
named, it is the engine CHIMERA deleted in commit `cd247a6`, readable at `cd247a6^:src/engine`.

### Ported from CHIMERA

These files are translations of CHIMERA's code. Each one starts with a header naming the
CHIMERA file it came from and what was changed.

| file | CHIMERA source |
| --- | --- |
| `src/dsp/glottal.ts` | `crates/chimera/src/sources/glottis.rs`, the drift in `math.rs`, the voice mapping in `voice/human_voice.rs` (TypeScript original `sources/glottis.ts`) |
| `src/lyrics/ipa.ts` | `crates/chimera/src/phonetics/ipa.rs` (`phonetics/ipa.ts`) |
| `src/lyrics/arpabet.ts` | `crates/chimera/src/phonetics/english.rs` (`phonetics/english.ts`) |
| `src/lyrics/letter-to-sound.ts` | `crates/chimera/src/phonetics/english.rs` (`phonetics/english.ts`) |
| `src/lyrics/english.ts` | `crates/chimera/src/phonetics/english.rs` and `syllables.rs` (`phonetics/english.ts`, `phonetics/syllables.ts`) |
| `src/lyrics/syllabify.ts` | `crates/chimera/src/phonetics/syllables.rs` (`phonetics/syllables.ts`) |
| `src/lyrics/read.ts` | `crates/chimera/src/phonetics/syllables.rs` (`phonetics/syllables.ts`) |
| `src/lyrics/durations.ts` | the consonant durations of `crates/chimera/src/phonetics/inventory.rs` (`phonetics/inventory.ts`) |
| `src/lyrics/types.ts` | the Segment and Syllable model of `crates/chimera/src/phonetics/mod.rs` and the FrontEnd trait of `syllables.rs` (`phonetics/syllables.ts`, `phonetics/planner.ts`) |
| `src/view/drawing.ts` | `crates/chimera/src/anatomy/human.rs:1228-1262`, the drawing parts of the geometry: the whole tongue, the lips with their outer faces, the incisors, the jaw bone, the soft palate and the epiglottis |
| `src/view/head.ts` | `src/ui/render/profile.ts`, `buildProfile` and its helpers: the head around the tract: skin, skull, eye, vertebrae, nasal cavity and turbinates, hard palate, jaw, hyoid, thyroid, trachea, folds |
| `src/dsp/area-rate.ts` | the area rate limit, `crates/chimera/src/voice/human_airway.rs:151-156, 190-262`, applied to the junction airway's grid sections and their sub-section minima |
| `src/engines/vocal-geometry.ts` | the midsagittal geometry, `crates/chimera/src/anatomy/human.rs` 276-278 (body constants), 421-439 (NEUTRAL), 507-519 (constants), 644-692 (landmarks, area law, template-to-body map), 725-1263 (`compute`: jaw, velum, outer wall, lips, tongue, inner wall, grid rays, contact model, lip contact, area laws, spike clamp, lateral channel, centreline), 1266-1282 (`epilarynx_area`), 1287-1374 (`resample` with sub-section minima), 1398-1490 (`project_on`, `point_along`, `signed_gap`, `closest_approach`); `anatomy/geom.rs` (polar, rotate_about, ray_polyline, crossing_t, ray_crossings, bezier3, bezier2, arc, catmull_rom, tangent_angle); `math.rs` 89-158. Changes: preallocated point lists, results in scratch fields, a body set in place, the drawing outputs kept for `src/view/drawing.ts` |

In the repository only, `test/lyrics/chimera-golden.test.ts` carries cases converted from
CHIMERA's golden fixtures (`crates/chimera/tests/golden/phonetics-*.json`), and the lyric
tests beside it quote CHIMERA's behaviour to show where the port differs. Tests are not
published to npm.

### Techniques learned from CHIMERA and reimplemented

These files contain no CHIMERA code. They follow an approach, a rule or a set of values found
in CHIMERA, written again in bellows' own idiom, and they say so in their headers.

| file | what follows CHIMERA |
| --- | --- |
| `src/lyrics/sing.ts` | the sung timing rules: vowel on the beat, onsets borrowing from the previous note, proportional consonant squeeze (`phonetics/sing.rs`) |
| `src/dsp/critdamp.ts` | critically damped tracking of articulation targets (`control/articulators.rs`) |
| `src/engines/vocal.ts` | the articulators and their speeds (`control/articulators.rs`), the contact rule (`voice/human_voice.rs:520-552`; here it moves only the output stage of the articulator cascade), the sung breath (`phonetics/planner.rs:376-379`), the vibrato bloom (`phonetics/sing.rs`), the voice's wiring of planner, geometry and airway |
| `src/engines/vocal-planner.ts` | the gestural planner: vowel overlap ramps, a consonant's dominant, secondary, velar-place and alveolar-fronting gestures with their lead, early and release-hold times and speeds by manner, the affricate split, the tap, the nasal velum gesture, the glottal and voiceless abduction rules and the end of the breath group, and the blend of gestures with the rest posture (`phonetics/planner.rs:24, 88-108, 196-390, 532-577`, `control/score.rs:273-430`, `voice/human_voice.rs:445`), planned online here; the return gestures, the closure-then-anterior priority, the per-articulator lead and the virtual lip target are bellows' own |
| `src/engines/vocal-roof.ts` | the roof polylines (from `anatomy/human.rs`), the template-to-body transform (`human.rs:685`), the tip kept outside the tongue body (`human.rs:828`) |
| `src/engines/vocal-drive.ts` | CHIMERA's section counts (`voice/human_airway.rs:75-80`), the area rate law on each keyframe (`human_airway.rs:190-262`), the jet rule of the smallest sub-section minimum (`airway/network.rs:919-930`), the anatomical moving-wall flow (`airway/network.rs` node continuity) |
| `src/dsp/junction-airway.ts` | the airway's elements: trachea 12 k cm by 2.5 k^2 and the lungs' resistance, the nasal profile, the glottal port (kinetic 0.37, slit 1.4 k, depth 0.3 k) and the velum port (length 1.0 k, kinetic 0.3 and 0.8), perimeter and viscous factors and wall radiation 0.25 (`voice/human_airway.rs:84-123`); viscous resistance at 700 Hz, closed area 2e-4, Borda-Carnot loss with a 0.1 contraction loss, the 60 Hz moving-wall filter, the Flanagan radiators (`airway/network.rs:360, 417, 866, 919-930, 1067-1068`); the voicing gate (`sources/glottis.rs:170-176`); the effort mapping (`voice/human_voice.rs:317-350`); the output gain (`human_voice.rs:220`). The formulation (a waveguide at Courant number 1 with the flow solved in its junctions) is bellows' own; the turbulence sources follow Stevens and Birkholz (below), not CHIMERA |
| `src/dsp/airway-tube.ts` | the fixed tubes' wall and viscous elements (`airway/network.rs:860-1010`), lumped onto a few nodes here |
| `src/dsp/air.ts` | the physical constants and the trachea's and nasal cavity's wall tissues (`physics.rs:5-35`); the tract wall's mass, 1.5 g/cm^2, is CHIMERA's `WALL_SOFT` (`physics.rs:28`), its stiffness and damping Birkholz and Zhang's (below) |
| `src/engines/vocal-tables.gen.ts` and `data/vocal/` | CHIMERA's articulator ranges and speeds, rest posture, inventory and calibrated targets, body constants and roofs, and tables measured on its geometry: the formant-tuning rows and the layout lengths (`data/vocal/README.md`) |
| `src/engines/vocal-beats.ts`, `src/engines/vocal-beat-scores.ts`, `src/lyrics/beat.ts` | the beatbox sounds, their airstreams, Standard Beatbox Notation symbols and gestural scores (ready posture, ejective piston, breath, snap and release-fricative timing), the pattern text format, the beat presets and the swing rule (`phonetics/beatbox.rs`, `control/beat_player.rs`), reimplemented on the online planner; the breath key, the ejective's push through the release, the kick's raised tongue body, the 'ch' and 'Psh' sounds, the close microphone and the retriggering on the phoneme parameter are bellows' own |
| `src/engines/vocal-phonemes.ts` | the phoneme classes checked against `phonetics/inventory.rs`, and the stop release rules, no aspiration after /s/, 12 ms when unaspirated, aspiration only before a vowel (`phonetics/planner.rs`) |

`src/lyrics/ipa-front-end.ts` and `src/lyrics/cmudict.ts` were written for bellows; they use
the ported tokenizer and syllabifier and read the dictionary formats CHIMERA reads.

Published research keeps its own credit, given in the files that use it: for the
articulatory voice, the digital waveguide (J. O. Smith, Physical Audio Signal Processing) and
the Kelly-Lochbaum scattering junction (Kelly and Lochbaum 1962) behind `src/dsp/junction-airway.ts`,
Jongman, Wayland and Wong (2000) for the fricative spectra its noise is calibrated against,
Stevens (Acoustic Phonetics, 1998) for the turbulence source law and corner, Birkholz (ISSP 2014)
for the constriction detection, source types, places and their split between junctions, Jackson
and Shadle (2000) and Pincas and Jackson (2005) for frication pulsing with voicing behind a
convective delay, VocalTractLab 2.4's manual for the velic noise source (implemented from the
papers and the manual, not from VocalTractLab's GPL code), Birkholz and Zhang (Interspeech 2025)
for the vocal tract wall's mass, stiffness and damping (`src/dsp/air.ts`), Story and Bunton for
the velopharyngeal port at which a stop turns nasal (`test/engines-physical/vocal.test.ts`), Pink
Trombone (Neil Thapen) as the proof that such a tract runs in a browser, Story (2005) for the
parametric area model behind the design, Saitou, Unoki and Akagi (2005) for sung pitch with
overshoot and preparation (`src/dsp/pitchglide.ts`), Sundberg for the singer's formant and
Joliveau, Smith and Wolfe (2004) for first-resonance tuning on high notes (`src/engines/vocal.ts`),
Hanson (2009) and Lofqvist et al. (1989) for the fold stiffness gesture that raises the pitch after
voiceless obstruents (`src/engines/vocal-planner.ts`); Titze (1984, 1988, 1989) and Birkholz,
Drechsel and Stone (Interspeech 2019) for the geometric two-edge glottis (`src/dsp/geometric-glottis.ts`),
Titze (1988, 1992) and Lucero (1999) for the phonation threshold and its hysteresis
(`src/dsp/phonation-threshold.ts`), Ishizaka and Flanagan (1972), Steinecke and Herzel (1995) and
Birkholz, Kroger and Neuschaefer-Rube (2011) for the self-oscillating two-mass folds
(`src/dsp/fold-oscillator.ts`); Shadle (1991) for keeping the obstacle source broadband while the
free-jet, wall and labiodental sources fall through a second pole, and the critical Reynolds number
of a turbulent jet (Flanagan, Speech Analysis, Synthesis and Perception) for the threshold under
which a constriction makes no noise (`src/dsp/junction-airway.ts`); Lisker and Abramson (1964) for voice onset times; Birkholz, Kroger and Neuschaefer-Rube (2011) and
Birkholz and Hoole (2012) for the six-stage articulator cascade (`src/dsp/cascade.ts`), the
VocalTractLab 2.4 manual (Birkholz 2025) for return gestures and Lofqvist and Gracco (1997) for
the virtual lip target (`src/engines/vocal-planner.ts`), all implemented from the publications. The consonant
durations are CHIMERA's own values, not a published table; `src/lyrics/durations.ts` says how
they compare with Klatt's.

### Dictionary data

No copy of CHIMERA's dictionary ships. The CMU Pronouncing Dictionary does, in `dist/dict.js`
(`bellows-voice/dict`), under its notice below. `parseCmudict()` still reads a dictionary the
caller loads, set as `singer.dictionary` or the `dictionary` option; without one, words go
through letter-to-sound rules.

### License

MIT License

Copyright (c) 2026 Jameson Hodge

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## The CMU Pronouncing Dictionary

`src/dict/cmudict-data.gen.ts` (shipped in `dist/dict.js`, the `bellows-voice/dict` entry) is generated
by `scripts/gen-dict.mjs` from the Carnegie Mellon University Pronouncing Dictionary
(`data/cmudict/cmudict.txt.gz`, the copy CHIMERA ships), keeping the words the English reader gets
wrong without it, re-encoded. Its notice:

```
Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
   The contents of this file are deemed to be source code.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in
   the documentation and/or other materials provided with the
   distribution.

This work was supported in part by funding from the Defense Advanced
Research Projects Agency, the Office of Naval Research and the National
Science Foundation of the United States of America, and by member
companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge
the contributions of many volunteers to the expansion and improvement of
this dictionary.

THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND
ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY
NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

