import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getCached, setCached, bleDevices, bleState, bleCharacteristicHandlers } from '../shared'

const definition: NodeDefinition = {
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

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const serviceUUID = (ctx.controls.get('serviceUUID') as string) ?? ''
  const characteristicUUID = (ctx.controls.get('characteristicUUID') as string) ?? ''
  const connect = (ctx.controls.get('connect') as boolean) ?? false
  const sendData = ctx.inputs.get('send') as string | Uint8Array | undefined

  const outputs = new Map<string, unknown>()

  // Check if Web Bluetooth API is available
  if (!('bluetooth' in navigator)) {
    outputs.set('value', null)
    outputs.set('connected', false)
    outputs.set('error', 'Web Bluetooth API not supported')
    return outputs
  }

  const bleKey = `${ctx.nodeId}:ble`
  let connection = bleDevices.get(bleKey)

  // Handle connection
  if (connect && !connection && serviceUUID) {
    try {
      // Request device (this will show a browser dialog)
      const device = await (navigator as Navigator & {
        bluetooth: {
          requestDevice: (options: { filters: { services: string[] }[] }) => Promise<BluetoothDevice>
        }
      }).bluetooth.requestDevice({
        filters: [{ services: [serviceUUID] }]
      })

      const server = await device.gatt?.connect()

      if (server) {
        connection = { device, server }
        bleDevices.set(bleKey, connection)
        setCached(bleState, `${ctx.nodeId}:connected`, true)
        setCached(bleState, `${ctx.nodeId}:deviceName`, device.name ?? 'Unknown')
        setCached(bleState, `${ctx.nodeId}:error`, null)

        // Setup notifications if characteristic UUID provided
        if (characteristicUUID) {
          try {
            const service = await server.getPrimaryService(serviceUUID)
            const characteristic = await service.getCharacteristic(characteristicUUID)

            // Enable notifications
            await characteristic.startNotifications()

            // Store handler reference for cleanup
            const handler = (event: Event) => {
              const value = (event.target as BluetoothRemoteGATTCharacteristic).value
              if (value) {
                const bytes = new Uint8Array(value.buffer)
                setCached(bleState, `${ctx.nodeId}:rawValue`, bytes)

                // Try to interpret as number (first 4 bytes as float)
                if (bytes.length >= 4) {
                  const view = new DataView(bytes.buffer)
                  setCached(bleState, `${ctx.nodeId}:value`, view.getFloat32(0, true))
                } else if (bytes.length >= 1) {
                  setCached(bleState, `${ctx.nodeId}:value`, bytes[0])
                }

                // Also try as string
                const text = new TextDecoder().decode(bytes)
                setCached(bleState, `${ctx.nodeId}:text`, text)
              }
            }
            characteristic.addEventListener('characteristicvaluechanged', handler)
            bleCharacteristicHandlers.set(ctx.nodeId, { characteristic, handler })
          } catch (error) {
            console.error('[BLE] Characteristic setup error:', error)
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(bleState, `${ctx.nodeId}:error`, errorMsg)
      setCached(bleState, `${ctx.nodeId}:connected`, false)
    }
  }

  // Handle disconnect
  if (!connect && connection) {
    try {
      connection.server?.disconnect()
    } catch (e) {
      console.error('[BLE] Disconnect error:', e)
    }
    bleDevices.delete(bleKey)
    setCached(bleState, `${ctx.nodeId}:connected`, false)
  }

  // Send data
  if (connection && connection.server && sendData && characteristicUUID) {
    try {
      const service = await connection.server.getPrimaryService(serviceUUID)
      const characteristic = await service.getCharacteristic(characteristicUUID)

      const data = typeof sendData === 'string'
        ? new TextEncoder().encode(sendData)
        : sendData

      // Convert Uint8Array to ArrayBuffer for writeValue
      const buffer = data instanceof Uint8Array ? data.buffer : data
      await characteristic.writeValue(buffer as ArrayBuffer)
    } catch (error) {
      console.error('[BLE] Write error:', error)
    }
  }

  outputs.set('value', getCached(`${ctx.nodeId}:value`, null))
  outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
  outputs.set('rawValue', getCached(`${ctx.nodeId}:rawValue`, null))
  outputs.set('deviceName', getCached(`${ctx.nodeId}:deviceName`, ''))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

export default defineNode({ definition, executor })
