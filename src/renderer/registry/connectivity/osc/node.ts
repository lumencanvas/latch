import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getCached, setCached, oscConnections, oscState, encodeOSCMessage, decodeOSCMessage } from '../shared'

const definition: NodeDefinition = {
  id: 'osc',
  name: 'OSC',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Open Sound Control over WebSocket',
  icon: 'radio-tower',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'host', type: 'string', label: 'Host' },
    { id: 'port', type: 'number', label: 'Port' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'send', type: 'data', label: 'Send' },
  ],
  outputs: [
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'args', type: 'data', label: 'Arguments' },
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'host', type: 'text', label: 'Host', default: 'localhost' },
    { id: 'port', type: 'number', label: 'Port', default: 8080, props: { min: 1, max: 65535 } },
    { id: 'address', type: 'text', label: 'Address', default: '/clasp', props: { placeholder: '/path/to/param' } },
    { id: 'connect', type: 'toggle', label: 'Connect', default: true },
  ],
  tags: ['osc', 'open sound control', 'udp', 'touchosc', 'network', 'control'],
  info: {
    overview: 'Sends and receives Open Sound Control messages over a WebSocket bridge. You specify a host, port, and OSC address pattern. Incoming messages are split into their address and argument components for easy downstream processing.',
    tips: [
      'Make sure an OSC-to-WebSocket bridge is running on the target host and port.',
      'Use address patterns like /mixer/fader1 to target specific parameters.',
      'Connect the Value output to a gain or expression node for real-time parameter control.',
    ],
    pairsWith: ['midi-input', 'expression', 'gain', 'monitor', 'console'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const host = (ctx.inputs.get('host') as string) ?? (ctx.controls.get('host') as string) ?? 'localhost'
  const port = (ctx.inputs.get('port') as number) ?? (ctx.controls.get('port') as number) ?? 8080
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/clasp'
  const sendValue = ctx.inputs.get('send')
  const connect = (ctx.controls.get('connect') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  const oscKey = `${ctx.nodeId}:osc`
  const sendKey = `${ctx.nodeId}:lastSend`
  const urlKey = `${ctx.nodeId}:url`
  const attemptKey = `${ctx.nodeId}:lastAttempt`
  const url = `ws://${host}:${port}`
  let ws = oscConnections.get(oscKey)

  // Host/port changed → drop the old socket so the block below dials the new endpoint.
  if (ws && oscState.get(urlKey) !== url) {
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    ws.close()
    oscConnections.delete(oscKey)
    setCached(oscState, `${ctx.nodeId}:connected`, false)
    ws = undefined
  }

  // Handle connection (OSC over WebSocket). Throttled to one dial per 2 s: onclose deletes the
  // socket, so with the bridge down this used to construct a new WebSocket nearly every frame.
  const now = Date.now()
  if (connect && !ws && now - ((oscState.get(attemptKey) as number) ?? 0) >= 2000) {
    oscState.set(attemptKey, now)
    try {
      ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      oscConnections.set(oscKey, ws)
      oscState.set(urlKey, url)

      ws.onopen = () => {
        setCached(oscState, `${ctx.nodeId}:connected`, true)
        setCached(oscState, `${ctx.nodeId}:error`, null)
        oscState.delete(sendKey) // fresh link — re-send the current value
      }

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data)
        const message = decodeOSCMessage(data)
        if (message) {
          setCached(oscState, `${ctx.nodeId}:address`, message.address)
          setCached(oscState, `${ctx.nodeId}:args`, message.args)
          setCached(oscState, `${ctx.nodeId}:value`, message.args[0] ?? null)
        }
      }

      ws.onerror = () => {
        setCached(oscState, `${ctx.nodeId}:error`, 'OSC connection error')
        setCached(oscState, `${ctx.nodeId}:connected`, false)
      }

      ws.onclose = () => {
        setCached(oscState, `${ctx.nodeId}:connected`, false)
        oscConnections.delete(oscKey)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(oscState, `${ctx.nodeId}:error`, errorMsg)
    }
  }

  // Handle disconnect
  if (!connect && ws) {
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    ws.close()
    oscConnections.delete(oscKey)
    setCached(oscState, `${ctx.nodeId}:connected`, false)
    oscState.delete(sendKey)
    oscState.delete(attemptKey) // toggling Connect back on dials immediately
    ws = undefined
  }

  // Send OSC message — SEND-ON-CHANGE (there's no trigger port, so gating on a value change is
  // the correct guard; sending every frame flooded the socket ~60×/s). OSC receivers hold the
  // last value, so re-sending an unchanged value is redundant. A disconnected input re-arms it.
  if (sendValue === undefined || sendValue === null) oscState.delete(sendKey)
  if (ws && ws.readyState === WebSocket.OPEN && sendValue !== undefined) {
    const args = Array.isArray(sendValue) ? sendValue : [sendValue]
    const serialized = JSON.stringify([address, args])
    if (oscState.get(sendKey) !== serialized) {
      ws.send(encodeOSCMessage(address, args))
      oscState.set(sendKey, serialized)
    }
  }

  outputs.set('address', getCached(`${ctx.nodeId}:address`, address))
  outputs.set('args', getCached(`${ctx.nodeId}:args`, []))
  outputs.set('value', getCached(`${ctx.nodeId}:value`, null))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

export default defineNode({ definition, executor })
