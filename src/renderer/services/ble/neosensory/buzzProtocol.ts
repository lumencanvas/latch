/**
 * Neosensory Buzz — BLE protocol constants + pure encoding/parsing helpers.
 *
 * The Buzz haptic wristband speaks the Nordic UART Service (NUS): newline-terminated
 * ASCII CLI commands are WRITTEN to the RX characteristic, and JSON responses / events
 * NOTIFY back on the TX characteristic. Verified against the official Apache-2.0
 * neosensory-sdk-for-bluefruit / -android-java / -python SDKs (2020):
 *   - vibrate  = `motors vibrate <base64>` where base64 encodes one uint8 (0..255) per motor
 *   - init     = auth as developer → accept → audio stop → motors start
 *   - battery  = `device battery_soc` (→ JSON on the TX notify char)
 *
 * Kept pure + framework-free so the frame encoding and CLI parsing are unit-testable
 * without a live GATT link (mirrors services/ble/escpos/escpos.ts vs the printer adapter).
 */

// Nordic UART Service — the Buzz's transport (full 128-bit UUIDs).
export const BUZZ_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
export const BUZZ_WRITE_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e' // RX: central → band
export const BUZZ_NOTIFY_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // TX: band → central

export const BUZZ_MOTOR_COUNT = 4

/** SDK-default motor byte range (a 0..1 intensity of >0 lerps between these). */
export const BUZZ_DEFAULT_MIN_BYTE = 30
export const BUZZ_DEFAULT_MAX_BYTE = 255

/** Init/auth handshake sent once on connect (order matters). */
export const BUZZ_INIT_COMMANDS = [
  'auth as developer',
  'accept',
  'audio stop', // stop the built-in sound-to-touch so our frames own the motors
  'motors start', // enable `motors vibrate`
] as const

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)

/** Map a 0..1 linear intensity to a motor byte. 0 → OFF; >0 lerps min..max (bytes 0..255). */
export function intensityToByte(intensity: number, minByte: number, maxByte: number): number {
  const v = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1)
  if (v <= 0) return 0
  const lo = clamp(Math.round(minByte), 0, 255)
  const hi = clamp(Math.round(maxByte), 0, 255)
  return clamp(Math.round(lo + v * (hi - lo)), 0, 255)
}

/** Base64-encode raw bytes (browser `btoa` over a binary string). */
export function base64FromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export interface BuzzFrame {
  bytes: Uint8Array
  base64: string
  /** Stable dedupe key — identical consecutive frames need not be re-sent. */
  key: string
}

/** Encode a per-motor intensity frame (0..1 each) into the Buzz byte frame + base64 + dedupe key. */
export function encodeMotorFrame(
  intensities: number[],
  minByte: number,
  maxByte: number,
  motorCount = BUZZ_MOTOR_COUNT
): BuzzFrame {
  const bytes = new Uint8Array(motorCount)
  for (let i = 0; i < motorCount; i++) bytes[i] = intensityToByte(intensities[i] ?? 0, minByte, maxByte)
  return { bytes, base64: base64FromBytes(bytes), key: Array.from(bytes).join(',') }
}

/** The `motors vibrate <base64>` CLI command for a frame (newline is added by the transport). */
export function motorsVibrateCommand(base64: string): string {
  return `motors vibrate ${base64}`
}

/** Fields we care about from a CLI JSON message. Defensive — the exact schema varies by
 *  firmware; battery via `device battery_soc` is the reliable path. */
export interface BuzzCliEvent {
  battery?: number
  button?: number
}

/**
 * Extract complete top-level JSON objects from a running text buffer (CLI responses can span
 * multiple BLE notifications). Returns the parsed objects + the unconsumed tail (a partial
 * object still being received). Ignores non-JSON text between objects.
 */
export function extractJsonObjects(buffer: string): { objects: unknown[]; rest: string } {
  const objects: unknown[] = []
  let depth = 0
  let start = -1
  // Track string/escape context so a brace INSIDE a JSON string value can't desync `depth`
  // (a naive counter would close early on an in-string `}` or inflate on an in-string `{`).
  let inStr = false
  let esc = false
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
    } else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      if (depth > 0) {
        depth--
        if (depth === 0 && start >= 0) {
          try {
            objects.push(JSON.parse(buffer.slice(start, i + 1)))
          } catch {
            /* skip a malformed span */
          }
          start = -1
        }
      }
    }
  }
  // Keep an unclosed trailing object (incl. one that ends mid-string) for the next chunk. We always
  // resume from its opening `{`, so string/escape state is re-established correctly on the re-scan.
  const rest = (depth > 0 || inStr) && start >= 0 ? buffer.slice(start) : ''
  return { objects, rest }
}

/** Pull battery %/button signals out of a parsed CLI object (best-effort across firmware shapes). */
export function readCliEvent(obj: unknown): BuzzCliEvent {
  const out: BuzzCliEvent = {}
  if (!obj || typeof obj !== 'object') return out
  const o = obj as Record<string, unknown>
  // Battery: `battery_soc` may be a number or a `{ percentage }` object.
  const bat = o.battery_soc ?? o.battery ?? o.percentage
  if (typeof bat === 'number') {
    out.battery = clamp(Math.round(bat), 0, 100)
  } else if (bat && typeof bat === 'object') {
    const pct = (bat as Record<string, unknown>).percentage
    if (typeof pct === 'number') out.battery = clamp(Math.round(pct), 0, 100)
  }
  // Button: fire only on a TRUTHY `button`/`buttons` value (a number > 0, `true`, a non-empty
  // string, or an event object) — NOT on mere field presence, so a `button:0` "released" state
  // report doesn't spuriously trigger. Exact schema is firmware-dependent (HW-verify).
  const btn = o.button ?? o.buttons
  if (typeof btn === 'number' ? btn > 0 : !!btn) out.button = 1
  return out
}

/** Parse a `#rrggbb` / `#rgb` hex string to an [r,g,b] triple, or null. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * `leds set` — EXPERIMENTAL / HW-UNVERIFIED. The LED CLI is only present in the Bluefruit SDK
 * branch and its wire format isn't documented (the canonical Python/Android SDKs omit it), so this
 * is a best-effort JSON-array form setting all three onboard LEDs to one colour/intensity.
 * Callers MUST tolerate on-device rejection — a failed LED write must never break motor control.
 */
export function ledsSetCommand(rgb: [number, number, number], intensity: number): string {
  const [r, g, b] = rgb.map((v) => clamp(Math.round(v), 0, 255))
  const iv = clamp(Math.round(intensity), 0, 50) // SDK LED intensity: 0 (off) .. 50 (full)
  const colors = `[[${r},${g},${b}],[${r},${g},${b}],[${r},${g},${b}]]`
  const ints = `[${iv},${iv},${iv}]`
  return `leds set ${colors} ${ints}`
}
