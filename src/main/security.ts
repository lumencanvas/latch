/**
 * Main-process security guards: IPC sender validation, navigation / window-open
 * lockdown, and the session permission policy.
 */
import { app, ipcMain, session, shell, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { isAppSchemeUrl } from './protocol'

let devOrigin: string | null = null

/** In `electron-vite dev` the renderer is served by Vite; trust exactly that origin too. */
export function setDevRendererUrl(url: string | undefined): void {
  if (!url) return
  try {
    devOrigin = new URL(url).origin
  } catch {
    devOrigin = null
  }
}

/** Is `raw` a URL (or origin) belonging to our renderer? */
export function isTrustedRendererUrl(raw: string | undefined | null): boolean {
  if (!raw) return false
  if (isAppSchemeUrl(raw)) return true
  if (!devOrigin) return false
  try {
    return new URL(raw).origin === devOrigin
  } catch {
    return false
  }
}

/** Only hand http(s) URLs to the OS (never file://, custom schemes, javascript:, ...). */
export function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

/**
 * Accept IPC only from the top-level frame of a window showing our renderer —
 * never from a subframe or from a page that somehow navigated elsewhere.
 */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame || frame.parent !== null) return false
  return isTrustedRendererUrl(frame.url)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC payloads are validated per handler
type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown

/** `ipcMain.handle` with sender validation. Untrusted senders get a rejected promise. */
export function handleTrusted(channel: string, handler: Handler): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      throw new Error(`Blocked IPC "${channel}" from untrusted sender`)
    }
    return handler(event, ...args)
  })
}

/** Lock down navigation, popups and <webview> for every WebContents the app creates. */
export function installNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-navigate', (event, url) => {
      if (isTrustedRendererUrl(url)) return
      event.preventDefault()
      if (isHttpUrl(url)) void shell.openExternal(url)
    })
    contents.on('will-redirect', (event, url) => {
      if (!isTrustedRendererUrl(url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

/**
 * Permission requests the creative-coding nodes legitimately need: camera/mic
 * (`media` — screen capture is `display-capture` since Electron 45 and is not
 * granted), Web MIDI incl. sysex, fullscreen/pointer lock for output windows,
 * clipboard, audio output selection, notifications.
 */
const ALLOWED_REQUESTS = new Set([
  'media',
  'midi',
  'midiSysex',
  'fullscreen',
  'pointerLock',
  'clipboard-read',
  'clipboard-sanitized-write',
  'speaker-selection',
  'notifications',
])

/** Permission checks (synchronous queries) — the above plus the device APIs. */
const ALLOWED_CHECKS = new Set([...ALLOWED_REQUESTS, 'serial', 'hid', 'usb', 'bluetooth'])

/**
 * Grant the allow-listed permissions to our own origin only; deny everything for
 * any other origin (third-party iframes, a navigated-away page, …).
 */
export function installPermissionPolicy(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const origin = details.requestingUrl
    callback(isTrustedRendererUrl(origin) && ALLOWED_REQUESTS.has(permission))
  })

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    const origin = details?.requestingUrl || requestingOrigin
    return isTrustedRendererUrl(origin) && ALLOWED_CHECKS.has(permission)
  })

  // No setDevicePermissionHandler: Chromium/Electron then keeps chooser-granted
  // serial ports for the session only, so getPorts() never exposes a device the
  // user did not pick in the chooser.
}
