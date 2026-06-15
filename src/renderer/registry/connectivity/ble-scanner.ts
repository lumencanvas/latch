import type { NodeDefinition } from '../types'

export const bleScannerNode: NodeDefinition = {
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
  ],
  info: {
    overview: 'Scans for nearby Bluetooth LE devices and lets the user select one. You can filter by standard service types, a custom UUID, or a device name prefix. The selected device reference is passed to a BLE Device node for connection.',
    tips: [
      'Use a service filter to narrow results to relevant devices and speed up discovery.',
      'Set a name prefix filter when multiple devices of the same type are nearby.',
      'Trigger a new scan whenever you need to refresh the list of available devices.',
    ],
    pairsWith: ['ble-device', 'ble-characteristic', 'trigger', 'console'],
  },
}
