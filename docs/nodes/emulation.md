# Controllers & Emulation Nodes

Live game-controller input and an in-browser retro emulator. The three nodes share
a single unified controller format, **`ControllerState`**, so they interoperate with
each other and with CLASP.

## ControllerState

A self-describing, Standard-Gamepad logical layout that flows on `data` ports.
Defined in `src/renderer/services/input/controllerState.ts`.

```ts
ControllerState = {
  connected: boolean
  id?: string                       // device / source id
  buttons: {                        // each 0..1 (analog triggers fractional)
    a, b, x, y,
    l1, r1, l2, r2,
    select, start,
    l3, r3,
    up, down, left, right,
    home
  }
  axes: { lx, ly, rx, ry }          // -1..1 (Web Gamepad convention: y is down-positive)
}
```

Because it's a plain object, a **CLASP receive** whose `value` carries a
`ControllerState` can drive any controller input (e.g. a remote phone publishing one
state per player).

---

## Gamepad (`inputs`)

Reads a physical controller through the Web Gamepad API each frame and emits a
`ControllerState`. Press a button once after connecting a pad so the browser exposes
it.

- **Controls:** `Controller` (first-connected or a specific player slot), `Deadzone`.
- **Outputs:** `state` (ControllerState), `connected` (boolean), `anyButton` (trigger, rising edge).

Unlike Node-RED / PageNodes' event-per-message gamepad nodes, this emits a continuous,
normalized state each frame — easy to wire straight into the Visual Gamepad or Emulator.

## Visual Gamepad (`inputs`)

A controller rendered on the node body (and in the Control Panel) that both
**visualizes** an incoming `ControllerState` and is **playable** — click/touch the
buttons and drag the sticks to generate state.

- **Input:** `state` (ControllerState, optional — what to light up).
- **Output:** `state` (ControllerState — input merged with your touches).
- Add it to the **Control Panel** for a large, playable virtual pad during a performance.

## Emulator (`video`)

Runs a retro ROM with [EmulatorJS](https://emulatorjs.org) (libretro cores) entirely
in the browser.

- **Load a ROM:** pick a file in the ROM control (stored in IndexedDB via the asset
  store), choose a System or let it **auto-detect** from the extension, then press ▶.
- **Outputs:** `texture` (the emulator canvas — wire to Main Output), `audio` (wire to
  Audio Output), `running` (boolean), `system` (string).
- **Controller inlets:** one `Player N` inlet per player the loaded core supports
  (e.g. NES = 2, N64 = 4), each taking a `ControllerState`. Feed them from a Gamepad
  node, a Visual Gamepad, or a CLASP receive. Inputs are mapped to each core's RetroPad
  layout (`src/renderer/services/emulation/coreMap.ts`).
- **Trigger inlets:** `start` / `stop` / `reset` resume / pause / reset the running game.
- **Resize** the node (bottom-right handle) to resize the emulator.

Supported systems: NES, SNES, N64, Game Boy / Color, GBA, Genesis, Master System,
PlayStation, PC Engine, Atari 2600.

**Notes:** EmulatorJS is single-instance, so only one Emulator node runs at a time.
Core data loads from the EmulatorJS CDN by default (the data URL is configurable on the
node for self-hosting/offline).
