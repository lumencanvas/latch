import type { NodeDefinition } from '../types'

export const serialNode: NodeDefinition = {
  id: 'serial',
  name: 'Serial Port',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Serial port communication (Web Serial API)',
  icon: 'usb',
  platforms: ['web', 'electron'],
  requires: ['serial'],
  inputs: [
    { id: 'send', type: 'string', label: 'Send' },
  ],
  outputs: [
    { id: 'data', type: 'string', label: 'Raw Data' },
    { id: 'line', type: 'string', label: 'Last Line' },
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'baudRate', type: 'select', label: 'Baud Rate', default: 9600, props: { options: [9600, 19200, 38400, 57600, 115200] } },
    { id: 'connect', type: 'toggle', label: 'Connect', default: false },
  ],
  tags: ['serial', 'usb', 'uart', 'arduino', 'port', 'hardware'],
  info: {
    overview: 'Communicates with hardware over a serial port using the Web Serial API. Received data is available as raw bytes, parsed lines, or a numeric value. Common uses include reading from Arduino boards, microcontrollers, and other serial peripherals.',
    tips: [
      'Select 115200 baud when working with modern Arduino boards that default to that speed.',
      'Use the Last Line output for line-delimited protocols like those from many sensor boards.',
      'Send text commands through the Send input to control serial devices interactively.',
    ],
    pairsWith: ['json-parse', 'expression', 'monitor', 'console', 'trigger'],
  },
}
