/**
 * Device Enumeration Composable
 *
 * Provides reactive device lists for audio and video inputs/outputs.
 * Used by node controls to populate device selection dropdowns.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { audioManager } from '@/services/audio/AudioManager'
import { webcamCapture } from '@/services/visual/WebcamCapture'

export interface DeviceOption {
  value: string
  label: string
}

export type DeviceType = 'audio-input' | 'audio-output' | 'video-input'

// Shared reactive state for all components
const audioInputDevices = ref<DeviceOption[]>([{ value: 'default', label: 'Default Microphone' }])
const audioOutputDevices = ref<DeviceOption[]>([{ value: 'default', label: 'Default Speakers' }])
const videoInputDevices = ref<DeviceOption[]>([{ value: 'default', label: 'Default Camera' }])

let isInitialized = false
let unsubscribeAudio: (() => void) | null = null
let unsubscribeVideo: (() => void) | null = null

async function refreshDevices() {
  try {
    // Request permissions to get device labels
    // This needs user gesture, so we handle errors gracefully
    const devices = await navigator.mediaDevices.enumerateDevices()

    // Audio inputs
    const audioInputs = devices.filter(d => d.kind === 'audioinput')
    if (audioInputs.length > 0) {
      audioInputDevices.value = [
        { value: 'default', label: 'Default Microphone' },
        ...audioInputs.map(d => ({
          value: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        })),
      ]
    }

    // Audio outputs
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput')
    if (audioOutputs.length > 0) {
      audioOutputDevices.value = [
        { value: 'default', label: 'Default Speakers' },
        ...audioOutputs.map(d => ({
          value: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
        })),
      ]
    }

    // Video inputs
    const videoInputs = devices.filter(d => d.kind === 'videoinput')
    if (videoInputs.length > 0) {
      videoInputDevices.value = [
        { value: 'default', label: 'Default Camera' },
        ...videoInputs.map(d => ({
          value: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
        })),
      ]
    }
  } catch (error) {
    console.warn('[DeviceEnumeration] Could not enumerate devices:', error)
  }
}

function initialize() {
  if (isInitialized) return
  isInitialized = true

  // Initial refresh
  refreshDevices()

  // Listen for device changes
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
  }

  // Also subscribe to service updates
  unsubscribeAudio = audioManager.subscribe(() => {
    const state = audioManager.getState()
    if (state.inputDevices.length > 0) {
      audioInputDevices.value = [
        { value: 'default', label: 'Default Microphone' },
        ...state.inputDevices.map(d => ({
          value: d.deviceId,
          label: d.label,
        })),
      ]
    }
    if (state.outputDevices.length > 0) {
      audioOutputDevices.value = [
        { value: 'default', label: 'Default Speakers' },
        ...state.outputDevices.map(d => ({
          value: d.deviceId,
          label: d.label,
        })),
      ]
    }
  })

  unsubscribeVideo = webcamCapture.subscribe(() => {
    const state = webcamCapture.getState()
    if (state.devices.length > 0) {
      videoInputDevices.value = [
        { value: 'default', label: 'Default Camera' },
        ...state.devices.map(d => ({
          value: d.deviceId,
          label: d.label,
        })),
      ]
    }
  })
}

export function useDeviceEnumeration() {
  onMounted(() => {
    initialize()
  })

  return {
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    refreshDevices,
  }
}

/**
 * Get device options for a specific device type
 * Can be called without a component context
 */
export function getDeviceOptions(deviceType: DeviceType): DeviceOption[] {
  // Ensure initialized
  if (!isInitialized) {
    initialize()
  }

  switch (deviceType) {
    case 'audio-input':
      return audioInputDevices.value
    case 'audio-output':
      return audioOutputDevices.value
    case 'video-input':
      return videoInputDevices.value
    default:
      return []
  }
}

/**
 * Get reactive device options ref for a specific device type
 */
export function getDeviceOptionsRef(deviceType: DeviceType) {
  // Ensure initialized
  if (!isInitialized) {
    initialize()
  }

  switch (deviceType) {
    case 'audio-input':
      return audioInputDevices
    case 'audio-output':
      return audioOutputDevices
    case 'video-input':
      return videoInputDevices
    default:
      return ref<DeviceOption[]>([])
  }
}
