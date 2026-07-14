import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineLifecycle } from '@/engine/nodeState'
import { MuseAdapter, type MuseSnapshot } from '@/services/connections/adapters/MuseAdapter'
import { MUSE_CHANNELS, MUSE_BANDS, relativeBandPowers, type MuseBand } from '@/services/ble/muse/museSignal'
import MuseHeadMap from './MuseHeadMap.vue'

// ── Co-located per-node state + lifecycle (leak-prone: owns a live GATT adapter) ──
interface MuseState {
  adapter: MuseAdapter | null
  deviceId: string
  preset: string
  /** Last connect() attempt (ms) — throttles retries so a failed/dropped link re-dials, not per-frame. */
  lastConnectAt: number
  status: string
  error: string | null
}
const museState = new Map<string, MuseState>()

function disposeMuse(nodeId: string): void {
  const s = museState.get(nodeId)
  if (s?.adapter) s.adapter.dispose()
  museState.delete(nodeId)
}
defineLifecycle({
  label: 'muse-eeg',
  gc: (valid: Set<string>) => {
    for (const id of museState.keys()) if (!valid.has(id)) disposeMuse(id)
  },
  disposeAll: () => {
    for (const id of Array.from(museState.keys())) disposeMuse(id)
  },
})

const definition: NodeDefinition = {
  id: 'muse-eeg',
  name: 'Muse EEG',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Muse 2 EEG headband: raw channels, δ/θ/α/β/γ band powers, blink & jaw-clench, focus/calm, contact & battery',
  icon: 'brain',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  component: markRaw(MuseHeadMap),
  inputs: [],
  outputs: [
    { id: 'TP9', type: 'number', label: 'TP9' },
    { id: 'AF7', type: 'number', label: 'AF7' },
    { id: 'AF8', type: 'number', label: 'AF8' },
    { id: 'TP10', type: 'number', label: 'TP10' },
    { id: 'delta', type: 'number', label: 'δ Delta' },
    { id: 'theta', type: 'number', label: 'θ Theta' },
    { id: 'alpha', type: 'number', label: 'α Alpha' },
    { id: 'beta', type: 'number', label: 'β Beta' },
    { id: 'gamma', type: 'number', label: 'γ Gamma' },
    { id: 'focus', type: 'number', label: 'Focus (β/α)' },
    { id: 'calm', type: 'number', label: 'Calm (α/θ)' },
    { id: 'blink', type: 'trigger', label: 'Blink' },
    { id: 'clench', type: 'trigger', label: 'Jaw Clench' },
    { id: 'contact', type: 'data', label: 'Contact' },
    { id: 'battery', type: 'number', label: 'Battery' },
  ],
  controls: [
    {
      id: 'deviceId',
      type: 'text',
      label: 'Device ID',
      default: '',
      props: { placeholder: 'Set by "Add Bluetooth Device"' },
    },
    {
      id: 'preset',
      type: 'select',
      label: 'Preset',
      default: 'p50',
      props: {
        options: [
          { label: 'p50 — EEG + PPG', value: 'p50' },
          { label: 'p21 — EEG only', value: 'p21' },
          { label: 'p20 — EEG (low power)', value: 'p20' },
        ],
      },
    },
    { id: 'blinkThreshold', type: 'number', label: 'Blink Threshold (µV)', default: 110, props: { min: 20, max: 400, step: 5 } },
    { id: 'clenchThreshold', type: 'number', label: 'Clench Threshold (×)', default: 3, props: { min: 1.5, max: 8, step: 0.5 } },
    {
      id: 'bandMode',
      type: 'select',
      label: 'Band Mode',
      default: 'absolute',
      props: { options: [{ label: 'Absolute (µV²)', value: 'absolute' }, { label: 'Relative (0–1)', value: 'relative' }] },
    },
  ],
  tags: ['muse', 'eeg', 'brain', 'bci', 'bluetooth', 'ble', 'neuro', 'alpha', 'meditation'],
  info: {
    overview: 'Streams live EEG from a Muse 2 headband: four raw electrode channels (TP9/AF7/AF8/TP10), δ/θ/α/β/γ band powers, blink and jaw-clench triggers, focus (β/α) and calm (α/θ) indices, per-electrode contact quality, and battery. Pair the headband with the "Add Bluetooth Device" panel, then Play.',
    tips: [
      'Use the "Add Bluetooth Device" panel (Bluetooth icon in the header) to pair a Muse — it drops this node already bound.',
      'Watch the head map: the electrode halos fill in as contact improves. Green ≈ good contact.',
      'Blink and Jaw Clench are trigger outputs — wire them to fire events; tune their thresholds if they miss or double-fire.',
    ],
    pairsWith: ['smooth', 'threshold', 'trigger', 'oscilloscope', 'console'],
  },
}

const IDLE_SNAPSHOT: MuseSnapshot = {
  channels: { TP9: 0, AF7: 0, AF8: 0, TP10: 0 },
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  perChannel: {
    TP9: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
    AF7: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
    AF8: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
    TP10: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  },
  contact: { TP9: 0, AF7: 0, AF8: 0, TP10: 0 },
  focus: 0,
  calm: 0,
  battery: null,
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceId = (ctx.controls.get('deviceId') as string) ?? ''
  const preset = (ctx.controls.get('preset') as string) ?? 'p50'
  const blinkThreshold = (ctx.controls.get('blinkThreshold') as number) ?? 110
  const clenchThreshold = (ctx.controls.get('clenchThreshold') as number) ?? 3
  const bandMode = (ctx.controls.get('bandMode') as string) ?? 'absolute'

  const outputs = new Map<string, unknown>()
  const emit = (snapshot: MuseSnapshot, status: string, error: string | null, blink = false, clench = false) => {
    const rel = bandMode === 'relative'
    const bands = rel ? relativeBandPowers(snapshot.bands) : snapshot.bands
    // Keep per-channel bands consistent with the aggregate under the selected mode.
    const perChannel = rel
      ? MUSE_CHANNELS.reduce((acc, ch) => { acc[ch] = relativeBandPowers(snapshot.perChannel[ch]); return acc }, {} as MuseSnapshot['perChannel'])
      : snapshot.perChannel
    for (const ch of MUSE_CHANNELS) outputs.set(ch, snapshot.channels[ch])
    for (const b of MUSE_BANDS) outputs.set(b.name, bands[b.name as MuseBand])
    outputs.set('focus', snapshot.focus)
    outputs.set('calm', snapshot.calm)
    outputs.set('blink', blink)
    outputs.set('clench', clench)
    outputs.set('contact', snapshot.contact)
    outputs.set('battery', snapshot.battery)
    // Internal: the head-map NodeView reads the full snapshot + status each frame.
    outputs.set('_snapshot', { ...snapshot, bands, perChannel })
    outputs.set('_status', status)
    outputs.set('_error', error)
    return outputs
  }

  let state = museState.get(ctx.nodeId)
  if (!state) {
    state = { adapter: null, deviceId: '', preset, lastConnectAt: 0, status: 'idle', error: null }
    museState.set(ctx.nodeId, state)
  }

  if (!deviceId) {
    if (state.adapter) { disposeMuse(ctx.nodeId); museState.set(ctx.nodeId, { adapter: null, deviceId: '', preset, lastConnectAt: 0, status: 'no device', error: null }) }
    return emit(IDLE_SNAPSHOT, 'no device', 'Pair a Muse via "Add Bluetooth Device"')
  }

  // (Re)create the adapter when the bound device or preset changes.
  if (!state.adapter || state.deviceId !== deviceId || state.preset !== preset) {
    if (state.adapter) state.adapter.dispose()
    state.adapter = new MuseAdapter(
      ctx.nodeId,
      { id: ctx.nodeId, name: 'Muse', protocol: 'ble', deviceId, preset, autoConnect: false, autoReconnect: true, reconnectDelay: 2000, maxReconnectAttempts: 0 },
      blinkThreshold,
      clenchThreshold,
    )
    state.deviceId = deviceId
    state.preset = preset
    state.lastConnectAt = 0
    state.error = null
  }

  const adapter = state.adapter
  adapter.setThresholds(blinkThreshold, clenchThreshold)

  // Gesture-free connect, throttled + state-machine-guarded: canConnect() is true only from
  // idle/disconnected/error (never while connecting/reconnecting/connected), so this both
  // fires the initial connect AND retries a failed/dropped one every ~2 s — without storming.
  const now = Date.now()
  if (adapter.canConnect() && now - state.lastConnectAt >= 2000) {
    state.lastConnectAt = now
    const a = adapter
    a.connect().catch((e) => {
      const s = museState.get(ctx.nodeId)
      if (s && s.adapter === a) s.error = e instanceof Error ? e.message : 'Connection failed'
    })
  }

  if (adapter.status !== 'connected') {
    // Drain any pulse set on the final connected frame so it isn't replayed after a reconnect.
    adapter.takeBlink()
    adapter.takeClench()
    return emit(IDLE_SNAPSHOT, adapter.status, state.error)
  }

  const snapshot = adapter.getSnapshot()
  return emit(snapshot, 'connected', null, adapter.takeBlink(), adapter.takeClench())
}

export default defineNode({ definition, executor })
