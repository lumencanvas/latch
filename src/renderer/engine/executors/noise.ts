/**
 * Noise executor — coherent 3D simplex noise with fractal (fBm) octaves.
 *
 * Stateless: the permutation and gradient tables are module-level constants and
 * the output depends only on the inputs/controls, so there is no per-node state
 * to garbage-collect (no gc/dispose wiring required).
 *
 * 3D simplex after Stefan Gustavson's reference implementation; a 1D or 2D field
 * falls out by leaving the unused coordinate inputs at 0.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

// Ken Perlin's reference permutation, doubled to avoid index wrap-around.
const P = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30,
  69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94,
  252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171,
  168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60,
  211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1,
  216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
  164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118,
  126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170,
  213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39,
  253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34,
  242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49,
  192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
  138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
]
const PERM = new Array<number>(512)
for (let i = 0; i < 512; i++) PERM[i] = P[i & 255]

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z
}

/** 3D simplex noise, output approximately in [-1, 1]. */
function simplex3(xin: number, yin: number, zin: number): number {
  const F3 = 1 / 3
  const G3 = 1 / 6

  const s = (xin + yin + zin) * F3
  const i = Math.floor(xin + s)
  const j = Math.floor(yin + s)
  const k = Math.floor(zin + s)
  const t = (i + j + k) * G3
  const x0 = xin - (i - t)
  const y0 = yin - (j - t)
  const z0 = zin - (k - t)

  let i1, j1, k1, i2, j2, k2
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1 }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1 }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1 }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1 }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
  }

  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3

  const ii = i & 255, jj = j & 255, kk = k & 255
  const gi0 = PERM[ii + PERM[jj + PERM[kk]]] % 12
  const gi1 = PERM[ii + i1 + PERM[jj + j1 + PERM[kk + k1]]] % 12
  const gi2 = PERM[ii + i2 + PERM[jj + j2 + PERM[kk + k2]]] % 12
  const gi3 = PERM[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] % 12

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
  if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot3(GRAD3[gi0], x0, y0, z0) }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
  if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot3(GRAD3[gi1], x1, y1, z1) }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
  if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot3(GRAD3[gi2], x2, y2, z2) }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
  if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * dot3(GRAD3[gi3], x3, y3, z3) }

  return 32 * (n0 + n1 + n2 + n3)
}

/** Fractal Brownian motion: sum `octaves` of simplex at halving amplitude / doubling frequency. */
export function fbmNoise(x: number, y: number, z: number, octaves: number): number {
  const oct = Math.max(1, Math.min(8, Math.floor(octaves)))
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let o = 0; o < oct; o++) {
    sum += amp * simplex3(x * freq, y * freq, z * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return norm > 0 ? sum / norm : 0
}

export const noiseExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const x = (ctx.inputs.get('x') as number) ?? 0
  const y = (ctx.inputs.get('y') as number) ?? 0
  const z = (ctx.inputs.get('z') as number) ?? 0
  const frequency = (ctx.controls.get('frequency') as number) ?? 1
  const octaves = (ctx.controls.get('octaves') as number) ?? 1
  const seed = (ctx.controls.get('seed') as number) ?? 0

  // Offset the sample point by the seed so a different seed samples a
  // decorrelated region of the same field — keeps the executor stateless.
  const off = seed * 137.13
  const value = fbmNoise(x * frequency + off, y * frequency + off, z * frequency + off, octaves)
  const clamped = Math.max(-1, Math.min(1, value))

  return new Map<string, unknown>([
    ['value', clamped],
    ['normalized', clamped * 0.5 + 0.5],
  ])
}
