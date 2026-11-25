# Changelog

## 1.5.0: AI agents can build flows (WebMCP), 14 new example flows

### AI agent access (WebMCP)
- **Let an AI agent work in LATCH:** the new robot button in the header offers LATCH's editor to AI
  agents as tools. An agent can read the flow, search nodes, build and wire whole patches in one
  step, set controls, play and stop, read values and errors, and see Main Output. It follows WebMCP
  (`document.modelContext`), with a built-in polyfill where the browser has none.
- **Claude Code, Claude Desktop and Cursor** connect through the WebMCP local relay: turn on “Let
  desktop agents connect” and run the command shown (`claude mcp add latch -- npx -y
  @mcp-b/webmcp-local-relay@6.2.0 --widget-origin https://latch.design`).
- **Off by default, per tab.** Modes: Read only, Ask before changes, Allow edits. LATCH asks before
  an agent plays the flow, reads the output image or imports JSON. Pause, an activity list, and
  **Revert agent changes** live in the same menu. Every agent change is one undo step.
- Agents can't run code: Function and Expression nodes they add or edit, or import, stay disabled
  until you click Enable code. Tokens and passwords are masked in everything an agent reads, and an
  agent can't change where a node holding a saved token connects. See docs/AGENT_ACCESS.md.
- Agent access works on every page (including Controls). Custom shader uniforms an agent writes
  become ports straight away, and Revert agent changes still works after you turn agents off.

### Examples
- 14 new flows: **Inventory of a Room** (a gallery piece: YOLO sees the room and an operatic voice
  sings each new thing as you're redrawn in light), **Frutiger Aero**, Liquid Chrome, Pop Halftone,
  Signal Decay, Ink Mandala, YOLO Object Detector, Say What You See, Motion Ink, Duotone Poster Cam,
  Ghost Presence, Corner Constellations and Narrated Camera.
- Examples are grouped by interest (Start here, Showcase, Shaders & visuals, Camera & tracking, AI &
  voice, Music & sound, 3D & games, Data & network, Hardware) with filter chips. Frutiger Aero joins
  the empty-canvas starters.

- **Frutiger Aero is now a show-piece:** real soap bubbles that refract the sky with a rainbow
  film and a glint, a mirror lake, lens flare, bokeh, and aurora that swells with the music.
  It runs about three times faster than before.
- **Play the Room** replaces Blob Camera among the empty-canvas starters, with Blob Camera's
  inverted look.

### AI models
- **Image Captioning works again:** its old default (BLIP) was removed from Hugging Face. It now
  uses SmolVLM, which it shares with the VLA node, so the model loads once.
- **Depth Estimation** defaults to Depth Anything V2, and like Detect Objects (Live) it now asks
  before downloading its model. D-FINE and RT-DETR join the detection models.
- **Default means your choice:** a node set to "Default" uses the model you picked for that task in
  AI Models.
- Speech Recognition can choose its Whisper model. LLM downloads show in the loading indicator.
  Download progress no longer mixes between models during "Load all".
- transformers.js 4.3.2 (onnxruntime-web 1.31) and WebLLM 0.2.89, which adds newer chat models.
- **Models use your GPU when they can:** each model tries the right devices and precisions for this
  machine in order (for example, Depth now runs on the GPU in fp16) and falls back to the CPU on its
  own. "Use GPU" in AI Models is on by default; turn it off to stay on the CPU.
- **AI Models shows whether each model will run here** and why not ("needs WebGPU", "over memory"),
  where a loaded model runs, and each model's licence, with a badge when it limits use
  (non-commercial, terms apply). The "model needed" prompt shows the licence before downloading.
- Agents can list models, sizes, licences and fit (`latch_list_models`); loading stays with you.
- **Captions and text generation no longer hold up other models:** they run in their own worker, so
  Depth and object detection load and run while a caption is being written. Live AI nodes also pace
  themselves to how long inference takes, and back off further when the flow drops below 24 fps.

### Fixed
- Tidy (auto-arrange) packed nodes with an image preview too tightly when they weren't on screen.
- **Edits could vanish on reload** if you switched tabs within two seconds of changing a flow:
  autosave only wrote whichever flow was open when it fired. It now saves every changed flow, and
  saves the one you leave as you switch.
- **Play and Stop in the Controls view did nothing** (the status said LIVE at 0 fps): they only
  changed the label. They now start and stop the flow.
- Loading LATCH straight on the Controls page left the node catalog empty.
- Audio Analyzer: Smoothing is now capped at 0.99. At 1 the readings froze for good.

## 1.4.3: Flows library, close ≠ delete, share and paste single flows

### Flows
- **Flows button** in the header (next to Examples) opens the flow library, replacing the old Import
  and Export icons, which now live there.
- **Flow library:** a Flows tab in the sidebar lists every saved flow (newest first, searchable) with its
  node count and last edit. Click to open it in a tab; its menu renames, duplicates, exports one flow,
  copies its JSON, closes or deletes it. New / Import / Paste at the top, Export all at the bottom.
- **Closing a tab no longer deletes the flow.** It stays in the library; Delete there (with an
  “Export first” option) is the only way to remove one.
- **Share one flow:** the library and the tab menu export just that flow, and “Copy Flow
  JSON” puts it on the clipboard. **Paste a flow:** ⌘V / Ctrl+V with flow JSON on the clipboard opens it
  as a new tab (or use Paste in the library). Import opens whatever a file holds, one flow or many.
- Save keeps every flow in this browser without downloading a file each time.

### Fixed
- Assets tab: the filter chips wrap instead of running off the edge, the upload box no longer squeezes
  its text, and long file names truncate inside their cards.
- The Equalizer display spaced its bars linearly, so almost all music landed in the first bar (Rule 110
  Garden looked dead): bars are now log-spaced 40 Hz–16 kHz over a finer analysis.

## 1.4.2: Mouth Voice v2, 3D game nodes, model loading prompt, example placement

### Added
- **Load the models a flow needs:** pressing Play on a flow whose AI models aren't loaded shows a card
  naming them (with sizes) and offers to load them; a loading pill at the top lists everything still
  loading (models, trackers, samples) and clicking an entry jumps to its node.
- **Example flows: Insert or Open as New.** Insert now follows your cursor as an outline until you click
  where it goes (Esc cancels); Open as New puts it in its own tab, framed. Cards are one size with long
  descriptions trimmed, and the canvas zooms out further (to 10%) for big flows.
- **Synth preset dials:** the modelled instruments get Tone, Attack, Release, Length and Vibrato dials
  (whichever the instrument responds to), also on Bellows Instrument and Poly Voice in preset mode.
- **Bellows Singer melody modes:** more words than notes now loops the melody; "Make up a melody" writes a
  tune for any incoming text in a chosen key and scale. Sing It Back uses it.

### Fixed
- Speech to Text in voice-detection mode waited forever in a room with steady background noise: it now
  learns the noise floor and transcribes at least every Buffer Duration.
- Air Harp played on a metronome whatever you did; now each string your fingertip crosses plucks, the
  strings are drawn on the video, and the controls are written on screen.
- Hot reloads in development no longer print a duplicate-id warning for every node.


### Mouth Voice v2
- **Calibrate to your face:** new **Mouth Calibrate** node runs a guided minute (relax, then hold ah, ee,
  oo, oh, eh) and saves your shapes in the flow. Wire its Calibration into Mouth Voice and vowels are
  matched against your own mouth instead of an average one.
- Sharper reading from the inner-lip outline (wire Face Landmarks), with a resting mouth width learned
  on the fly. Lip consonants: p (puffed cheeks, then open), b (hum, then open), w, sh, alongside m, v, th.
- Experimental: Read Tongue From Video guesses tongue height from inside the open mouth.
- Two flows: **Mouth to Voice** (basic) and **Mouth to Voice (calibrated)**.

### 3D
- New nodes: **Instances 3D** (one shape hundreds of times in one draw call; grid, ring, spiral, line,
  random or your positions; heights and colours from data), **Point Stream 3D** (endless stream for
  asteroids, stars, rain; speeds up as points pass; optional player hit test), **Collide 3D**,
  **Key Input** (arrow keys / WASD as axes, Space, a custom key) and **Text Overlay** (scores, captions).
- Audio Analyzer has a **Spectrum** output (32 bands, 0 to 1).
- Primitives cast and receive shadows.
- New flows: **Build a 3D Scene**, **Sound City**, **Warp Tunnel**, **Hold It in Your Hand** and
  **Comet Dodge**, a 3D game made only of nodes (now on the empty-canvas starters).

## 1.4.1: Synth on bellows, tracking nodes, example flows, drag fix

### Fixed
- **Dragging a node from the sidebar could lock up the editor** (grab cursor stuck, no clicks until a
  reload). The sidebar no longer uses the browser's drag and drop: the drag is tracked with pointer
  events, shows the node's name under the cursor, and drops where you release over the canvas.
  Releasing anywhere else, or pressing Escape, cancels it. Tap or click still adds at the center.
- **Keyboard to Synth notes could sustain forever.** Holding two keys and letting go left the first
  note ringing: the Synth released only the latest note, its clean-up timer could drop a newer note,
  and the Synth panel ran a second copy of every note straight to the speakers. The keyboard now
  releases everything when the window loses focus, frees the exact note a computer key started, and
  falls back to the key still held when you let go of one.

### Changed
- **Synth now plays bellows underneath.** Same simple panel and the same six instruments, plus twelve
  modelled ones (electric piano, organ, nylon guitar, harp, cello, flute, brass, marimba, kalimba, FM
  bell, choir, analog lead, acid bass, motion pad). Sine, Moog Bass, Warm Pad and Pluck still follow
  the envelope and filter knobs. The Pad's Voices knob is gone (detune sets the width).
- Bellows Instrument and Synth move to the new note when it changes while the gate is held (legato).

### New nodes
- **Blob Tracker:** the blob-tracking look. Boxes, ids, coordinates and connecting lines snap onto
  whatever moves (or bright/dark areas), in outline, corner, invert or tinted styles. Outputs the blobs,
  their count, how much of the frame is moving, the biggest blob's position and a trigger on each new
  blob, so movement can play sound.
- **Tracking Overlay:** draws MediaPipe hand, pose or face tracking over the video as a texture (tech
  HUD with square joints, bracketed tags and fingertip coordinates, neon glow, or dots), with an
  optional big label or note name. MediaPipe Hand gains an **All Hands** output to draw every hand.

- **Mouth Voice:** your mouth shape, read by face tracking, becomes the articulatory voice. How open,
  how rounded and how spread your lips are picks the nearest vowel (ee, ih, ay, eh, a, ah, uh, aw,
  oh, oo), the voice's jaw, lip and tongue settings follow your mouth between vowels, pressed lips hum,
  lower lip under the teeth gives v and the tongue out gives th. The **Mouth to Voice** sample wires it
  up with eyebrow pitch and a HUD that labels the sound you are making.

### Easier to find
- **Header works on small screens:** labels collapse to icons step by step and the flow name truncates
  instead of wrapping; the icon actions and GitHub link stay on desktop and tablet, folding into a More
  menu only at phone widths. Nothing is cut off at any width.
- An **Examples** button (graduation cap) in the header and a **Browse all example flows** button on the empty canvas
  open the full list (the explorer tab is now called Example Flows, unfiltered when opened this way).

### New sample flows
- **Air Harp:** your fingertip plays a harp in the air (hand tracking, notes snapped to D dorian, a
  pad chord that follows your hand each bar, a granular glass cloud scrubbed by moving sideways, ladder
  filter, tape delay and plate), with a tech HUD drawing your hand and the note it plays.
- **Sing With Your Face:** open your mouth and the bellows voice sings the next syllable of the lyrics
  while a choir holds the chord; raise your eyebrows to sing higher. Neon face HUD.
- **Sing It Back:** speech recognition and a sentiment model, both in the browser; a singing voice sings
  your sentence back, with more reverb the sadder it sounds.
- **Depth Mirror:** a depth model turns the webcam into a depth camera that warps the image, pushed by
  the room's bass and highs.
- **Rule 110 Garden:** an L-system kalimba melody and a Rule 110 hi-hat, retuned to just intonation.
- **Blob Tracking Cam**, **Play the Room** (motion strikes a marimba), **Skeleton HUD**.
- For beginners: **Your First Sound**, **Play the Keyboard**, **Type and It Talks**, **See Your Voice**,
  **Endless Melody**.
- The empty-canvas picker now offers Your First Sound, Blob Tracking Cam, Air Harp, Sing With Your
  Face, Rule 110 Garden and Endless Melody.

## 1.4.0: bellows as a node family

Needs bellowsjs 0.5.2 (direct inputs/outputs and the filter effect).

**Breaking for bellows flows:** bellows nodes are now heard only through their Audio output, like
every other LATCH sound source. A flow saved with 1.3.0 is silent until each bellows node's Audio is
wired to an Audio Output (muting that output now silences it). The Reverb Send control is gone (its
shared reverb played past the wire); put a Bellows Reverb in the chain instead. The Chords & Arpeggio
and MIDI Keyboard starters are wired this way.

### New
- **Audio out on every bellows sound node** (Instrument, Chord/Poly Voice, Singer, Speak and all the
  new ones). Its sound goes only down the wire, so bellows runs through any LATCH audio node,
  analyzer or Audio Output.
- **Bellows effects as nodes:** Filter (low/high/band-pass, notch, shelves, bell, Moog-style ladder),
  Reverb (hall, plate), Delay (stereo, tape, multitap), Dynamics (compressor, limiter, gate, transient
  shaper), Modulation (chorus, flanger, phaser, tremolo, auto-pan, ring mod, frequency shifter),
  Saturator, 6-band EQ and Spectral (pitch shift, freeze, blur, robotize, whisper, denoise). They take
  any LATCH audio in (oscillators, the mic, other bellows nodes), and key parameters (cutoff,
  resonance, mix, drive, semitones…) can be wired from LFOs and envelopes.
- **Bellows SoundFont:** play any .sf2 file (upload or URL), choose an instrument by preset number,
  play notes, held notes or whole chords.
- **Bellows Voice Keys:** the singing voice as a keyboard instrument. Lyrics mode sings the next
  syllable of your words on each key (consonants, held vowel, closing consonants on release); Vowel
  mode sings a chosen vowel on every key; optional legato glides.
- **Bellows Beatbox:** eight beatbox grooves or your own step pattern, from the physical voice model.
- **Bellows Granular:** any audio file as a granular instrument (position, grain size, density,
  spray, pitch; wireable for scrubbing and freezing).
- **Bellows Tuning:** retune all bellows sound to N-EDO, 12-note just intonation or a Scala file.
- **Chord Detect**, **Cellular Rhythm** (Rule 30/90/110 drum patterns) and **L-System Melody**.
- Singer and Speak pronounce words with the CMU dictionary by default (shipped in 1.3.0).

### Fixed
- Dragging a node from the sidebar onto an empty canvas did nothing: the starter-flow picker
  covering the canvas refused the drop. It now accepts it.

## 1.3.0

Existing flows open and wire exactly as before: no node, port or control was removed or renamed,
and no control default changed. On desktop, your saved flows, assets, Control Panel layouts and
preferences move to the new app storage automatically on first launch.

### New
- **Voice nodes (bellows-voice):** `Bellows Singer` sings lyrics to notes (with accents) and
  `Bellows Speak` turns text into speech. Both can output mouth shapes (jaw, lips, tongue…)
  to drive visuals. Words are pronounced with the CMU Pronouncing Dictionary by default
  (Dictionary Pronunciation toggle), so vowels, stress and irregular words sound right;
  `/IPA/` between slashes sets a word's sounds directly.
- **12 new starter flows** (20 in total), grouped by who they're for: Spinning Kaleidoscope,
  Audio-Reactive VJ Loop, Webcam Edge Detection, Generative Melody, Chords & Arpeggio,
  Mic Scope & Tempo, Face-Controlled Glitch, Local LLM Poem, Spinning 3D Torus, Fetch Live
  JSON, CLASP Relay Loopback, MQTT Listener, MIDI Keyboard Instrument. Each card says what it
  needs (camera, mic, MIDI, network…).
- **Tidy graph** (Shift+Alt+L): auto-arranges the selection or the whole flow; undoable.
- **Import safety:** opening a flow file that contains code (Function / Expression nodes)
  shows what it contains and opens it with code disabled unless you choose to trust it.
- **Desktop:** Bluetooth and serial now show a real device picker instead of silently
  choosing the first device.

### Improved
- **bellows** updated to 0.5: no more stuck channels, stale preset settings, or zipper noise
  on parameter changes; Stop → Play is reliable.
- **Control Panel:** "Expose to Control Panel" works; layouts are per flow (deleting a node
  in one flow no longer clears controls in another); touch and keyboard support; a
  duplicated flow gets its own independent panel.
- Nodes show at most 8 controls inline, with the rest in Properties.
- Keyboard focus rings are back across the app; many contrast fixes.
- Code and shader edits are undoable.

### Fixed (may change how some flows behave — in the intended direction)
- Inputs that take several wires (e.g. 3D Scene objects) now receive all of them, not just
  the last one.
- Step Sequencer plays step 1 on the first clock after start/reset (it used to skip it).
- Delay, Gate and Metronome pass triggers as pulses — a delayed or gated trigger no longer
  gets stuck high, so downstream nodes fire every time.
- Counter's Set input applies when its value changes (a constantly wired Set used to pin the
  count).
- Envelopes reach sustain; held triggers no longer retrigger synths, timers or AI nodes
  every frame.
- 3D lights, materials and geometry are no longer rebuilt every frame; Texture Display
  displays.
- Deleting an effect no longer silences the oscillator feeding it.
- The first trigger after a network reconnect (MQTT, WebSocket, CLASP) is no longer lost;
  CLASP re-subscribes after reconnecting and no longer leaks connections.
- Spring, Slew, Tween and Integral recover from a bad (NaN) input instead of freezing.
- Quantize keeps full precision on large numbers.
- Flows that use only bellows instruments (e.g. Chords & Arpeggio) are no longer silent.
- Many smaller node fixes across data, math, logic, string, timing, audio, visual and I/O.

### Desktop & platform
- Electron 43 (supports macOS 12 and later), served from a secure `app://` origin with
  sandboxing, a content security policy and a reduced native bridge.
- `npm install` no longer pulls the native ML binaries that blocked Android/Termux (#1) —
  ~300 MB less on every install (they were never used; the browser build stubs them).
- macOS: local/unsigned builds are signed as LATCH itself, so the camera and microphone
  permission prompt appears.
- MediaPipe is pinned to a fixed version instead of `@latest`.
- Dependency security updates.

### Known limitations
- Subflows can be built and grouped but do not execute yet.
- The Control Panel layout is stored in the app, not inside exported flow files.
- AI model downloads cached by the old desktop build are re-downloaded once.
