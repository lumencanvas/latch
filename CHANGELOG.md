# Changelog

## 1.3.0

Existing flows open and wire exactly as before: no node, port or control was removed or renamed,
and no control default changed. On desktop, your saved flows, assets, Control Panel layouts and
preferences move to the new app storage automatically on first launch.

### New
- **Voice nodes (bellows-voice):** `Bellows Singer` sings lyrics to notes (with accents) and
  `Bellows Speak` turns text into speech. Both can output mouth shapes (jaw, lips, tongue…)
  to drive visuals.
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
