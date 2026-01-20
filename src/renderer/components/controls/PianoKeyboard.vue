<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  numKeys?: number        // 25, 49, 61, 88
  startOctave?: number    // 0-8
  octaveShift?: number    // Shift keyboard mapping by octaves (-4 to +4)
  includeBlackKeys?: boolean
  velocitySensitive?: boolean
  width?: number
  height?: number
  darkMode?: boolean      // For control panel view (darker style)
}>(), {
  numKeys: 25,
  startOctave: 3,
  octaveShift: 0,
  includeBlackKeys: true,
  velocitySensitive: true,
  width: 400,
  height: 120,
  darkMode: false,
})

const emit = defineEmits<{
  'note-on': [midiNote: number, velocity: number]
  'note-off': [midiNote: number]
}>()

// Track currently pressed keys
const activeKeys = ref<Set<number>>(new Set())

// Computer keyboard to MIDI mapping (relative semitones from base)
const keyboardMapping: Record<string, number> = {
  // Lower octave
  'z': 0,  'a': 0,  // C
  's': 1,  // C#
  'x': 2,  // D
  'd': 3,  // D#
  'c': 4,  // E
  'v': 5,  // F
  'g': 6,  // F#
  'b': 7,  // G
  'h': 8,  // G#
  'n': 9,  // A
  'j': 10, // A#
  'm': 11, // B
  ',': 12, // C (next octave)
  'l': 13, // C#
  '.': 14, // D
  ';': 15, // D#
  '/': 16, // E

  // Upper octave
  'q': 12, // C
  '2': 13, // C#
  'w': 14, // D
  '3': 15, // D#
  'e': 16, // E
  'r': 17, // F
  '5': 18, // F#
  't': 19, // G
  '6': 20, // G#
  'y': 21, // A
  '7': 22, // A#
  'u': 23, // B
  'i': 24, // C (next octave)
  '9': 25, // C#
  'o': 26, // D
  '0': 27, // D#
  'p': 28, // E
}

// Track which computer keys are currently pressed
const pressedComputerKeys = ref<Set<string>>(new Set())

// Base note for keyboard mapping (affected by octaveShift)
const mappingBaseNote = computed(() => {
  return props.startOctave * 12 + (props.octaveShift * 12)
})

// White key pattern within an octave: C, D, E, F, G, A, B
const whiteKeyNotes = [0, 2, 4, 5, 7, 9, 11]
// Black key pattern: C#, D#, F#, G#, A#
const blackKeyNotes = [1, 3, 6, 8, 10]

// Calculate white and black keys based on numKeys
const keyLayout = computed(() => {
  const keys: Array<{
    type: 'white' | 'black'
    midiNote: number
    whiteKeyIndex: number
  }> = []

  const startNote = props.startOctave * 12
  let whiteKeyCount = 0
  let noteIndex = 0

  while (keys.filter(k => k.type === 'white').length < props.numKeys) {
    const octaveNote = noteIndex % 12
    const currentMidi = startNote + noteIndex

    if (currentMidi > 127) break

    const isWhiteKey = whiteKeyNotes.includes(octaveNote)
    const isBlackKey = blackKeyNotes.includes(octaveNote)

    if (isWhiteKey) {
      keys.push({
        type: 'white',
        midiNote: currentMidi,
        whiteKeyIndex: whiteKeyCount,
      })
      whiteKeyCount++
    } else if (isBlackKey && props.includeBlackKeys) {
      keys.push({
        type: 'black',
        midiNote: currentMidi,
        whiteKeyIndex: whiteKeyCount - 1,
      })
    }

    noteIndex++
  }

  return keys
})

const whiteKeys = computed(() => keyLayout.value.filter(k => k.type === 'white'))
const blackKeys = computed(() => keyLayout.value.filter(k => k.type === 'black'))

const whiteKeyWidth = computed(() => props.width / whiteKeys.value.length)
const blackKeyWidth = computed(() => whiteKeyWidth.value * 0.6)

function getNoteName(midiNote: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midiNote / 12) - 1
  const note = names[midiNote % 12]
  return `${note}${octave}`
}

function isC(midiNote: number): boolean {
  return midiNote % 12 === 0
}

// Get the computer key label for a MIDI note
function getComputerKeyLabel(midiNote: number): string {
  const noteOffset = midiNote - mappingBaseNote.value

  for (const [key, offset] of Object.entries(keyboardMapping)) {
    if (offset === noteOffset) {
      return key.toUpperCase()
    }
  }
  return ''
}

function calculateVelocity(event: MouseEvent, keyElement: HTMLElement): number {
  if (!props.velocitySensitive) return 100

  const rect = keyElement.getBoundingClientRect()
  const relativeY = (event.clientY - rect.top) / rect.height
  const velocity = Math.round(40 + relativeY * 87)
  return Math.min(127, Math.max(1, velocity))
}

function handleKeyDown(event: MouseEvent, midiNote: number) {
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  const velocity = calculateVelocity(event, target)

  activeKeys.value.add(midiNote)
  emit('note-on', midiNote, velocity)
}

function handleKeyUp(midiNote: number) {
  if (activeKeys.value.has(midiNote)) {
    activeKeys.value.delete(midiNote)
    emit('note-off', midiNote)
  }
}

function handleKeyLeave(midiNote: number) {
  handleKeyUp(midiNote)
}

function handleGlobalMouseUp() {
  for (const note of activeKeys.value) {
    const noteOffset = note - mappingBaseNote.value
    let heldByKeyboard = false
    for (const [key, offset] of Object.entries(keyboardMapping)) {
      if (offset === noteOffset && pressedComputerKeys.value.has(key)) {
        heldByKeyboard = true
        break
      }
    }
    if (!heldByKeyboard) {
      emit('note-off', note)
      activeKeys.value.delete(note)
    }
  }
}

function handleComputerKeyDown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()

  if (pressedComputerKeys.value.has(key)) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

  const noteOffset = keyboardMapping[key]
  if (noteOffset === undefined) return

  const midiNote = mappingBaseNote.value + noteOffset

  // Check if note is within our keyboard range
  const minNote = Math.min(...keyLayout.value.map(k => k.midiNote))
  const maxNote = Math.max(...keyLayout.value.map(k => k.midiNote))
  if (midiNote < minNote || midiNote > maxNote) return

  if (!props.includeBlackKeys && blackKeyNotes.includes(midiNote % 12)) return

  event.preventDefault()
  pressedComputerKeys.value.add(key)
  activeKeys.value.add(midiNote)
  emit('note-on', midiNote, 100)
}

function handleComputerKeyUp(event: KeyboardEvent) {
  const key = event.key.toLowerCase()

  if (!pressedComputerKeys.value.has(key)) return

  const noteOffset = keyboardMapping[key]
  if (noteOffset === undefined) return

  const midiNote = mappingBaseNote.value + noteOffset

  pressedComputerKeys.value.delete(key)

  if (activeKeys.value.has(midiNote)) {
    activeKeys.value.delete(midiNote)
    emit('note-off', midiNote)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleComputerKeyDown)
  window.addEventListener('keyup', handleComputerKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleComputerKeyDown)
  window.removeEventListener('keyup', handleComputerKeyUp)

  for (const note of activeKeys.value) {
    emit('note-off', note)
  }
})
</script>

<template>
  <div
    class="piano-keyboard"
    :class="{ 'dark-mode': darkMode }"
    :style="{
      width: width + 'px',
      height: height + 'px',
    }"
    @mouseleave="handleGlobalMouseUp"
    @mouseup="handleGlobalMouseUp"
  >
    <!-- White keys layer -->
    <div class="white-keys-layer">
      <div
        v-for="key in whiteKeys"
        :key="key.midiNote"
        class="white-key"
        :class="{
          active: activeKeys.has(key.midiNote),
        }"
        :style="{
          width: whiteKeyWidth + 'px',
          left: (key.whiteKeyIndex * whiteKeyWidth) + 'px',
        }"
        @mousedown="handleKeyDown($event, key.midiNote)"
        @mouseup="handleKeyUp(key.midiNote)"
        @mouseleave="handleKeyLeave(key.midiNote)"
      >
        <div class="key-labels">
          <span
            v-if="isC(key.midiNote)"
            class="note-label"
          >
            {{ getNoteName(key.midiNote) }}
          </span>
          <span
            v-if="getComputerKeyLabel(key.midiNote)"
            class="computer-key-label"
          >
            {{ getComputerKeyLabel(key.midiNote) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Black keys layer -->
    <div
      v-if="includeBlackKeys"
      class="black-keys-layer"
    >
      <div
        v-for="key in blackKeys"
        :key="key.midiNote"
        class="black-key"
        :class="{
          active: activeKeys.has(key.midiNote),
        }"
        :style="{
          width: blackKeyWidth + 'px',
          left: ((key.whiteKeyIndex + 1) * whiteKeyWidth - blackKeyWidth / 2) + 'px',
          height: (height * 0.58) + 'px',
        }"
        @mousedown.stop="handleKeyDown($event, key.midiNote)"
        @mouseup.stop="handleKeyUp(key.midiNote)"
        @mouseleave="handleKeyLeave(key.midiNote)"
      >
        <span
          v-if="getComputerKeyLabel(key.midiNote)"
          class="computer-key-label black-key-label"
        >
          {{ getComputerKeyLabel(key.midiNote) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.piano-keyboard {
  position: relative;
  background: #6b7280;
  padding: 6px;
  overflow: hidden;
  user-select: none;
}

.white-keys-layer {
  position: relative;
  height: 100%;
  display: flex;
  background: #d1d5db;
}

/* Flat cream/off-white keys - no rounded corners */
.white-key {
  position: absolute;
  height: 100%;
  background: #f5f5f0;
  border-right: 1px solid #d1d5db;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 6px;
}

.white-key:hover {
  background: #fafaf5;
}

.white-key.active {
  background: #22c55e;
}

.black-keys-layer {
  position: absolute;
  top: 6px;
  left: 6px;
  right: 6px;
  pointer-events: none;
}

/* Flat dark slate black keys - no rounded corners */
.black-key {
  position: absolute;
  background: #4b5563;
  cursor: pointer;
  pointer-events: auto;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 4px;
}

.black-key:hover {
  background: #6b7280;
}

.black-key.active {
  background: #166534;
}

.key-labels {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.note-label {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
}

.white-key.active .note-label {
  color: #fff;
}

.computer-key-label {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 8px;
  font-weight: 600;
  color: #9ca3af;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 4px;
  min-width: 14px;
  text-align: center;
}

.white-key.active .computer-key-label {
  color: #fff;
  background: rgba(0, 0, 0, 0.15);
}

.black-key-label {
  font-size: 7px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.1);
}

.black-key.active .black-key-label {
  color: #fff;
  background: rgba(0, 0, 0, 0.2);
}

/* Dark mode for control panel */
.dark-mode {
  background: #1f2937;
}

.dark-mode .white-keys-layer {
  background: #111827;
}

.dark-mode .white-key {
  background: #374151;
  border-right-color: #1f2937;
}

.dark-mode .white-key:hover {
  background: #4b5563;
}

.dark-mode .white-key.active {
  background: #22c55e;
}

.dark-mode .black-key {
  background: #111827;
}

.dark-mode .black-key:hover {
  background: #1f2937;
}

.dark-mode .black-key.active {
  background: #166534;
}

.dark-mode .note-label {
  color: #6b7280;
}

.dark-mode .computer-key-label {
  color: #6b7280;
  background: rgba(255, 255, 255, 0.05);
}

.dark-mode .white-key.active .computer-key-label {
  color: #fff;
  background: rgba(0, 0, 0, 0.2);
}

.dark-mode .black-key-label {
  color: #4b5563;
  background: transparent;
}
</style>
