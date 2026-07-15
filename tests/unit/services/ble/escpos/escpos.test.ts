import { describe, it, expect } from 'vitest'
import {
  monochrome, packRaster, rasterCommand, feedCommand, buildPrintJob, ESC_INIT,
} from '@/services/ble/escpos/escpos'

/** Build an RGBA buffer from a grayscale value function (0=black..255=white). */
function rgbaFrom(width: number, height: number, gray: (x: number, y: number) => number, alpha = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const g = gray(x, y)
    d[i] = d[i + 1] = d[i + 2] = g
    d[i + 3] = alpha
  }
  return d
}

describe('monochrome', () => {
  it('threshold: pixels darker than the threshold become black (1)', () => {
    const rgba = rgbaFrom(4, 1, (x) => (x < 2 ? 0 : 255)) // black, black, white, white
    const m = monochrome(rgba, 4, 1, 'threshold', 128)
    expect(Array.from(m)).toEqual([1, 1, 0, 0])
  })

  it('composites transparent pixels over white (transparent → not printed)', () => {
    const rgba = rgbaFrom(2, 1, () => 0, 0) // fully black but alpha 0
    expect(Array.from(monochrome(rgba, 2, 1, 'threshold', 128))).toEqual([0, 0])
  })

  it('floyd/atkinson preserve overall ink on a mid-grey field (≈ area coverage)', () => {
    // A 50 % grey field should dither to ≈ half black pixels.
    const rgba = rgbaFrom(32, 32, () => 128)
    for (const mode of ['floyd', 'atkinson'] as const) {
      const m = monochrome(rgba, 32, 32, mode, 128)
      const black = m.reduce((s, v) => s + v, 0)
      expect(black).toBeGreaterThan(32 * 32 * 0.25)
      expect(black).toBeLessThan(32 * 32 * 0.75)
    }
  })

  it('a pure white field prints nothing; a pure black field prints everything', () => {
    expect(monochrome(rgbaFrom(16, 16, () => 255), 16, 16, 'floyd').reduce((s, v) => s + v, 0)).toBe(0)
    expect(monochrome(rgbaFrom(16, 16, () => 0), 16, 16, 'floyd').reduce((s, v) => s + v, 0)).toBe(16 * 16)
  })
})

describe('packRaster', () => {
  it('packs MSB-first, 1 byte per 8 px, padding to the byte', () => {
    // 10 px wide: byte 0 = pixels 0..7, byte 1 = pixels 8,9 in the top two bits.
    const mono = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 1, /* row byte1 */ 1, 1])
    const { data, widthBytes } = packRaster(mono, 10, 1)
    expect(widthBytes).toBe(2) // ceil(10/8)
    expect(data.length).toBe(2)
    expect(data[0]).toBe(0b10000001) // px0 (MSB) + px7 (LSB)
    expect(data[1]).toBe(0b11000000) // px8, px9 in the top bits
  })
})

describe('rasterCommand / feed', () => {
  it('frames GS v 0 with little-endian width-bytes and height', () => {
    const data = new Uint8Array(48 * 200) // 384 px × 200 rows
    const cmd = rasterCommand(data, 48, 200)
    expect(Array.from(cmd.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 200, 0])
    expect(cmd.length).toBe(8 + data.length)
  })

  it('encodes a >255 height across both bytes (little-endian)', () => {
    const cmd = rasterCommand(new Uint8Array(48 * 300), 48, 300)
    expect(Array.from(cmd.slice(6, 8))).toEqual([300 & 0xff, (300 >> 8) & 0xff]) // [44, 1]
  })

  it('feedCommand is ESC d n, clamped to a byte', () => {
    expect(Array.from(feedCommand(3))).toEqual([0x1b, 0x64, 3])
    expect(Array.from(feedCommand(9999))).toEqual([0x1b, 0x64, 255])
  })
})

describe('buildPrintJob', () => {
  it('emits ESC @ init, a GS v 0 block, then a feed', () => {
    const job = buildPrintJob(rgbaFrom(16, 4, () => 0), 16, 4, { feed: 3 })
    expect(Array.from(job.slice(0, 2))).toEqual([...ESC_INIT]) // ESC @
    expect(Array.from(job.slice(2, 5))).toEqual([0x1d, 0x76, 0x30]) // GS v 0
    expect(Array.from(job.slice(-3))).toEqual([0x1b, 0x64, 3]) // trailing feed
  })

  it('does not hang on a band of 0 (clamped to ≥1)', () => {
    // A 0 band would loop forever without the clamp; assert it terminates and prints all rows.
    const job = buildPrintJob(rgbaFrom(8, 8, () => 0), 8, 8, { band: 0, feed: 0 })
    expect(job.length).toBeGreaterThan(8) // init + at least one raster block
  })
})
