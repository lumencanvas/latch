import { describe, it, expect } from 'vitest'
import type { NodeDefinition } from '@/stores/nodes'
import midiInputSpec from '@/registry/connectivity/midi-input/node'
const midiInputNode = midiInputSpec.definition
import serialSpec from '@/registry/connectivity/serial/node'
import midiOutputSpec from '@/registry/connectivity/midi-output/node'
import bleSpec from '@/registry/connectivity/ble/node'
import bleDeviceSpec from '@/registry/connectivity/ble-device/node'
import bleScannerSpec from '@/registry/connectivity/ble-scanner/node'
import bleCharacteristicSpec from '@/registry/connectivity/ble-characteristic/node'
import oscSpec from '@/registry/connectivity/osc/node'
const serialNode = serialSpec.definition
const midiOutputNode = midiOutputSpec.definition
const bleNode = bleSpec.definition
const bleDeviceNode = bleDeviceSpec.definition
const bleScannerNode = bleScannerSpec.definition
const bleCharacteristicNode = bleCharacteristicSpec.definition
const oscNode = oscSpec.definition
import { llmNode } from '@/registry/ai/llm/node'
import webcamSpec from '@/registry/visual/webcam/node'
const webcamNode = webcamSpec.definition
import audioInputSpec from '@/registry/inputs/audio-input/node'
const audioInputNode = audioInputSpec.definition
import speechRecognitionSpec from '@/registry/ai/speech-recognition/node'
const speechRecognitionNode = speechRecognitionSpec.definition
import mediapipeAudioSpec from '@/registry/ai/mediapipe-audio/node'
const mediapipeAudioNode = mediapipeAudioSpec.definition

/**
 * Hardware/runtime-gated nodes declare an abstract `requires` capability so
 * BaseNode can resolve it per-platform (native-or-web duality) and show an
 * "unavailable here" badge. This test pins the tagging so a node can't silently
 * lose its gate.
 */
describe('node platform requirements', () => {
  const cases: Array<[string, NodeDefinition, string]> = [
    ['serial', serialNode, 'serial'],
    ['midi-input', midiInputNode, 'midi'],
    ['midi-output', midiOutputNode, 'midi'],
    ['ble', bleNode, 'bluetooth'],
    ['ble-device', bleDeviceNode, 'bluetooth'],
    ['ble-scanner', bleScannerNode, 'bluetooth'],
    ['ble-characteristic', bleCharacteristicNode, 'bluetooth'],
    ['llm', llmNode, 'webgpu'],
    ['webcam', webcamNode, 'camera'],
    // audio-input self-captures the mic (getUserMedia), same gate as webcam.
    ['audio-input', audioInputNode, 'camera'],
  ]

  it.each(cases)('%s requires %s', (_id, node, requirement) => {
    expect(node.requires).toContain(requirement)
  })

  it('does not over-tag nodes that work everywhere (OSC is bridge-based)', () => {
    // OSC runs over a WebSocket bridge on every platform — no hardware gate.
    expect(oscNode.requires).toBeUndefined()
  })

  it('does not tag nodes that consume an input rather than self-capture', () => {
    // These take an `audio` input (typically from audio-input) and never call
    // getUserMedia themselves, so the upstream node owns the capability gate.
    expect(speechRecognitionNode.requires).toBeUndefined()
    expect(mediapipeAudioNode.requires).toBeUndefined()
  })
})
