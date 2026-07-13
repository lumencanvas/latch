import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getCached, setCached, serialPorts, serialState, type WebSerial } from '../shared'

const definition: NodeDefinition = {
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

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const baudRate = (ctx.controls.get('baudRate') as number) ?? 9600
  const connect = (ctx.controls.get('connect') as boolean) ?? false
  const sendData = ctx.inputs.get('send') as string | undefined

  const outputs = new Map<string, unknown>()

  // Check if Web Serial API is available
  if (!('serial' in navigator)) {
    outputs.set('data', null)
    outputs.set('connected', false)
    outputs.set('error', 'Web Serial API not supported')
    return outputs
  }

  const serialKey = `${ctx.nodeId}:serial`
  let connection = serialPorts.get(serialKey)

  // Handle connection
  if (connect && !connection) {
    try {
      // Request port (this will show a browser dialog)
      const port = await (navigator as Navigator & { serial: WebSerial }).serial.requestPort()
      await port.open({ baudRate })

      connection = { port, reader: null }
      serialPorts.set(serialKey, connection)
      setCached(serialState, `${ctx.nodeId}:connected`, true)
      setCached(serialState, `${ctx.nodeId}:error`, null)

      // Start reading
      if (port.readable) {
        const reader = port.readable.getReader()
        connection.reader = reader

        // Maximum buffer size to prevent unbounded memory growth (64KB)
        const MAX_BUFFER_SIZE = 64 * 1024

        // Read loop
        const readLoop = async () => {
          try {
            while (connection && connection.reader) {
              const { value, done } = await connection.reader.read()
              if (done) break
              if (value) {
                const text = new TextDecoder().decode(value)
                let existingData = getCached<string>(`${ctx.nodeId}:data`, '')

                // Cap buffer size to prevent unbounded memory growth
                const newData = existingData + text
                if (newData.length > MAX_BUFFER_SIZE) {
                  // Keep only the most recent data, truncating from the start
                  existingData = newData.slice(-MAX_BUFFER_SIZE)
                } else {
                  existingData = newData
                }
                setCached(serialState, `${ctx.nodeId}:data`, existingData)

                // Parse lines
                const lines = existingData.split('\n')
                if (lines.length > 1) {
                  const lastLine = lines[lines.length - 2] // Last complete line
                  setCached(serialState, `${ctx.nodeId}:line`, lastLine)

                  // Try to parse as number
                  const num = parseFloat(lastLine)
                  if (!isNaN(num)) {
                    setCached(serialState, `${ctx.nodeId}:value`, num)
                  }
                }
              }
            }
          } catch (error) {
            if ((error as Error).name !== 'NetworkError') {
              console.error('[Serial] Read error:', error)
              setCached(serialState, `${ctx.nodeId}:error`, (error as Error).message)
            }
          }
        }
        // Handle promise to prevent unhandled rejection
        readLoop().catch((error) => {
          console.error('[Serial] Unhandled read loop error:', error)
          setCached(serialState, `${ctx.nodeId}:error`, (error as Error).message ?? 'Read loop error')
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(serialState, `${ctx.nodeId}:error`, errorMsg)
      setCached(serialState, `${ctx.nodeId}:connected`, false)
    }
  }

  // Handle disconnect
  if (!connect && connection) {
    try {
      if (connection.reader) {
        await connection.reader.cancel()
        connection.reader = null
      }
      await connection.port.close()
    } catch (e) {
      console.error('[Serial] Close error:', e)
    }
    serialPorts.delete(serialKey)
    setCached(serialState, `${ctx.nodeId}:connected`, false)
  }

  // Send data
  if (connection && sendData && connection.port.writable) {
    try {
      const writer = connection.port.writable.getWriter()
      const data = new TextEncoder().encode(sendData)
      await writer.write(data)
      writer.releaseLock()
    } catch (error) {
      console.error('[Serial] Write error:', error)
    }
  }

  outputs.set('data', getCached(`${ctx.nodeId}:data`, ''))
  outputs.set('line', getCached(`${ctx.nodeId}:line`, ''))
  outputs.set('value', getCached(`${ctx.nodeId}:value`, 0))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

export default defineNode({ definition, executor })
