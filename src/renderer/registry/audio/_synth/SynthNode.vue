<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ChevronDown, ChevronRight, Music } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

const isCollapsed = ref(false)
const hoveredPort = ref<string | null>(null)

// Audio context and nodes
let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let activeVoices: Map<number, Voice> = new Map()

interface Voice {
  oscillators: OscillatorNode[]
  gainNode: GainNode
  filterNode?: BiquadFilterNode
  releaseTimeout?: ReturnType<typeof setTimeout>
}

// Get definition from nodesStore
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'synth'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

const inputs = computed(() => definition.value?.inputs ?? [])
const outputs = computed(() => definition.value?.outputs ?? [])

// Control values
const instrument = computed({
  get: () => (props.data?.instrument as string) ?? 'sine',
  set: (value: string) => flowsStore.updateNodeData(props.id, { instrument: value }),
})

const volume = computed({
  get: () => (props.data?.volume as number) ?? -6,
  set: (value: number) => flowsStore.updateNodeData(props.id, { volume: value }),
})

const attack = computed({
  get: () => (props.data?.attack as number) ?? 0.01,
  set: (value: number) => flowsStore.updateNodeData(props.id, { attack: value }),
})

const decay = computed({
  get: () => (props.data?.decay as number) ?? 0.1,
  set: (value: number) => flowsStore.updateNodeData(props.id, { decay: value }),
})

const sustain = computed({
  get: () => (props.data?.sustain as number) ?? 0.7,
  set: (value: number) => flowsStore.updateNodeData(props.id, { sustain: value }),
})

const release = computed({
  get: () => (props.data?.release as number) ?? 0.3,
  set: (value: number) => flowsStore.updateNodeData(props.id, { release: value }),
})

// Moog-specific
const cutoff = computed({
  get: () => (props.data?.cutoff as number) ?? 2000,
  set: (value: number) => flowsStore.updateNodeData(props.id, { cutoff: value }),
})

const resonance = computed({
  get: () => (props.data?.resonance as number) ?? 1,
  set: (value: number) => flowsStore.updateNodeData(props.id, { resonance: value }),
})

const filterEnv = computed({
  get: () => (props.data?.filterEnv as number) ?? 0.5,
  set: (value: number) => flowsStore.updateNodeData(props.id, { filterEnv: value }),
})

// Pluck-specific
const brightness = computed({
  get: () => (props.data?.brightness as number) ?? 0.5,
  set: (value: number) => flowsStore.updateNodeData(props.id, { brightness: value }),
})

const damping = computed({
  get: () => (props.data?.damping as number) ?? 0.5,
  set: (value: number) => flowsStore.updateNodeData(props.id, { damping: value }),
})

// Pad-specific
const detune = computed({
  get: () => (props.data?.detune as number) ?? 10,
  set: (value: number) => flowsStore.updateNodeData(props.id, { detune: value }),
})

const voices = computed({
  get: () => (props.data?.voices as number) ?? 3,
  set: (value: number) => flowsStore.updateNodeData(props.id, { voices: value }),
})

// Current input values
const currentNote = computed(() => (props.data?.note as number) ?? 60)
const currentVelocity = computed(() => (props.data?.velocity as number) ?? 100)
const currentGate = computed(() => (props.data?.gate as boolean) ?? false)

// Instrument display names
const instrumentNames: Record<string, string> = {
  sine: 'Sine',
  moog: 'Moog Bass',
  piano: 'Piano',
  organ: 'Organ',
  pluck: 'Pluck',
  pad: 'Pad',
}

// Which controls to show per instrument
const instrumentControls: Record<string, string[]> = {
  sine: ['volume', 'attack', 'decay', 'sustain', 'release'],
  moog: ['volume', 'attack', 'decay', 'sustain', 'release', 'cutoff', 'resonance', 'filterEnv'],
  piano: ['volume', 'attack', 'decay', 'sustain', 'release', 'brightness'],
  organ: ['volume', 'attack', 'release'],
  pluck: ['volume', 'brightness', 'damping'],
  pad: ['volume', 'attack', 'release', 'detune', 'voices'],
}

const visibleControls = computed(() => instrumentControls[instrument.value] ?? ['volume'])

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

// Convert MIDI note to frequency
function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

// dB to linear gain
function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

// Initialize audio context
function initAudio() {
  if (!audioContext) {
    audioContext = new AudioContext()
    masterGain = audioContext.createGain()
    masterGain.connect(audioContext.destination)
    masterGain.gain.value = dbToGain(volume.value)
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
}

// Create voice based on instrument type
function createVoice(note: number, velocity: number): Voice {
  initAudio()
  if (!audioContext || !masterGain) throw new Error('Audio not initialized')

  const freq = midiToFreq(note)
  const velGain = velocity / 127
  const now = audioContext.currentTime

  const gainNode = audioContext.createGain()
  gainNode.gain.setValueAtTime(0, now)

  const oscillators: OscillatorNode[] = []
  let filterNode: BiquadFilterNode | undefined

  switch (instrument.value) {
    case 'sine': {
      const osc = audioContext.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gainNode)
      osc.start()
      oscillators.push(osc)
      break
    }

    case 'moog': {
      // Sawtooth through lowpass filter
      const osc = audioContext.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq

      filterNode = audioContext.createBiquadFilter()
      filterNode.type = 'lowpass'
      filterNode.frequency.value = cutoff.value
      filterNode.Q.value = resonance.value

      // Filter envelope
      const filterTarget = cutoff.value + (20000 - cutoff.value) * filterEnv.value
      filterNode.frequency.setValueAtTime(cutoff.value * 0.5, now)
      filterNode.frequency.linearRampToValueAtTime(filterTarget, now + attack.value)
      filterNode.frequency.linearRampToValueAtTime(cutoff.value, now + attack.value + decay.value)

      osc.connect(filterNode)
      filterNode.connect(gainNode)
      osc.start()
      oscillators.push(osc)
      break
    }

    case 'piano': {
      // Multiple detuned oscillators with quick decay
      const types = ['triangle', 'sine'] as const
      types.forEach((type, i) => {
        const osc = audioContext!.createOscillator()
        osc.type = type
        osc.frequency.value = freq * (1 + (i - 0.5) * 0.002)
        osc.connect(gainNode)
        osc.start()
        oscillators.push(osc)
      })

      // High frequency content for brightness
      if (brightness.value > 0.3) {
        const harmonic = audioContext.createOscillator()
        harmonic.type = 'sine'
        harmonic.frequency.value = freq * 2
        const harmGain = audioContext.createGain()
        harmGain.gain.value = brightness.value * 0.3
        harmonic.connect(harmGain)
        harmGain.connect(gainNode)
        harmonic.start()
        oscillators.push(harmonic)
      }
      break
    }

    case 'organ': {
      // Drawbar organ - multiple harmonics
      const drawbars = [1, 2, 3, 4, 6, 8]
      const levels = [1, 0.5, 0.3, 0.25, 0.2, 0.15]
      drawbars.forEach((mult, i) => {
        const osc = audioContext!.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = freq * mult
        const oscGain = audioContext!.createGain()
        oscGain.gain.value = levels[i]
        osc.connect(oscGain)
        oscGain.connect(gainNode)
        osc.start()
        oscillators.push(osc)
      })
      break
    }

    case 'pluck': {
      // Karplus-Strong style - noise burst through filter
      const bufferSize = audioContext.sampleRate / freq
      const buffer = audioContext.createBuffer(1, Math.ceil(bufferSize), audioContext.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1
      }

      const noise = audioContext.createBufferSource()
      noise.buffer = buffer

      filterNode = audioContext.createBiquadFilter()
      filterNode.type = 'lowpass'
      filterNode.frequency.value = freq * (2 + brightness.value * 8)
      filterNode.Q.value = 0.5

      // Decay filter for damping
      filterNode.frequency.setValueAtTime(filterNode.frequency.value, now)
      filterNode.frequency.exponentialRampToValueAtTime(
        Math.max(20, freq * (1 - damping.value)),
        now + 0.5 + (1 - damping.value)
      )

      noise.connect(filterNode)
      filterNode.connect(gainNode)
      noise.start()

      // Also add a sine for pitch definition
      const osc = audioContext.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const sineGain = audioContext.createGain()
      sineGain.gain.setValueAtTime(0.3, now)
      sineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc.connect(sineGain)
      sineGain.connect(gainNode)
      osc.start()
      oscillators.push(osc)
      break
    }

    case 'pad': {
      // Multiple detuned saw/triangle oscillators
      const numVoices = voices.value
      const detuneAmount = detune.value
      for (let i = 0; i < numVoices; i++) {
        const osc = audioContext.createOscillator()
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle'
        const detuneOffset = ((i - (numVoices - 1) / 2) / numVoices) * detuneAmount
        osc.detune.value = detuneOffset
        osc.frequency.value = freq
        const oscGain = audioContext.createGain()
        oscGain.gain.value = 1 / numVoices
        osc.connect(oscGain)
        oscGain.connect(gainNode)
        osc.start()
        oscillators.push(osc)
      }

      // Gentle lowpass
      filterNode = audioContext.createBiquadFilter()
      filterNode.type = 'lowpass'
      filterNode.frequency.value = 3000
      filterNode.Q.value = 0.5
      // Reconnect through filter
      gainNode.disconnect()
      gainNode.connect(filterNode)
      filterNode.connect(masterGain!)
      break
    }
  }

  // Connect to master (unless pad which already connected through filter)
  if (instrument.value !== 'pad') {
    gainNode.connect(masterGain!)
  }

  // Apply ADSR envelope
  const peakGain = velGain * dbToGain(volume.value)
  const sustainLevel = peakGain * sustain.value

  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(peakGain, now + attack.value)
  gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attack.value + decay.value)

  return { oscillators, gainNode, filterNode }
}

// Note on
function noteOn(note: number, velocity: number) {
  // Stop existing voice for this note
  noteOff(note)

  try {
    const voice = createVoice(note, velocity)
    activeVoices.set(note, voice)
  } catch (e) {
    console.error('Failed to create voice:', e)
  }
}

// Note off
function noteOff(note: number) {
  const voice = activeVoices.get(note)
  if (!voice || !audioContext) return

  // Clear any pending release
  if (voice.releaseTimeout) {
    clearTimeout(voice.releaseTimeout)
  }

  const now = audioContext.currentTime
  const releaseTime = release.value

  // Release envelope
  voice.gainNode.gain.cancelScheduledValues(now)
  voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now)
  voice.gainNode.gain.linearRampToValueAtTime(0, now + releaseTime)

  // Schedule cleanup
  voice.releaseTimeout = setTimeout(() => {
    voice.oscillators.forEach(osc => {
      try {
        osc.stop()
        osc.disconnect()
      } catch { /* ignore */ }
    })
    voice.gainNode.disconnect()
    if (voice.filterNode) voice.filterNode.disconnect()
    activeVoices.delete(note)
  }, (releaseTime + 0.1) * 1000)
}

// Stop all voices
function stopAll() {
  activeVoices.forEach((_, note) => {
    noteOff(note)
  })
}

// Watch gate changes
watch(currentGate, (gate, oldGate) => {
  if (gate && !oldGate) {
    noteOn(currentNote.value, currentVelocity.value)
  } else if (!gate && oldGate) {
    noteOff(currentNote.value)
  }
})

// Watch volume changes
watch(volume, (vol) => {
  if (masterGain) {
    masterGain.gain.value = dbToGain(vol)
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopAll()
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
})
</script>

<template>
  <div
    class="synth-node"
    :class="{ selected: props.selected, collapsed: isCollapsed }"
  >
    <!-- Input Handles -->
    <div class="handles-column handles-left">
      <div
        v-for="input in inputs"
        :key="input.id"
        class="handle-slot"
        @mouseenter="hoveredPort = `in-${input.id}`"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="input.id"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor(input.type) }"
          class="port-handle"
        />
        <div
          class="port-label port-label-left"
          :class="{ visible: hoveredPort === `in-${input.id}` || props.selected }"
        >
          <span class="label-text">{{ input.label }}</span>
        </div>
      </div>
    </div>

    <!-- Output Handles -->
    <div class="handles-column handles-right">
      <div
        v-for="output in outputs"
        :key="output.id"
        class="handle-slot"
        @mouseenter="hoveredPort = `out-${output.id}`"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="output.id"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor(output.type) }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === `out-${output.id}` || props.selected }"
        >
          <span class="label-text">{{ output.label }}</span>
        </div>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <Music
          :size="14"
          class="header-icon"
        />
        <span class="node-title">Synth</span>
        <button
          class="node-collapse-btn"
          @click.stop="toggleCollapse"
        >
          <ChevronDown
            v-if="!isCollapsed"
            :size="14"
          />
          <ChevronRight
            v-else
            :size="14"
          />
        </button>
      </div>

      <!-- Body -->
      <div
        v-if="!isCollapsed"
        class="node-body"
      >
        <!-- Instrument Selector -->
        <div class="control-row instrument-row">
          <label>Instrument</label>
          <select
            v-model="instrument"
            @mousedown.stop
          >
            <option value="sine">
              Sine
            </option>
            <option value="moog">
              Moog Bass
            </option>
            <option value="piano">
              Piano
            </option>
            <option value="organ">
              Organ
            </option>
            <option value="pluck">
              Pluck
            </option>
            <option value="pad">
              Pad
            </option>
          </select>
        </div>

        <!-- Dynamic Controls with Knobs -->
        <div
          class="knobs-grid"
          @mousedown.stop
        >
          <!-- Volume -->
          <RotaryKnob
            v-if="visibleControls.includes('volume')"
            v-model="volume"
            :min="-60"
            :max="0"
            :step="1"
            label="Vol"
            size="small"
            accent-color="#f59e0b"
            :value-format="(v: number) => `${v}dB`"
          />

          <!-- Attack -->
          <RotaryKnob
            v-if="visibleControls.includes('attack')"
            v-model="attack"
            :min="0.001"
            :max="2"
            :step="0.001"
            label="Atk"
            size="small"
            accent-color="#f59e0b"
            :value-format="(v: number) => `${v.toFixed(2)}s`"
          />

          <!-- Decay -->
          <RotaryKnob
            v-if="visibleControls.includes('decay')"
            v-model="decay"
            :min="0.001"
            :max="2"
            :step="0.001"
            label="Dec"
            size="small"
            accent-color="#f59e0b"
            :value-format="(v: number) => `${v.toFixed(2)}s`"
          />

          <!-- Sustain -->
          <RotaryKnob
            v-if="visibleControls.includes('sustain')"
            v-model="sustain"
            :min="0"
            :max="1"
            :step="0.01"
            label="Sus"
            size="small"
            accent-color="#f59e0b"
            :value-format="(v: number) => `${Math.round(v * 100)}%`"
          />

          <!-- Release -->
          <RotaryKnob
            v-if="visibleControls.includes('release')"
            v-model="release"
            :min="0.001"
            :max="5"
            :step="0.001"
            label="Rel"
            size="small"
            accent-color="#f59e0b"
            :value-format="(v: number) => `${v.toFixed(2)}s`"
          />

          <!-- Cutoff (Moog) -->
          <RotaryKnob
            v-if="visibleControls.includes('cutoff')"
            v-model="cutoff"
            :min="20"
            :max="20000"
            :step="10"
            label="Cut"
            size="small"
            accent-color="#ec4899"
            :value-format="(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`"
          />

          <!-- Resonance (Moog) -->
          <RotaryKnob
            v-if="visibleControls.includes('resonance')"
            v-model="resonance"
            :min="0.1"
            :max="30"
            :step="0.1"
            label="Res"
            size="small"
            accent-color="#ec4899"
            :value-format="(v: number) => v.toFixed(1)"
          />

          <!-- Filter Env (Moog) -->
          <RotaryKnob
            v-if="visibleControls.includes('filterEnv')"
            v-model="filterEnv"
            :min="0"
            :max="1"
            :step="0.01"
            label="FEnv"
            size="small"
            accent-color="#ec4899"
            :value-format="(v: number) => `${Math.round(v * 100)}%`"
          />

          <!-- Brightness (Piano/Pluck) -->
          <RotaryKnob
            v-if="visibleControls.includes('brightness')"
            v-model="brightness"
            :min="0"
            :max="1"
            :step="0.01"
            label="Bright"
            size="small"
            accent-color="#22c55e"
            :value-format="(v: number) => `${Math.round(v * 100)}%`"
          />

          <!-- Damping (Pluck) -->
          <RotaryKnob
            v-if="visibleControls.includes('damping')"
            v-model="damping"
            :min="0"
            :max="1"
            :step="0.01"
            label="Damp"
            size="small"
            accent-color="#22c55e"
            :value-format="(v: number) => `${Math.round(v * 100)}%`"
          />

          <!-- Detune (Pad) -->
          <RotaryKnob
            v-if="visibleControls.includes('detune')"
            v-model="detune"
            :min="0"
            :max="50"
            :step="1"
            label="Detune"
            size="small"
            accent-color="#8b5cf6"
            :value-format="(v: number) => `${v}c`"
          />

          <!-- Voices (Pad) -->
          <RotaryKnob
            v-if="visibleControls.includes('voices')"
            v-model="voices"
            :min="1"
            :max="8"
            :step="1"
            label="Voices"
            size="small"
            accent-color="#8b5cf6"
            :value-format="(v: number) => `${v}`"
          />
        </div>

        <!-- Status indicator -->
        <div class="status-row">
          <span class="status-label">Note:</span>
          <span class="status-value">{{ currentNote }}</span>
          <span
            class="gate-indicator"
            :class="{ active: currentGate }"
          />
        </div>
      </div>

      <!-- Collapsed info -->
      <div
        v-else
        class="collapsed-info"
      >
        {{ instrumentNames[instrument] }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.synth-node {
  position: relative;
  min-width: 200px;
  max-width: 220px;
  font-family: var(--font-mono);
}

.node-content {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.synth-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.synth-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

/* Handle columns */
.handles-column {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  z-index: 10;
}

.handles-left {
  left: 0;
}

.handles-right {
  right: 0;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

.port-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
  background: var(--color-neutral-0);
  padding: 2px 6px;
  border: 1px solid var(--color-neutral-200);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 1000;
}

.port-label.visible {
  opacity: 1;
}

.port-label-left {
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.port-label-right {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}

/* Header */
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  border-left: 3px solid var(--color-neutral-400);
}

.header-icon {
  color: #f59e0b;
}

.node-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
}

.node-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
}

.node-collapse-btn:hover {
  color: var(--color-neutral-600);
}

/* Body */
.node-body {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Instrument selector */
.instrument-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.instrument-row label {
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

.instrument-row select {
  flex: 1;
  padding: 4px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  color: var(--color-neutral-700);
  cursor: pointer;
}

.instrument-row select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

/* Controls grid */
.controls-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

/* Knobs grid - compact multi-column layout */
.knobs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px 4px;
  justify-items: center;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.control-item label {
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

.control-item input[type="range"] {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-neutral-200);
  cursor: pointer;
}

.control-item input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--color-primary-500);
  cursor: pointer;
}

.control-item .value {
  font-size: 9px;
  color: var(--color-neutral-600);
  text-align: right;
}

/* Status row */
.status-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-neutral-100);
}

.status-label {
  font-size: 9px;
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

.status-value {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-700);
  background: var(--color-neutral-100);
  padding: 2px 6px;
}

.gate-indicator {
  width: 8px;
  height: 8px;
  background: var(--color-neutral-300);
  margin-left: auto;
}

.gate-indicator.active {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

/* Collapsed info */
.collapsed-info {
  padding: var(--space-2) var(--space-3);
  font-size: 11px;
  color: var(--color-neutral-600);
}

/* Handle styles */
:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
  position: absolute !important;
}

:deep(.port-handle:hover) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__handle-left) {
  left: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle-right) {
  right: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
</style>
