import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { parseCharacteristicValue } from '@/services/ble/BleProfileRegistry'
import { BleAdapter, type BleDataFormat } from '@/services/connections/adapters/BleAdapter'
import { bleAdapters, bleCharacteristicState } from '../shared'

const definition: NodeDefinition = {
  id: 'ble-characteristic',
  name: 'BLE Characteristic',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Read, write, and subscribe to BLE characteristic values',
  icon: 'radio-receiver',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  inputs: [
    { id: 'device', type: 'data', label: 'Device' },
    { id: 'read', type: 'trigger', label: 'Read' },
    { id: 'write', type: 'data', label: 'Write Data' },
    { id: 'writeTrigger', type: 'trigger', label: 'Write Trigger' },
  ],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'rawValue', type: 'data', label: 'Raw Value' },
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'formatted', type: 'string', label: 'Formatted' },
    { id: 'notified', type: 'trigger', label: 'Notified' },
    { id: 'properties', type: 'data', label: 'Properties' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'serviceUUID',
      type: 'text',
      label: 'Service UUID',
      default: '',
      props: { placeholder: 'e.g., 180d or 0000180d-...' },
    },
    {
      id: 'characteristicUUID',
      type: 'text',
      label: 'Characteristic UUID',
      default: '',
      props: { placeholder: 'e.g., 2a37 or 00002a37-...' },
    },
    {
      id: 'dataFormat',
      type: 'select',
      label: 'Data Format',
      default: 'auto',
      props: {
        options: [
          { label: 'Auto (Use Profile)', value: 'auto' },
          { label: 'Unsigned 8-bit', value: 'uint8' },
          { label: 'Signed 8-bit', value: 'int8' },
          { label: 'Unsigned 16-bit', value: 'uint16' },
          { label: 'Signed 16-bit', value: 'int16' },
          { label: 'Unsigned 32-bit', value: 'uint32' },
          { label: 'Signed 32-bit', value: 'int32' },
          { label: 'Float 32-bit', value: 'float32' },
          { label: 'Float 64-bit', value: 'float64' },
          { label: 'UTF-8 String', value: 'utf8' },
          { label: 'Raw Bytes', value: 'raw' },
        ],
      },
    },
    {
      id: 'enableNotifications',
      type: 'toggle',
      label: 'Enable Notifications',
      default: true,
    },
    {
      id: 'continuous',
      type: 'toggle',
      label: 'Continuous Read',
      default: false,
    },
  ],
  tags: ['ble', 'bluetooth', 'characteristic', 'gatt', 'read', 'write', 'notify'],
  info: {
    overview: 'Reads, writes, and subscribes to individual BLE characteristic values on a connected device. You specify the service and characteristic UUIDs, pick a data format, and the node handles encoding and decoding automatically. Notifications push updated values as they arrive.',
    tips: [
      'Enable notifications to receive continuous updates without polling.',
      'Use the Auto data format when working with standard Bluetooth SIG profiles.',
      'Connect a BLE Device node to the Device input before attempting reads or writes.',
    ],
    pairsWith: ['ble-device', 'ble-scanner', 'monitor', 'json-parse'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceInput = ctx.inputs.get('device') as BluetoothDevice | null
  const readTrigger = ctx.inputs.get('read')
  const writeData = ctx.inputs.get('write')
  const writeTrigger = ctx.inputs.get('writeTrigger')
  const serviceUUID = (ctx.controls.get('serviceUUID') as string) ?? ''
  const characteristicUUID = (ctx.controls.get('characteristicUUID') as string) ?? ''
  const dataFormat = (ctx.controls.get('dataFormat') as string) ?? 'auto'
  const enableNotifications = (ctx.controls.get('enableNotifications') as boolean) ?? true
  const continuous = (ctx.controls.get('continuous') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  // Initialize state
  let state = bleCharacteristicState.get(ctx.nodeId)
  if (!state) {
    state = {
      subscribed: false,
      value: null,
      rawValue: null,
      text: '',
      formatted: '',
      notified: false,
      properties: null,
      error: null,
    }
    bleCharacteristicState.set(ctx.nodeId, state)
  }

  // Reset notified flag each frame
  state.notified = false

  // Check prerequisites
  if (!deviceInput || !serviceUUID || !characteristicUUID) {
    outputs.set('value', state.value)
    outputs.set('rawValue', state.rawValue)
    outputs.set('text', state.text)
    outputs.set('formatted', state.formatted)
    outputs.set('notified', false)
    outputs.set('properties', state.properties)
    outputs.set('error', !deviceInput ? 'No device connected' : 'Service/Characteristic UUID required')
    return outputs
  }

  // Get or create adapter for this device
  const adapterKey = `char_${ctx.nodeId}`
  let adapter = bleAdapters.get(adapterKey)

  if (!adapter || adapter.getDeviceInfo()?.id !== deviceInput.id) {
    // Dispose old adapter
    if (adapter) {
      adapter.dispose()
    }

    // Create adapter for this characteristic node
    adapter = new BleAdapter(adapterKey, {
      id: adapterKey,
      name: `Characteristic ${characteristicUUID}`,
      protocol: 'ble',
      serviceUUID: serviceUUID,
      characteristicUUIDs: [characteristicUUID],
      autoConnect: false,
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 5,
    })

    bleAdapters.set(adapterKey, adapter)

    // Connect if device is already connected
    if (deviceInput.gatt?.connected) {
      try {
        await adapter.connect()
        await adapter.discoverServices()
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  // Ensure connected
  if (!adapter.isConnected()) {
    try {
      await adapter.connect()
      await adapter.discoverServices()
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Connection failed'
      outputs.set('value', state.value)
      outputs.set('rawValue', state.rawValue)
      outputs.set('text', state.text)
      outputs.set('formatted', state.formatted)
      outputs.set('notified', false)
      outputs.set('properties', state.properties)
      outputs.set('error', state.error)
      return outputs
    }
  }

  // Determine actual data format
  const format: BleDataFormat = dataFormat === 'auto' ? 'raw' : dataFormat as BleDataFormat

  // Subscribe to notifications if enabled and not yet subscribed
  if (enableNotifications && !state.subscribed) {
    try {
      await adapter.subscribeToNotifications(characteristicUUID, (_value, raw) => {
        const charState = bleCharacteristicState.get(ctx.nodeId)
        if (charState) {
          // Use profile parser if available
          const parsed = parseCharacteristicValue(characteristicUUID, raw)

          charState.value = parsed.value
          charState.rawValue = new Uint8Array(raw.buffer)
          charState.text = typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value)
          charState.formatted = parsed.formatted
          charState.notified = true
        }
      }, format)
      state.subscribed = true
    } catch (error) {
      // Notifications may not be supported
      console.warn('[BLE Characteristic] Could not subscribe to notifications:', error)
    }
  }

  // Handle read trigger
  const hasReadTrigger = readTrigger === true || readTrigger === 1 || (typeof readTrigger === 'number' && readTrigger > 0) || continuous

  if (hasReadTrigger) {
    try {
      const value = await adapter.readCharacteristic(characteristicUUID, format)

      // Parse with profile
      // Need to get raw DataView for parsing - we'll store last raw value
      state.value = value
      state.text = typeof value === 'string' ? value : JSON.stringify(value)
      state.formatted = state.text
      state.error = null
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Read failed'
    }
  }

  // Handle write trigger
  const hasWriteTrigger = writeTrigger === true || writeTrigger === 1 || (typeof writeTrigger === 'number' && writeTrigger > 0)

  if (hasWriteTrigger && writeData !== undefined) {
    try {
      await adapter.writeCharacteristic(characteristicUUID, writeData as ArrayBuffer | Uint8Array | number | string, format)
      state.error = null
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Write failed'
    }
  }

  outputs.set('value', state.value)
  outputs.set('rawValue', state.rawValue)
  outputs.set('text', state.text)
  outputs.set('formatted', state.formatted)
  outputs.set('notified', state.notified)
  outputs.set('properties', state.properties)
  outputs.set('error', state.error)

  return outputs
}

export default defineNode({ definition, executor })
