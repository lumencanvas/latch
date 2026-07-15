/**
 * ESC/POS raster encoding + dithering for BLE thermal printers (Thread C2).
 *
 * Pure, DOM-free (operates on RGBA byte arrays), so it's fully unit-testable without a
 * printer or a canvas. The node/adapter handle I/O (image→pixels, chunked BLE writes);
 * this turns pixels into the `GS v 0` raster bytes a printer prints.
 *
 * Printers are 1-bit: every pixel is black or white. `mono...` converts grayscale to 1-bit
 * (threshold or error-diffusion dithering); `packRaster` packs it MSB-first (1 = black),
 * and `rasterCommand` frames it as `GS v 0`.
 */

export type DitherMode = 'threshold' | 'floyd' | 'atkinson' | 'ordered'

// ── ESC/POS command bytes ───────────────────────────────────────────────────
/** `ESC @` — reset the printer to its power-on defaults. */
export const ESC_INIT = Uint8Array.of(0x1b, 0x40)
/** `ESC d n` — feed n blank lines. */
export function feedCommand(lines: number): Uint8Array {
  return Uint8Array.of(0x1b, 0x64, Math.max(0, Math.min(255, Math.round(lines))))
}

/** Rec. 601 luma from an RGBA quad (the eye-weighted grayscale printers assume). */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// 4×4 Bayer matrix (normalized to 0..1) for ordered dithering.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16))

/**
 * Convert an RGBA image to a 1-bit black/white bitmap (`1` = black), applying the chosen
 * dithering. `threshold` is 0..255 (mid-grey = 128); higher prints more black. Alpha is
 * composited over white (transparent → white → not printed).
 *
 * @returns a `width*height` Uint8Array of 0/1 (row-major).
 */
export function monochrome(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  mode: DitherMode = 'floyd',
  threshold = 128,
): Uint8Array {
  const n = width * height
  // Grayscale buffer (composited over white), 0..255.
  const gray = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    gray[i] = luma(r, g, b) * a + 255 * (1 - a)
  }

  const out = new Uint8Array(n)
  const black = (i: number, on: boolean) => { out[i] = on ? 1 : 0 }

  if (mode === 'threshold') {
    for (let i = 0; i < n; i++) black(i, gray[i] < threshold)
    return out
  }
  if (mode === 'ordered') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        // Bias the threshold by the Bayer cell; scale around the chosen threshold.
        const t = BAYER4[y & 3][x & 3] * 255
        black(i, gray[i] < (threshold - 128) + t)
      }
    }
    return out
  }

  // Error diffusion (Floyd–Steinberg / Atkinson).
  const push = (x: number, y: number, err: number, num: number, den: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    gray[y * width + x] += (err * num) / den
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const on = gray[i] < threshold
      black(i, on)
      const err = gray[i] - (on ? 0 : 255) // quantization error (target: 0=black, 255=white)
      if (mode === 'floyd') {
        push(x + 1, y, err, 7, 16)
        push(x - 1, y + 1, err, 3, 16)
        push(x, y + 1, err, 5, 16)
        push(x + 1, y + 1, err, 1, 16)
      } else {
        // Atkinson: diffuse 6/8 of the error to 6 neighbours (crisper, lighter).
        push(x + 1, y, err, 1, 8)
        push(x + 2, y, err, 1, 8)
        push(x - 1, y + 1, err, 1, 8)
        push(x, y + 1, err, 1, 8)
        push(x + 1, y + 1, err, 1, 8)
        push(x, y + 2, err, 1, 8)
      }
    }
  }
  return out
}

/**
 * Pack a 1-bit bitmap into MSB-first raster rows (bit set = black), padding each row to a
 * whole byte. @returns the packed bytes plus the row stride in bytes.
 */
export function packRaster(mono: Uint8Array, width: number, height: number): { data: Uint8Array; widthBytes: number } {
  const widthBytes = Math.ceil(width / 8)
  const data = new Uint8Array(widthBytes * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mono[y * width + x]) {
        data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7) // MSB-first
      }
    }
  }
  return { data, widthBytes }
}

/**
 * Frame packed raster rows as the `GS v 0` bit-image command:
 * `0x1D 0x76 0x30 m xL xH yL yH [data]`, m=0, x = bytes/row (LE), y = rows (LE).
 */
export function rasterCommand(data: Uint8Array, widthBytes: number, height: number): Uint8Array {
  const header = Uint8Array.of(
    0x1d, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  )
  const out = new Uint8Array(header.length + data.length)
  out.set(header, 0)
  out.set(data, header.length)
  return out
}

/**
 * Full print payload for one RGBA image already scaled to the printer width: init → raster →
 * feed. Some controllers choke on very tall images, so rows are emitted in horizontal bands.
 */
export function buildPrintJob(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: { mode?: DitherMode; threshold?: number; feed?: number; band?: number } = {},
): Uint8Array {
  const mono = monochrome(rgba, width, height, opts.mode ?? 'floyd', opts.threshold ?? 128)
  const { data, widthBytes } = packRaster(mono, width, height)
  // One GS v 0 block by default (16-bit height covers any receipt); band only to placate
  // controllers with small raster buffers when a caller asks. Clamp ≥1 so a 0/negative band
  // can't spin the loop forever.
  const band = Math.max(1, opts.band ?? height)
  const chunks: Uint8Array[] = [ESC_INIT]
  for (let y = 0; y < height; y += band) {
    const rows = Math.min(band, height - y)
    chunks.push(rasterCommand(data.subarray(y * widthBytes, (y + rows) * widthBytes), widthBytes, rows))
  }
  chunks.push(feedCommand(opts.feed ?? 3))
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}
