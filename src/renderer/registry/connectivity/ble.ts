import type { NodeDefinition } from '../types'

export const bleNode: NodeDefinition = {
  id: 'ble',
  name: 'Bluetooth LE',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Bluetooth Low Energy communication (Web Bluetooth API)',
  icon: 'bluetooth',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  inputs: [
    { id: 'send', type: 'data', label: 'Send' },
  ],
  outputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'rawValue', type: 'data', label: 'Raw Value' },
    { id: 'deviceName', type: 'string', label: 'Device Name' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'serviceUUID', type: 'text', label: 'Service UUID', default: '', props: { placeholder: 'e.g., heart_rate or 0000180d-...' } },
    { id: 'characteristicUUID', type: 'text', label: 'Characteristic UUID', default: '', props: { placeholder: 'UUID' } },
    { id: 'connect', type: 'toggle', label: 'Connect', default: false },
  ],
  tags: ['ble', 'bluetooth', 'wireless', 'low energy', 'device'],
  info: {
    overview: 'A simplified all-in-one Bluetooth LE node that handles scanning, connecting, and reading a single characteristic. Good for quick prototyping when you only need one value from one device. For more complex setups with multiple characteristics, use the dedicated BLE Scanner, Device, and Characteristic nodes instead.',
    tips: [
      'Enter both the service UUID and characteristic UUID before toggling Connect.',
      'Use the dedicated BLE Scanner and BLE Characteristic nodes for multi-characteristic workflows.',
    ],
    pairsWith: ['ble-scanner', 'ble-device', 'ble-characteristic', 'monitor'],
  },
}
