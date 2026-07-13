import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { midiInputs, midiState, getCached, setCached } from '../shared'

const definition: NodeDefinition = {
  id: 'midi-input',
  name: 'MIDI Input',
  version: '1.0.0',
  category: 'inputs',
  description: 'Receive MIDI messages from devices',
  icon: 'music',
  platforms: ['web', 'electron'],
  requires: ['midi'],
  inputs: [],
  outputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'noteOn', type: 'boolean', label: 'Note On' },
    { id: 'cc', type: 'number', label: 'CC Number' },
    { id: 'ccValue', type: 'number', label: 'CC Value' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
  ],
  controls: [
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
    { id: 'channel', type: 'number', label: 'Channel (-1=all)', default: -1, props: { min: -1, max: 15 } },
  ],
  tags: ['midi', 'input', 'controller', 'cc', 'notes', 'music', 'hardware'],
  info: {
    overview: 'Receives MIDI messages from connected hardware or virtual MIDI devices. Outputs include note number, velocity, note on/off state, and control change values. Set the channel to -1 to listen on all channels at once.',
    tips: [
      'Set the channel to -1 to receive messages from all MIDI channels simultaneously.',
      'Use the CC Value output to map hardware knobs and faders to parameters in your flow.',
      'Pair with a MIDI Output node to build MIDI processing chains.',
    ],
    pairsWith: ['midi-output', 'gain', 'oscillator', 'expression', 'monitor'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const channel = (ctx.controls.get('channel') as number) ?? -1 // -1 = all channels

  const outputs = new Map<string, unknown>()

  if (!enabled) {
    outputs.set('note', null)
    outputs.set('velocity', 0)
    outputs.set('cc', null)
    outputs.set('ccValue', 0)
    outputs.set('connected', false)
    return outputs
  }

  // Request MIDI access if not already done
  const midiKey = `${ctx.nodeId}:midi`
  if (!midiInputs.has(midiKey) && navigator.requestMIDIAccess) {
    try {
      const access = await navigator.requestMIDIAccess()

      // Get first available input
      const inputs = Array.from(access.inputs.values())
      if (inputs.length > 0) {
        const input = inputs[0]
        midiInputs.set(midiKey, input)

        input.onmidimessage = (event: MIDIMessageEvent) => {
          const [status, data1, data2] = event.data!
          const messageChannel = status & 0x0f
          const messageType = status & 0xf0

          // Filter by channel if specified
          if (channel !== -1 && messageChannel !== channel) return

          if (messageType === 0x90 && data2 > 0) {
            // Note On
            setCached(midiState, `${ctx.nodeId}:note`, data1)
            setCached(midiState, `${ctx.nodeId}:velocity`, data2 / 127)
            setCached(midiState, `${ctx.nodeId}:noteOn`, true)
          } else if (messageType === 0x80 || (messageType === 0x90 && data2 === 0)) {
            // Note Off
            setCached(midiState, `${ctx.nodeId}:noteOn`, false)
            setCached(midiState, `${ctx.nodeId}:velocity`, 0)
          } else if (messageType === 0xb0) {
            // Control Change
            setCached(midiState, `${ctx.nodeId}:cc`, data1)
            setCached(midiState, `${ctx.nodeId}:ccValue`, data2 / 127)
          }
        }

        setCached(midiState, `${ctx.nodeId}:connected`, true)
      }
    } catch (error) {
      console.error('[MIDI] Access denied:', error)
      setCached(midiState, `${ctx.nodeId}:connected`, false)
    }
  }

  outputs.set('note', getCached(`${ctx.nodeId}:note`, null))
  outputs.set('velocity', getCached(`${ctx.nodeId}:velocity`, 0))
  outputs.set('noteOn', getCached(`${ctx.nodeId}:noteOn`, false))
  outputs.set('cc', getCached(`${ctx.nodeId}:cc`, null))
  outputs.set('ccValue', getCached(`${ctx.nodeId}:ccValue`, 0))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))

  return outputs
}

export default defineNode({ definition, executor })
