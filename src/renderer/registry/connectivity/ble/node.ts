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
  const failedKey = `${ctx.nodeId}:connectFailed`
  const bleSendKey = `${ctx.nodeId}:lastSend`
  let connection = bleDevices.get(bleKey)

  // Turning Connect off re-arms a failed/cancelled attempt.
  if (!connect) bleState.delete(failedKey)

  // Handle connection. One attempt per Connect toggle: a cancelled chooser / failed connect used
  // to retry EVERY frame, re-opening the device chooser in a loop.
  if (connect && !connection && serviceUUID && !bleState.get(failedKey)) {
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
        const conn = { device, server }
        connection = conn
        bleDevices.set(bleKey, conn)
        setCached(bleState, `${ctx.nodeId}:connected`, true)
        setCached(bleState, `${ctx.nodeId}:deviceName`, device.name ?? 'Unknown')
        setCached(bleState, `${ctx.nodeId}:error`, null)
        bleState.delete(bleSendKey) // fresh link — re-send the current value

        // A dropped link (out of range / powered off) must not leave `connected` stuck true with a
        // dead server cached forever. Drop the entry; Connect off→on re-pairs.
        const onDrop = () => {
          device.removeEventListener('gattserverdisconnected', onDrop)
          if (bleDevices.get(bleKey) !== conn) return
          bleDevices.delete(bleKey)
          bleCharacteristicHandlers.delete(ctx.nodeId)
          setCached(bleState, `${ctx.nodeId}:connected`, false)
          setCached(bleState, `${ctx.nodeId}:error`, 'Device disconnected')
          bleState.set(failedKey, true)
        }
        device.addEventListener('gattserverdisconnected', onDrop)

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
                // Honour the DataView's window — the value can be a slice of a larger buffer.
                const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
                setCached(bleState, `${ctx.nodeId}:rawValue`, bytes)

                // Try to interpret as number (first 4 bytes as float)
                if (bytes.length >= 4) {
                  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
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
      bleState.set(failedKey, true)
    }
  }

  // Handle disconnect
  if (!connect && connection) {
    // Release the notification listener first (it was only ever freed on node delete).
    const h = bleCharacteristicHandlers.get(ctx.nodeId)
    if (h) {
      h.characteristic.removeEventListener('characteristicvaluechanged', h.handler)
      bleCharacteristicHandlers.delete(ctx.nodeId)
    }
    bleDevices.delete(bleKey) // before disconnect() so the gattserverdisconnected handler no-ops
    try {
      connection.server?.disconnect()
    } catch (e) {
      console.error('[BLE] Disconnect error:', e)
    }
    connection = undefined
    setCached(bleState, `${ctx.nodeId}:connected`, false)
    bleState.delete(bleSendKey)
  }

  // Send data
  // SEND-ON-CHANGE (no trigger port) — writing every frame re-ran GATT discovery + writeValue
  // ~60×/s, flooding the device. Gate on a payload change.
  const rawSend: unknown = sendData
  const sendSig = typeof rawSend === 'string'
    ? rawSend
    : rawSend instanceof Uint8Array
      ? rawSend.join(',')
      : rawSend instanceof ArrayBuffer
        ? new Uint8Array(rawSend).join(',')
        : String(rawSend)
  // Empty/absent payload re-arms send-on-change (so the same command can be sent twice).
  if (!sendData) bleState.delete(bleSendKey)
  if (connection && connection.server && sendData && characteristicUUID && bleState.get(bleSendKey) !== sendSig) {
    try {
      const service = await connection.server.getPrimaryService(serviceUUID)
      const characteristic = await service.getCharacteristic(characteristicUUID)

      const data = typeof sendData === 'string'
        ? new TextEncoder().encode(sendData)
        : sendData

      // Convert Uint8Array to ArrayBuffer for writeValue
      const buffer = data instanceof Uint8Array ? data.buffer : data
      await characteristic.writeValue(buffer as ArrayBuffer)
      bleState.set(bleSendKey, sendSig)
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
