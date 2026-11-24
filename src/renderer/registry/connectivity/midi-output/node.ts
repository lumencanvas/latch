import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { risingEdge } from '@/engine/trigger'
import { midiOutputs, midiState, midiNoteOffTimeouts, getCached, setCached, type PendingNoteOff } from '../shared'

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
    { id: 'channel', type: 'number', label: 'Channel (0–15)', default: 0, props: { min: 0, max: 15, step: 1 } },
  ],
  tags: ['midi', 'output', 'send', 'cc', 'notes', 'music', 'hardware'],
  info: {
    overview: 'Sends MIDI note messages to connected hardware or virtual MIDI devices. Provide a note number and velocity, then trigger the send. Useful for controlling synthesizers, lighting rigs, or any MIDI-compatible equipment from a flow.',
    tips: [
      'Connect a trigger node to control the exact timing of note events.',
      'Velocity is normalized 0–1 (scaled to MIDI 0–127); note is a MIDI note number 0–127 (60 = middle C).',
      'Channel is zero-based: 0 here is "Channel 1" on most hardware.',
      'Web MIDI is unavailable in Safari — use Chrome, Edge, Firefox or the desktop app.',
      'Combine with a MIDI Input node to create MIDI filtering or remapping flows.',
    ],
    pairsWith: ['midi-input', 'trigger', 'expression', 'oscillator', 'function'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const note = ctx.inputs.get('note')
  const velocity = (ctx.inputs.get('velocity') as number) ?? 0.8
  // Clamp to the MIDI wire ranges: an out-of-range byte makes MIDIOutput.send() THROW (an
  // unwired note — undefined — used to slip past the `!== null` check and do exactly that).
  const channel = Math.max(0, Math.min(15, Math.floor(Number((ctx.controls.get('channel') as number) ?? 0) || 0)))
  // RISING edge only — a held-high trigger must not send a Note On + schedule a Note Off
  // setTimeout every frame (~60/s, leaking timeouts). One note pair per trigger edge.
  const trigger = risingEdge(ctx.nodeId, 'trigger', ctx.inputs.get('trigger'))

  const outputs = new Map<string, unknown>()

  // Request MIDI access if not already done
  const midiKey = `${ctx.nodeId}:midi`
  if (!navigator.requestMIDIAccess) {
    outputs.set('connected', false)
    outputs.set('_error', 'Web MIDI is not available in this browser (e.g. Safari) — use Chrome, Edge, Firefox or the desktop app')
    return outputs
  }
  // Throttled (2 s): with no device plugged in (or access denied) this used to re-request MIDI
  // access — and log — on every frame.
  const attemptKey = `${ctx.nodeId}:lastAttempt`
  const nowA = Date.now()
  if (!midiOutputs.has(midiKey) && nowA - ((midiState.get(attemptKey) as number) ?? 0) >= 2000) {
    midiState.set(attemptKey, nowA)
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
  if (trigger && typeof note === 'number' && Number.isFinite(note) && output) {
    const noteByte = Math.max(0, Math.min(127, Math.round(note)))
    const velocityByte = Math.max(0, Math.min(127, Math.round((Number(velocity) || 0) * 127)))
    const noteOnStatus = 0x90 | channel
    const noteOffStatus = 0x80 | channel

    try {
      // Send Note On
      output.send([noteOnStatus, noteByte, velocityByte])

      // Schedule Note Off after 100ms - track for cleanup (teardown flushes it rather than
      // dropping it, so a delete/Stop mid-note can't leave the note hanging).
      const sendOff = () => output.send([noteOffStatus, noteByte, 0])
      const entry: PendingNoteOff = {
        id: setTimeout(() => {
          try { sendOff() } catch { /* port gone */ }
          // Remove from tracking after execution
          const timeouts = midiNoteOffTimeouts.get(ctx.nodeId)
          if (timeouts) {
            const idx = timeouts.indexOf(entry)
            if (idx >= 0) timeouts.splice(idx, 1)
          }
        }, 100),
        flush: sendOff,
      }

      // Track the timeout for cleanup
      if (!midiNoteOffTimeouts.has(ctx.nodeId)) {
        midiNoteOffTimeouts.set(ctx.nodeId, [])
      }
      midiNoteOffTimeouts.get(ctx.nodeId)!.push(entry)
    } catch (error) {
      // A disconnected port throws InvalidStateError — drop it so the throttled lookup rebinds.
      console.warn('[MIDI] Send failed:', error)
      midiOutputs.delete(midiKey)
      setCached(midiState, `${ctx.nodeId}:connected`, false)
    }
  }

  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))

  return outputs
}

export default defineNode({ definition, executor })
