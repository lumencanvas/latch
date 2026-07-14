import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { BleAdapter } from '@/services/connections/adapters/BleAdapter'
import { bleScannerState } from '../shared'

const definition: NodeDefinition = {
  id: 'ble-scanner',
  name: 'BLE Scanner',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Scan for Bluetooth LE devices and select one to connect',
  icon: 'bluetooth-searching',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  inputs: [
    { id: 'trigger', type: 'trigger', label: 'Scan' },
  ],
  outputs: [
    { id: 'device', type: 'data', label: 'Device' },
    { id: 'deviceName', type: 'string', label: 'Device Name' },
    { id: 'deviceId', type: 'string', label: 'Device ID' },
    { id: 'scanning', type: 'boolean', label: 'Scanning' },
    { id: 'status', type: 'string', label: 'Status' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'serviceFilter',
      type: 'select',
      label: 'Service Filter',
      default: 'any',
      props: {
        options: [
          { label: 'Any Device', value: 'any' },
          { label: '--- Standard Services ---', value: '---standard' },
          { label: 'Heart Rate Monitor', value: '180d' },
          { label: 'Battery Service', value: '180f' },
          { label: 'Device Information', value: '180a' },
          { label: 'Environmental Sensing', value: '181a' },
          { label: 'Cycling Speed & Cadence', value: '1816' },
          { label: 'Running Speed & Cadence', value: '1814' },
          { label: '--- Custom ---', value: '---custom' },
          { label: 'Custom UUID', value: 'custom' },
        ],
      },
    },
    {
      id: 'customServiceUUID',
      type: 'text',
      label: 'Custom Service UUID',
      default: '',
      props: { placeholder: 'e.g., 0000180d-0000-1000-8000-00805f9b34fb' },
    },
    {
      id: 'nameFilter',
      type: 'text',
      label: 'Name Filter',
      default: '',
      props: { placeholder: 'Optional device name prefix' },
    },
    {
      id: 'deviceId',
      type: 'text',
      label: 'Bound Device ID',
      default: '',
      props: { placeholder: 'Auto-filled by "Add Bluetooth Device"' },
    },
  ],
  tags: ['ble', 'bluetooth', 'scanner', 'scan', 'discover', 'devices'],
  info: {
    overview: 'Scans for nearby Bluetooth LE devices and lets the user select one. You can filter by standard service types, a custom UUID, or a device name prefix. The selected device reference is passed to a BLE Device node for connection.',
    tips: [
      'Use a service filter to narrow results to relevant devices and speed up discovery.',
      'Set a name prefix filter when multiple devices of the same type are nearby.',
      'Trigger a new scan whenever you need to refresh the list of available devices.',
      'The Scan trigger must come from a user action (e.g. a Button click) — Web Bluetooth blocks automated scans. For a pre-bound device, use the header\'s "Add Bluetooth Device" panel instead.',
    ],
    pairsWith: ['ble-device', 'ble-characteristic', 'trigger', 'console'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const trigger = ctx.inputs.get('trigger')
  const serviceFilter = (ctx.controls.get('serviceFilter') as string) ?? 'any'
  const customServiceUUID = (ctx.controls.get('customServiceUUID') as string) ?? ''
  const nameFilter = (ctx.controls.get('nameFilter') as string) ?? ''
  const boundDeviceId = (ctx.controls.get('deviceId') as string) ?? ''

  const outputs = new Map<string, unknown>()

  // Initialize state
  let state = bleScannerState.get(ctx.nodeId)
  if (!state) {
    state = { device: null, scanning: false, status: 'idle', error: null }
    bleScannerState.set(ctx.nodeId, state)
  }

  // Check if Web Bluetooth API is available
  if (!('bluetooth' in navigator)) {
    outputs.set('device', null)
    outputs.set('deviceName', '')
    outputs.set('deviceId', '')
    outputs.set('scanning', false)
    outputs.set('status', 'unsupported')
    outputs.set('error', 'Web Bluetooth API not supported')
    return outputs
  }

  // Gesture-free bind: reconnect to a device the "Add Bluetooth Device" panel
  // already granted, resolved by id via getDevices() — no second chooser. Legal
  // from the render loop (getDevices/gatt.connect need no user gesture, unlike
  // requestDevice). The resolve is AUTHORITATIVE: state.device tracks the actual
  // grant, so it drops when the grant is revoked or the bound id is retargeted.
  if (boundDeviceId) {
    // Retarget: a changed bound id resets the throttle (so it resolves at once) and
    // drops the previous device (so outputs never emit the stale device for ~2s).
    if (state.boundAttemptId !== boundDeviceId) {
      state.boundAttemptId = boundDeviceId
      state.lastBindAttempt = 0
      state.device = null
    }
    const now = Date.now()
    // Re-verify on the throttle even when already bound, so a revoked grant is noticed.
    if (!state.scanning && now - (state.lastBindAttempt ?? 0) >= 2000) {
      state.lastBindAttempt = now
      try {
        const bound = await BleAdapter.getDeviceById(boundDeviceId)
        // Reassign only on an actual change (present↔revoked) to avoid churning a same-id
        // device object downstream every tick.
        if ((bound?.id ?? null) !== (state.device?.id ?? null)) state.device = bound
        state.status = bound ? 'selected' : 'awaiting-pairing'
        state.error = null
      } catch {
        state.device = null
        state.status = 'awaiting-pairing'
      }
    }
  } else if (state.boundAttemptId) {
    // deviceId cleared by the user — release the bind so the manual Scan path owns state.device.
    state.boundAttemptId = undefined
  }

  // Handle scan trigger. NOTE: this path calls requestDevice (via scanDevices), which
  // Web Bluetooth only allows under transient activation — so the Scan trigger must be
  // driven by a live user gesture (a Button node click; activation lasts ~5s, covering
  // the next frame). A timer/autoplay-driven trigger with no recent click throws
  // NotAllowedError (caught below as an error). The bound-device path above is the
  // gesture-free route — prefer "Add Bluetooth Device" for a pre-bound device.
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  if (hasTrigger && !state.scanning) {
    state.scanning = true
    state.status = 'scanning'
    state.error = null

    try {
      // Build filters
      const filters: BluetoothLEScanFilter[] = []
      const optionalServices: BluetoothServiceUUID[] = []

      // Add service filter
      if (serviceFilter !== 'any' && !serviceFilter.startsWith('---')) {
        const uuid = serviceFilter === 'custom' ? customServiceUUID : serviceFilter
        if (uuid) {
          filters.push({ services: [uuid] })
          optionalServices.push(uuid)
        }
      }

      // Add name filter
      if (nameFilter) {
        if (filters.length > 0) {
          filters[0] = { ...filters[0], namePrefix: nameFilter }
        } else {
          filters.push({ namePrefix: nameFilter })
        }
      }

      // Request device
      const device = await BleAdapter.scanDevices({
        filters: filters.length > 0 ? filters : undefined,
        optionalServices,
        acceptAllDevices: filters.length === 0,
      })

      if (device) {
        state.device = device
        state.status = 'selected'
      } else {
        state.status = 'cancelled'
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Scan failed'
      state.status = 'error'
    } finally {
      state.scanning = false
    }
  }

  outputs.set('device', state.device)
  outputs.set('deviceName', state.device?.name || '')
  outputs.set('deviceId', state.device?.id || '')
  outputs.set('scanning', state.scanning)
  outputs.set('status', state.status)
  outputs.set('error', state.error)

  return outputs
}

export default defineNode({ definition, executor })
