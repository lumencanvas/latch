/**
 * Device chooser bridge (Web Bluetooth + Web Serial).
 *
 * Electron has no built-in chooser UI: `navigator.bluetooth.requestDevice()` and
 * `navigator.serial.requestPort()` are cancelled unless the app handles
 * 'select-bluetooth-device' / 'select-serial-port' and calls the callback with a
 * device id. Silently picking the first match is wrong (it connects to whichever
 * device advertised first), so we forward the live device list to a renderer
 * chooser (ElectronDeviceChooser.vue) and wait for the user's pick or cancel.
 *
 * Protocol (main → renderer, channel 'deviceChooser:update'):
 *   { requestId, kind: 'bluetooth' | 'serial', devices: [{ id, name, detail? }] }
 *   or { requestId, kind, closed: true } when the request ended on the main side.
 * Renderer → main (invoke 'deviceChooser:respond'): (requestId, deviceId | null).
 */
import { type WebContents } from 'electron'
import { handleTrusted } from './security'

type Kind = 'bluetooth' | 'serial'

interface ChooserDevice {
  id: string
  name: string
  detail?: string
}

interface Pending {
  requestId: number
  kind: Kind
  webContents: WebContents
  devices: Map<string, ChooserDevice>
  callback: (deviceId: string) => void
}

let nextRequestId = 1
let pending: Pending | null = null

function send(p: Pending, closed = false): void {
  if (p.webContents.isDestroyed()) return
  p.webContents.send(
    'deviceChooser:update',
    closed
      ? { requestId: p.requestId, kind: p.kind, closed: true }
      : { requestId: p.requestId, kind: p.kind, devices: [...p.devices.values()] }
  )
}

/** Resolve the active request (pick or cancel) and tell the renderer it's closed. */
function settle(deviceId: string | null): void {
  const p = pending
  if (!p) return
  pending = null
  try {
    p.callback(deviceId ?? '')
  } catch {
    // The underlying Chromium request may already be gone (timeout / page unload).
  }
  send(p, true)
}

/**
 * Start a request, or refresh the active one. Electron re-fires
 * 'select-bluetooth-device' as discovery finds devices (same request, new
 * callback), so an update for the same kind + WebContents keeps the request id.
 */
function upsert(kind: Kind, webContents: WebContents, devices: ChooserDevice[], callback: (id: string) => void): void {
  if (pending && (pending.kind !== kind || pending.webContents !== webContents)) settle(null)
  if (!pending) {
    pending = { requestId: nextRequestId++, kind, webContents, devices: new Map(), callback }
  }
  pending.callback = callback
  for (const d of devices) pending.devices.set(d.id, d)
  send(pending)
}

function hex4(n: string | number | undefined): string {
  if (n === undefined || n === '') return '????'
  const v = typeof n === 'number' ? n : parseInt(String(n), 10)
  return Number.isFinite(v) ? v.toString(16).padStart(4, '0') : String(n)
}

/** Wire the chooser into a window's WebContents + session. Call once per window. */
export function attachDeviceChooser(webContents: WebContents): void {
  const ses = webContents.session
  // A reload / cross-document navigation / crash ends the page that asked.
  const cancelIfOwner = (): void => {
    if (pending?.webContents === webContents) settle(null)
  }
  webContents.on('did-navigate', cancelIfOwner)
  webContents.on('render-process-gone', cancelIfOwner)
  webContents.once('destroyed', () => {
    if (pending?.webContents === webContents) pending = null
    ses.removeListener('select-serial-port', onSelectSerial)
    ses.removeListener('serial-port-added', onSerialAdded)
    ses.removeListener('serial-port-removed', onSerialRemoved)
  })

  webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()
    upsert(
      'bluetooth',
      webContents,
      deviceList.map((d) => ({ id: d.deviceId, name: d.deviceName || 'Unnamed device', detail: d.deviceId })),
      callback
    )
  })

  const onSelectSerial = (
    event: Electron.Event,
    portList: Electron.SerialPort[],
    wc: WebContents,
    callback: (portId: string) => void
  ): void => {
    if (wc !== webContents) return
    event.preventDefault()
    upsert(
      'serial',
      webContents,
      portList.map((p) => ({
        id: p.portId,
        name: p.displayName || p.portName || 'Serial port',
        detail: [p.portName, p.vendorId ? `USB ${hex4(p.vendorId)}:${hex4(p.productId)}` : '']
          .filter(Boolean)
          .join(' · '),
      })),
      callback
    )
  }
  const onSerialAdded = (_event: Electron.Event, port: Electron.SerialPort, wc: WebContents): void => {
    if (wc !== webContents || pending?.kind !== 'serial') return
    pending.devices.set(port.portId, { id: port.portId, name: port.displayName || port.portName, detail: port.portName })
    send(pending)
  }
  const onSerialRemoved = (_event: Electron.Event, port: Electron.SerialPort, wc: WebContents): void => {
    if (wc !== webContents || pending?.kind !== 'serial') return
    pending.devices.delete(port.portId)
    send(pending)
  }
  ses.on('select-serial-port', onSelectSerial)
  ses.on('serial-port-added', onSerialAdded)
  ses.on('serial-port-removed', onSerialRemoved)
}

let ipcRegistered = false

export function registerDeviceChooserIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  handleTrusted('deviceChooser:respond', (event, requestId: unknown, deviceId: unknown) => {
    const p = pending
    if (!p || p.requestId !== requestId || p.webContents !== event.sender) return false
    if (deviceId === null) {
      settle(null)
      return true
    }
    // Only ids we actually offered can be chosen. An unknown id (e.g. the port was unplugged
    // as it was clicked) cancels rather than leaving requestPort()/requestDevice() pending
    // forever — the renderer has already closed its chooser.
    if (typeof deviceId !== 'string' || !p.devices.has(deviceId)) {
      settle(null)
      return false
    }
    settle(deviceId)
    return true
  })
}
