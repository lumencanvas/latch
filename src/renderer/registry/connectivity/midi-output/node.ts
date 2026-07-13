import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { midiOutputs, midiState, midiNoteOffTimeouts, getCached, setCached } from '../shared'

const definition: NodeDefinition = {
  id: 'midi-output',
  name: 'MIDI Output',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Send MIDI messages to devices',
  icon: 'music',
  platforms: ['web', 'electron'],
  requires: ['midi'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'trigger', type: 'trigger', label: 'Send' },
  ],
  outputs: [
    { id: 'connected', type: 'boolean', label: 'Connected' },
  ],
  controls: [
    { id: 'channel', type: 'number', label: 'Channel', default: 0, props: { min: 0, max: 15 } },
  ],
  tags: ['midi', 'output', 'send', 'cc', 'notes', 'music', 'hardware'],
  info: {
    overview: 'Sends MIDI note messages to connected hardware or virtual MIDI devices. Provide a note number and velocity, then trigger the send. Useful for controlling synthesizers, lighting rigs, or any MIDI-compatible equipment from a flow.',
    tips: [
      'Connect a trigger node to control the exact timing of note events.',
      'Use velocity values between 0 and 127 to control note dynamics.',
      'Combine with a MIDI Input node to create MIDI filtering or remapping flows.',
    ],
    pairsWith: ['midi-input', 'trigger', 'expression', 'oscillator', 'function'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const note = ctx.inputs.get('note') as number | null
  const velocity = (ctx.inputs.get('velocity') as number) ?? 0.8
  const channel = (ctx.controls.get('channel') as number) ?? 0
  const trigger = ctx.inputs.get('trigger') as boolean | undefined

  const outputs = new Map<string, unknown>()

  // Request MIDI access if not already done
  const midiKey = `${ctx.nodeId}:midi`
  if (!midiOutputs.has(midiKey) && navigator.requestMIDIAccess) {
    try {
      const access = await navigator.requestMIDIAccess()

      // Get first available output
      const outputList = Array.from(access.outputs.values())
      if (outputList.length > 0) {
        const output = outputList[0]
        midiOutputs.set(midiKey, output)
        setCached(midiState, `${ctx.nodeId}:connected`, true)
      }
    } catch (error) {
      console.error('[MIDI] Access denied:', error)
      setCached(midiState, `${ctx.nodeId}:connected`, false)
    }
  }

  const output = midiOutputs.get(midiKey)

  // Send note if triggered
  if (trigger && note !== null && output) {
    const velocityByte = Math.round(velocity * 127)
    const noteOnStatus = 0x90 | channel
    const noteOffStatus = 0x80 | channel

    // Send Note On
    output.send([noteOnStatus, note, velocityByte])

    // Schedule Note Off after 100ms - track for cleanup
    const timeoutId = setTimeout(() => {
      output.send([noteOffStatus, note, 0])
      // Remove from tracking after execution
      const timeouts = midiNoteOffTimeouts.get(ctx.nodeId)
      if (timeouts) {
        const idx = timeouts.indexOf(timeoutId)
        if (idx >= 0) timeouts.splice(idx, 1)
      }
    }, 100)

    // Track the timeout for cleanup
    if (!midiNoteOffTimeouts.has(ctx.nodeId)) {
      midiNoteOffTimeouts.set(ctx.nodeId, [])
    }
    midiNoteOffTimeouts.get(ctx.nodeId)!.push(timeoutId)
  }

  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))

  return outputs
}

export default defineNode({ definition, executor })
