import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getServiceName, getCharacteristicName } from '@/services/ble/BleProfileRegistry'
import { BleAdapter } from '@/services/connections/adapters/BleAdapter'
import { bleAdapters, bleDeviceState } from '../shared'

const definition: NodeDefinition = {
  id: 'ble-device',
  name: 'BLE Device',
  version: '1.0.0',
  category: 'devices',
  description: 'Connect to a Bluetooth LE device and enumerate its services',
  icon: 'bluetooth-connected',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  inputs: [
    { id: 'device', type: 'data', label: 'Device' },
    { id: 'connect', type: 'trigger', label: 'Connect' },
    { id: 'disconnect', type: 'trigger', label: 'Disconnect' },
  ],
  outputs: [
    { id: 'services', type: 'data', label: 'Services' },
    { id: 'characteristics', type: 'data', label: 'Characteristics' },
    { id: 'deviceName', type: 'string', label: 'Device Name' },
    { id: 'deviceId', type: 'string', label: 'Device ID' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'status', type: 'string', label: 'Status' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'autoConnect',
      type: 'toggle',
      label: 'Auto Connect',
      default: false,
    },
    {
      id: 'autoReconnect',
      type: 'toggle',
      label: 'Auto Reconnect',
      default: true,
    },
    {
      id: 'serviceUUID',
      type: 'text',
      label: 'Service UUID (optional)',
      default: '',
      props: { placeholder: 'Filter to specific service' },
    },
  ],
  tags: ['ble', 'bluetooth', 'device', 'gatt', 'connect', 'peripheral'],
  info: {
    overview: 'Connects to a specific Bluetooth LE device and enumerates its services and characteristics. Pass in a device reference from a BLE Scanner node, and this node manages the connection lifecycle including optional auto-reconnect.',
    tips: [
      'Enable Auto Reconnect to recover from dropped connections without manual intervention.',
      'Use the Service UUID filter to limit enumeration to a single service for faster discovery.',
      'Check the Connected output to gate downstream logic on active connection state.',
    ],
    pairsWith: ['ble-scanner', 'ble-characteristic', 'monitor', 'gate'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceInput = ctx.inputs.get('device') as BluetoothDevice | null
  const connectTrigger = ctx.inputs.get('connect')
  const disconnectTrigger = ctx.inputs.get('disconnect')
  const autoConnect = (ctx.controls.get('autoConnect') as boolean) ?? false
  const autoReconnect = (ctx.controls.get('autoReconnect') as boolean) ?? true
  const serviceUUID = (ctx.controls.get('serviceUUID') as string) ?? ''

  const outputs = new Map<string, unknown>()

  // Initialize state
  let state = bleDeviceState.get(ctx.nodeId)
  if (!state) {
    state = { adapter: null, services: [], connected: false, status: 'idle', error: null }
    bleDeviceState.set(ctx.nodeId, state)
  }

  // Check if we have a device
  if (!deviceInput) {
    outputs.set('services', [])
    outputs.set('characteristics', [])
    outputs.set('deviceName', '')
    outputs.set('deviceId', '')
    outputs.set('connected', false)
    outputs.set('status', 'no device')
    outputs.set('error', null)
    return outputs
  }

  // Create or update adapter if device changed
  const existingAdapter = bleAdapters.get(ctx.nodeId)
  if (!existingAdapter || existingAdapter.getDeviceInfo()?.id !== deviceInput.id) {
    // Dispose old adapter
    if (existingAdapter) {
      existingAdapter.dispose()
    }

    // Create new adapter
    const adapter = new BleAdapter(ctx.nodeId, {
      id: ctx.nodeId,
      name: deviceInput.name || 'BLE Device',
      protocol: 'ble',
      serviceUUID: serviceUUID,
      autoConnect: false,
      autoReconnect: autoReconnect,
      reconnectDelay: 1000,
      maxReconnectAttempts: 5,
    })

    // Reuse the device handed in on the port (from ble-scanner) instead of
    // popping the native chooser again on connect.
    adapter.setDevice(deviceInput)

    bleAdapters.set(ctx.nodeId, adapter)
    state.adapter = adapter
    // Fresh adapter for a new device: reset the edge-trigger + connection flags.
    state.autoConnectFired = false
    state.connected = false

    // Set up status listener
    adapter.onStatusChange((statusInfo) => {
      const nodeState = bleDeviceState.get(ctx.nodeId)
      if (nodeState) {
        nodeState.connected = statusInfo.status === 'connected'
        nodeState.status = statusInfo.status
        nodeState.error = statusInfo.error || null
      }
    })
  }

  const adapter = state.adapter

  // Handle connect trigger
  const hasConnectTrigger = connectTrigger === true || connectTrigger === 1 || (typeof connectTrigger === 'number' && connectTrigger > 0)
  const hasDisconnectTrigger = disconnectTrigger === true || disconnectTrigger === 1 || (typeof disconnectTrigger === 'number' && disconnectTrigger > 0)

  if (adapter) {
    if (hasDisconnectTrigger && state.connected) {
      try {
        await adapter.disconnect()
        state.connected = false
        state.status = 'disconnected'
        state.services = []
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Disconnect failed'
      }
    } else if (hasConnectTrigger || (autoConnect && !state.autoConnectFired)) {
      // autoConnect is EDGE-triggered (fires once); the adapter's own autoReconnect owns
      // retries. Guard on canConnect() so we never re-drive connect() from the per-frame
      // loop while the adapter is connecting/reconnecting/error-parked (which would either
      // throw 'Cannot connect from state: …' every frame or hammer a dead device).
      if (autoConnect) state.autoConnectFired = true
      if (adapter.canConnect()) {
        state.status = 'connecting'
        try {
          await adapter.connect()
          state.connected = true
          state.status = 'connected'

          // Enumerate services
          state.services = await adapter.getServices()
        } catch (error) {
          state.error = error instanceof Error ? error.message : 'Connection failed'
          state.status = 'error'
        }
      }
    }
  }

  // Build characteristics list from services
  const characteristics: Array<{ uuid: string; name: string; serviceUuid: string; serviceName: string; properties: Record<string, boolean> }> = []
  for (const service of state.services) {
    for (const char of service.characteristics) {
      characteristics.push({
        uuid: char.uuid,
        name: getCharacteristicName(char.uuid),
        serviceUuid: service.uuid,
        serviceName: getServiceName(service.uuid),
        properties: char.properties as unknown as Record<string, boolean>,
      })
    }
  }

  outputs.set('services', state.services)
  outputs.set('characteristics', characteristics)
  outputs.set('deviceName', deviceInput.name || '')
  outputs.set('deviceId', deviceInput.id)
  outputs.set('connected', state.connected)
  outputs.set('status', state.status)
  outputs.set('error', state.error)

  return outputs
}

export default defineNode({ definition, executor })
