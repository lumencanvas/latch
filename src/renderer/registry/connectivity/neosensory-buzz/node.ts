import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { NeosensoryBuzzAdapter } from '@/services/connections/adapters/NeosensoryBuzzAdapter'
import { BUZZ_MOTOR_COUNT } from '@/services/ble/neosensory/buzzProtocol'
import { buzzState, disposeBuzz, newBuzzState, type BuzzState } from './buzzState'
import BuzzPanel from './BuzzPanel.vue'

/** Max BLE send rate (~30 fps). The firmware frame is ≈16 ms; the adapter dedupes identical frames. */
const PACE_MS = 32
/** How long a Pulse/Test buzz holds all motors at full, for a perceptible tap. */
const PULSE_MS = 180

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

const definition: NodeDefinition = {
  id: 'neosensory-buzz',
  name: 'Neosensory Buzz',
  version: '1.0.0',
  category: 'devices',
  description: 'Drive a Neosensory Buzz haptic wristband — 4 vibration motors, battery, buttons, LED',
  icon: 'vibrate',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  component: markRaw(BuzzPanel),
  inputs: [
    { id: 'motor1', type: 'number', label: 'Motor 1' },
    { id: 'motor2', type: 'number', label: 'Motor 2' },
    { id: 'motor3', type: 'number', label: 'Motor 3' },
    { id: 'motor4', type: 'number', label: 'Motor 4' },
    { id: 'motors', type: 'data', label: 'Motors[]' },
    { id: 'intensity', type: 'number', label: 'Intensity' },
    { id: 'pulse', type: 'trigger', label: 'Pulse' },
    { id: 'led', type: 'string', label: 'LED (hex)' },
  ],
  outputs: [
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'battery', type: 'number', label: 'Battery' },
    { id: 'button', type: 'trigger', label: 'Button' },
    { id: 'status', type: 'string', label: 'Status' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'deviceId', type: 'ble-pair', label: 'Device ID', default: '', props: { placeholder: 'Set by "Add Bluetooth Device"' } },
    { id: 'minIntensity', type: 'number', label: 'Min Intensity', default: 0.12, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'maxIntensity', type: 'number', label: 'Max Intensity', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'closedLoop', type: 'toggle', label: 'Closed-loop LRA', default: false },
  ],
  tags: ['neosensory', 'buzz', 'haptic', 'vibration', 'wristband', 'bluetooth', 'ble', 'motor', 'sensory'],
  info: {
    overview:
      'Drives a Neosensory Buzz haptic wristband over Bluetooth. Four motor inputs (0–1) map to the four LRAs and stream live, so vibration can follow audio, an LFO, EEG, or any signal. A Pulse trigger fires a short tap; battery, button presses, and an experimental LED colour are exposed too.',
    tips: [
      'Click "Pair device…" on this node to bind your Buzz, then press Play.',
      'Wire an audio level or LFO into the motor inputs for continuous haptics; use Pulse for discrete taps.',
      'Min/Max Intensity set the byte range each 0–1 value maps into — raise Min if low values feel like nothing.',
      'Closed-loop LRA is louder but can damage the motors at high intensity — leave it off unless you know why.',
    ],
    pairsWith: ['audio-analyser', 'lfo', 'muse-eeg', 'trigger', 'smooth'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceId = (ctx.controls.get('deviceId') as string) ?? ''
  const minIntensity = clamp01((ctx.controls.get('minIntensity') as number) ?? 0.12)
  const maxIntensity = clamp01((ctx.controls.get('maxIntensity') as number) ?? 1)
  const closedLoop = (ctx.controls.get('closedLoop') as boolean) ?? false
  const master = clamp01((ctx.inputs.get('intensity') as number) ?? 1)
  const led = ctx.inputs.get('led') as string | undefined
  const pulseTrig = ctx.inputs.get('pulse')

  const minByte = Math.round(minIntensity * 255)
  const maxByte = Math.round(maxIntensity * 255)

  const outputs = new Map<string, unknown>()
  const emit = (s: BuzzState, connected: boolean, button: boolean) => {
    outputs.set('connected', connected)
    outputs.set('battery', s.battery)
    outputs.set('button', button)
    outputs.set('status', s.status)
    outputs.set('error', s.error)
    // Internal: the panel reads live motor levels + battery + status each frame.
    outputs.set('_motors', s.motors)
    outputs.set('_battery', s.battery)
    outputs.set('_status', s.status)
    return outputs
  }

  let state = buzzState.get(ctx.nodeId)
  if (!state) {
    state = newBuzzState(closedLoop, 'idle', null)
    buzzState.set(ctx.nodeId, state)
  }

  // Web Bluetooth is Chromium-only — feature-detect so the node reports "unsupported" with
  // guidance instead of a confusing adapter connect error on Safari/Firefox.
  if (!('bluetooth' in navigator)) {
    state.status = 'unsupported'
    state.error = 'Web Bluetooth needs Chrome/Edge or the desktop app'
    state.motors = [0, 0, 0, 0]
    return emit(state, false, false)
  }

  if (!deviceId) {
    if (state.adapter) {
      disposeBuzz(ctx.nodeId)
      state = newBuzzState(closedLoop, 'no device', 'No device — click "Pair device…" to connect a Buzz')
      buzzState.set(ctx.nodeId, state)
    } else {
      state.status = 'no device'
      state.error = 'No device — click "Pair device…" to connect a Buzz'
      state.motors = [0, 0, 0, 0]
    }
    return emit(state, false, false)
  }

  // (Re)create the adapter when the bound device or LRA mode changes.
  if (!state.adapter || state.deviceId !== deviceId || state.closedLoop !== closedLoop) {
    if (state.adapter) state.adapter.dispose()
    // autoReconnect:false — the executor's canConnect()-throttled loop below owns reconnection
    // (adapter autoReconnect would trap drops in 'reconnecting' and starve the retry; see muse-eeg).
    state.adapter = new NeosensoryBuzzAdapter(ctx.nodeId, {
      id: ctx.nodeId,
      name: 'Neosensory Buzz',
      protocol: 'ble',
      deviceId,
      closedLoop,
      autoConnect: false,
      autoReconnect: false,
      reconnectDelay: 2000,
      maxReconnectAttempts: 0,
    })
    state.deviceId = deviceId
    state.closedLoop = closedLoop
    state.lastConnectAt = 0
    state.lastLed = ''
    state.error = null
  }
  const adapter = state.adapter

  // Throttled, state-machine-guarded gesture-free connect (fires + retries, never storms).
  const now = Date.now()
  if (adapter.canConnect() && now - state.lastConnectAt >= 2000) {
    state.lastConnectAt = now
    const a = adapter
    a.connect().catch((e) => {
      const s = buzzState.get(ctx.nodeId)
      if (s && s.adapter === a) s.error = e instanceof Error ? e.message : 'Connection failed'
    })
  }

  const connected = adapter.status === 'connected'
  state.status = adapter.status
  state.battery = adapter.batteryPct

  // Compose the target frame (0..1 per motor). A `motors[]` array overrides the scalar inputs.
  const arr = ctx.inputs.get('motors')
  const frame = [0, 0, 0, 0]
  if (Array.isArray(arr)) {
    for (let i = 0; i < BUZZ_MOTOR_COUNT; i++) frame[i] = clamp01(Number(arr[i]) || 0) * master
  } else {
    frame[0] = clamp01((ctx.inputs.get('motor1') as number) ?? 0) * master
    frame[1] = clamp01((ctx.inputs.get('motor2') as number) ?? 0) * master
    frame[2] = clamp01((ctx.inputs.get('motor3') as number) ?? 0) * master
    frame[3] = clamp01((ctx.inputs.get('motor4') as number) ?? 0) * master
  }

  // Pulse: a rising edge (or the panel's Test button, via requestTestBuzz) holds all motors at full.
  const pulseHigh = pulseTrig === true || pulseTrig === 1 || (typeof pulseTrig === 'number' && pulseTrig > 0)
  if (pulseHigh && !state.lastPulseHigh) state.pulseUntil = Math.max(state.pulseUntil, now + PULSE_MS)
  state.lastPulseHigh = pulseHigh
  if (now < state.pulseUntil) {
    const p = master > 0 ? master : 1
    frame[0] = frame[1] = frame[2] = frame[3] = p
  }

  let button = false
  if (connected) {
    state.motors = frame
    button = adapter.takeButtonEvents() > 0
    // Paced live drive: at most ~30 fps to the band; the adapter dedupes identical frames.
    if (now - state.lastSendAt >= PACE_MS) {
      state.lastSendAt = now
      const a = adapter
      a.vibrate(frame, minByte, maxByte).catch((e) => {
        const s = buzzState.get(ctx.nodeId)
        if (s && s.adapter === a) s.error = e instanceof Error ? e.message : 'Send failed'
      })
    }
    // Experimental LED, on change (never blocks/breaks motor control).
    if (typeof led === 'string' && led && led !== state.lastLed) {
      state.lastLed = led
      const a = adapter
      a.setLed(led).catch(() => {})
    }
  } else {
    state.motors = [0, 0, 0, 0]
  }

  return emit(state, connected, button)
}

export default defineNode({ definition, executor })
