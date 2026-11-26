/**
 * The `app://latch/` privileged scheme the packaged renderer is served from.
 *
 * Why not `file://`: the renderer uses absolute paths (`/vendor/opencv/...`,
 * `/icon.svg`, worker + wasm chunks) that resolve to the filesystem root under
 * file://, file:// pages get an opaque origin (no stable IndexedDB origin, canvas
 * tainting), and there is no way to attach response headers. Serving from a
 * standard + secure custom scheme gives the renderer a real origin, makes absolute
 * paths resolve against the build output, and lets us set COOP/COEP (→
 * `crossOriginIsolated` → SharedArrayBuffer for multi-threaded ONNX/WASM, matching
 * netlify.toml) plus a CSP header that also covers worker scripts.
 */
import { protocol, net } from 'electron'
import { extname, join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { MIGRATE_PAGE, MIGRATE_PATH } from './storageMigration'

export const APP_SCHEME = 'app'
export const APP_HOST = 'latch'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`

/** True for URLs on our privileged origin. (WHATWG `URL.origin` is "null" for non-special schemes, so compare parts.) */
export function isAppSchemeUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST
  } catch {
    return false
  }
}

/**
 * Must run before `app.whenReady()`. `standard` gives the scheme a real origin and
 * relative/absolute URL resolution; `secure` makes it a secure context (required for
 * crossOriginIsolated, Web Bluetooth/Serial, getUserMedia); `supportFetchAPI` lets
 * `fetch('./sample-flow.json')` work; `stream` enables media range requests;
 * `codeCache` lets V8 cache the multi-MB bundles across launches.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ])
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.icns': 'image/icns',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.onnx': 'application/octet-stream',
  '.data': 'application/octet-stream',
  '.bin': 'application/octet-stream',
}

/**
 * Content-Security-Policy for the packaged renderer. Scripts are limited to our
 * own origin + the two CDNs the app loads code from at runtime (jsDelivr: ONNX
 * Runtime / MediaPipe wasm loaders; EmulatorJS data). `unsafe-eval` is required by
 * the Function/Expression/custom nodes (`new Function`), `wasm-unsafe-eval` by
 * every wasm runtime, `blob:` by Monaco workers and the bellows AudioWorklet.
 * Network access stays open (http/ws/MQTT/CLASP nodes talk to user-chosen hosts).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net/npm/@mediapipe/ https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/ https://cdn.emulatorjs.org",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.emulatorjs.org",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' data: blob: mediastream: https: http:",
  "connect-src 'self' data: blob: https: http: wss: ws:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** Same isolation headers as netlify.toml / vite.config.ts (web parity). */
export const ISOLATION_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

/**
 * Serve `app://latch/<path>` from `rootDir` (the electron-vite renderer output,
 * inside app.asar when packaged). Paths are confined to rootDir.
 */
export function handleAppScheme(rootDir: string): void {
  const root = resolve(rootDir)

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 })

    let pathname: string
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    // Empty same-origin page the one-time file:// → app:// storage migration restores into.
    if (pathname === MIGRATE_PATH) {
      return new Response(MIGRATE_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...ISOLATION_HEADERS, 'Content-Security-Policy': CSP },
      })
    }

    const filePath = resolve(join(root, pathname))
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    let upstream: Response
    try {
      // net.fetch(file://) streams (incl. from inside app.asar) and supports Range.
      upstream = await net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers,
        bypassCustomProtocolHandlers: true,
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (!upstream.ok && upstream.status !== 206) {
      return new Response('Not found', { status: 404 })
    }

    const headers = new Headers(upstream.headers)
    const type = MIME[extname(filePath).toLowerCase()]
    if (type) headers.set('Content-Type', type)
    for (const [k, v] of Object.entries(ISOLATION_HEADERS)) headers.set(k, v)
    headers.set('Content-Security-Policy', CSP)
    headers.set('X-Content-Type-Options', 'nosniff')

    return new Response(upstream.body, { status: upstream.status, headers })
  })
}
