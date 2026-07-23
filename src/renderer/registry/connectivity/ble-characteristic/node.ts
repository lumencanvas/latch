import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { parseCharacteristicValue } from '@/services/ble/BleProfileRegistry'
import { BleAdapter, type BleDataFormat } from '@/services/connections/adapters/BleAdapter'
import { bleAdapters, bleCharacteristicState } from '../shared'
import BleCharacteristicPanel from './BleCharacteristicPanel.vue'

const definition: NodeDefinition = {
  id: 'ble-characteristic',
  name: 'BLE Characteristic',
  version: '1.0.0',
  category: 'devices',
  description: 'Read, write, and subscribe to BLE characteristic values — pick a device, then a service & characteristic',
  icon: 'radio-receiver',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  component: markRaw(BleCharacteristicPanel),
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
      id: 'deviceId',
      type: 'ble-pair',
      label: 'Device ID',
      default: '',
      props: { placeholder: 'Set by "Pair device…" or wire a Device' },
    },
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
    overview:
      'Reads, writes, and subscribes to individual BLE characteristic values. Pair a device on the node (or wire a BLE Device), and it discovers the device\'s services and characteristics for you — pick them from the dropdowns by name instead of typing UUIDs. Notifications push updated values as they arrive.',
    tips: [
      'Click "Pair device…" on the node to bind a device directly — no separate BLE Scanner/Device node needed.',
      'Once connected, choose the Service then the Characteristic from the dropdowns; R/W/N badges show what each supports.',
      'Enable notifications to receive continuous updates without polling; use Auto format for standard Bluetooth SIG profiles.',
    ],
    pairsWith: ['ble-scanner', 'ble-device', 'monitor', 'json-parse'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceInput = ctx.inputs.get('device') as BluetoothDevice | null
  const boundDeviceId = (ctx.controls.get('deviceId') as string) ?? ''
  const readTrigger = ctx.inputs.get('read')
  const writeData = ctx.inputs.get('write')
  const writeTrigger = ctx.inputs.get('writeTrigger')
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
      subscribedChar: '',
      value: null,
      rawValue: null,
      text: '',
      formatted: '',
      notified: false,
      properties: null,
      error: null,
      services: [],
      readRequested: false,
      boundDevice: null,
      lastConnectAt: 0,
    }
    bleCharacteristicState.set(ctx.nodeId, state)
  }

  // Reset notified flag each frame
  state.notified = false

  const emit = (status: string) => {
    outputs.set('value', state!.value)
    outputs.set('rawValue', state!.rawValue)
    outputs.set('text', state!.text)
    outputs.set('formatted', state!.formatted)
    outputs.set('notified', state!.notified)
    outputs.set('properties', state!.properties)
    outputs.set('error', state!.error)
    // Internal: the panel reads the discovered services + live value + status each frame.
    outputs.set('_services', state!.services)
    outputs.set('_status', status)
    outputs.set('_formatted', state!.formatted)
    outputs.set('_notified', state!.notified)
    outputs.set('_error', state!.error)
    return outputs
  }

  if (!('bluetooth' in navigator)) {
    state.error = 'Web Bluetooth needs Chrome/Edge or the desktop app'
    return emit('unsupported')
  }

  // Resolve the device: prefer a wired `device` port; else the gesture-free `deviceId` bind
  // (direct pairing — no upstream BLE Device node needed). Mirrors ble-scanner's bind throttle.
  let resolvedDevice = deviceInput
  if (!resolvedDevice && boundDeviceId) {
    if (state.boundAttemptId !== boundDeviceId) {
      state.boundAttemptId = boundDeviceId
      state.lastBindAttempt = 0
      state.boundDevice = null
    }
    const nowB = Date.now()
    if (nowB - (state.lastBindAttempt ?? 0) >= 2000) {
      state.lastBindAttempt = nowB
      try {
        const b = await BleAdapter.getDeviceById(boundDeviceId)
        if ((b?.id ?? null) !== (state.boundDevice?.id ?? null)) state.boundDevice = b
      } catch {
        state.boundDevice = null
      }
    }
    resolvedDevice = state.boundDevice
  } else if (!boundDeviceId && state.boundAttemptId) {
    state.boundAttemptId = undefined
    state.boundDevice = null
  }

  if (!resolvedDevice) {
    state.error = boundDeviceId
      ? 'Waiting for the paired device… (is it on & in range?)'
      : 'No device — click "Pair device…" or wire a BLE Scanner/Device'
    return emit(boundDeviceId ? 'awaiting-pairing' : 'no device')
  }

  // Get or create the adapter for this device. serviceUUID is left empty so discoverServices()
  // enumerates ALL services — that's what populates the panel's service/characteristic dropdowns.
  const adapterKey = `char_${ctx.nodeId}`
  let adapter = bleAdapters.get(adapterKey)

  if (!adapter || adapter.getDeviceInfo()?.id !== resolvedDevice.id) {
    if (adapter) adapter.dispose()
    // autoReconnect:false — the executor's canConnect()-throttled loop below owns reconnection.
    // It re-runs discoverServices() on every (re)connect, which repopulates the adapter's cleared
    // service map after a drop (adapter auto-reconnect would NOT, since serviceUUID is empty →
    // doConnect skips discovery → reads/subscribes would silently fail). See muse-eeg for the rationale.
    adapter = new BleAdapter(adapterKey, {
      id: adapterKey,
      name: 'BLE Characteristic',
      protocol: 'ble',
      serviceUUID: '',
      autoConnect: false,
      autoReconnect: false,
      reconnectDelay: 2000,
      maxReconnectAttempts: 0,
    })
    // Reuse the resolved device instead of popping the native chooser again on connect.
    adapter.setDevice(resolvedDevice)
    bleAdapters.set(adapterKey, adapter)
    state.subscribed = false
    state.subscribedChar = ''
    state.services = []
    state.lastConnectAt = 0
  }

  // Ensure connected. A dropped GATT link invalidates the subscription, so re-arm it so
  // notifications resubscribe after a reconnect (else they go silent). Throttled + canConnect()-
  // guarded: fires the initial connect AND retries a failed/dropped one every ~2s, without storming.
  if (!adapter.isConnected()) {
    state.subscribed = false
    const nowC = Date.now()
    if (adapter.canConnect() && nowC - state.lastConnectAt >= 2000) {
      state.lastConnectAt = nowC
      try {
        await adapter.connect()
        state.services = await adapter.discoverServices()
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Connection failed'
      }
    }
    if (!adapter.isConnected()) {
      return emit(adapter.status)
    }
  }

  // Determine actual data format
  const format: BleDataFormat = dataFormat === 'auto' ? 'raw' : (dataFormat as BleDataFormat)

  // Switching characteristics (via the dropdowns) must unsubscribe the old one before re-arming.
  if (state.subscribed && state.subscribedChar && state.subscribedChar !== characteristicUUID) {
    adapter.unsubscribeFromNotifications(state.subscribedChar).catch(() => {})
    state.subscribed = false
    state.subscribedChar = ''
  }

  // Subscribe to notifications if enabled, a characteristic is chosen, and not yet subscribed.
  if (enableNotifications && characteristicUUID && !state.subscribed) {
    try {
      await adapter.subscribeToNotifications(
        characteristicUUID,
        (_value, raw) => {
          const charState = bleCharacteristicState.get(ctx.nodeId)
          if (charState) {
            const parsed = parseCharacteristicValue(characteristicUUID, raw)
            charState.value = parsed.value
            // Honour the DataView's window — a notification value can be a slice of a larger buffer.
            charState.rawValue = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            charState.text = typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value)
            charState.formatted = parsed.formatted
            charState.notified = true
          }
        },
        format
      )
      state.subscribed = true
      state.subscribedChar = characteristicUUID
    } catch (error) {
      console.warn('[BLE Characteristic] Could not subscribe to notifications:', error)
    }
  }

  // Handle read trigger / continuous / the panel's Read button.
  const hasReadTrigger =
    readTrigger === true || readTrigger === 1 || (typeof readTrigger === 'number' && readTrigger > 0) || continuous || state.readRequested

  if (hasReadTrigger && characteristicUUID) {
    state.readRequested = false // drain the one-shot request
    try {
      // Decode via the SAME profile parser the notification path uses, so a read and a
      // notification of the same characteristic agree.
      const raw = await adapter.readCharacteristicRaw(characteristicUUID)
      const parsed = parseCharacteristicValue(characteristicUUID, raw)
      state.value = parsed.value
      state.rawValue = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      state.text = typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value)
      state.formatted = parsed.formatted
      state.error = null
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Read failed'
    }
  } else if (state.readRequested) {
    // Requested a read with no characteristic selected — clear it so it doesn't linger.
    state.readRequested = false
  }

  // Handle write trigger.
  const hasWriteTrigger = writeTrigger === true || writeTrigger === 1 || (typeof writeTrigger === 'number' && writeTrigger > 0)

  if (hasWriteTrigger && characteristicUUID && writeData !== undefined) {
    try {
      await adapter.writeCharacteristic(characteristicUUID, writeData as ArrayBuffer | Uint8Array | number | string, format)
      state.error = null
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Write failed'
    }
  }

  // Surface the discovered GATT properties (read/write/notify/…) for the selected characteristic.
  if (characteristicUUID) {
    const props = adapter.getCharacteristicProperties(characteristicUUID)
    if (props) state.properties = props
  }

  return emit('connected')
}

export default defineNode({ definition, executor })
