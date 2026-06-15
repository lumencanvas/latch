import { describe, it, expect } from 'vitest'
import type { NodeDefinition } from '@/stores/nodes'
import { serialNode } from '@/registry/connectivity/serial'
import { midiInputNode } from '@/registry/connectivity/midi-input'
import { midiOutputNode } from '@/registry/connectivity/midi-output'
import { bleNode } from '@/registry/connectivity/ble'
import { bleDeviceNode } from '@/registry/connectivity/ble-device'
import { bleScannerNode } from '@/registry/connectivity/ble-scanner'
import { bleCharacteristicNode } from '@/registry/connectivity/ble-characteristic'
import { llmNode } from '@/registry/ai/llm'
import { webcamNode } from '@/registry/visual/webcam'
import { oscNode } from '@/registry/connectivity/osc'

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
  ]

  it.each(cases)('%s requires %s', (_id, node, requirement) => {
    expect(node.requires).toContain(requirement)
  })

  it('does not over-tag nodes that work everywhere (OSC is bridge-based)', () => {
    // OSC runs over a WebSocket bridge on every platform — no hardware gate.
    expect(oscNode.requires).toBeUndefined()
  })
})
