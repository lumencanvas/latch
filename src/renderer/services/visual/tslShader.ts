/**
 * TSL shader prototype (Phase 6 — mod/p6-tsl-node).
 *
 * Phase 6's goal is to eliminate GLSL-string injection in favour of a
 * node-native shader graph. Three.js TSL (Three Shading Language) authors shaders
 * as a graph of JS nodes that the renderer compiles to WGSL (WebGPU) or GLSL
 * (WebGL) — no hand-written shader strings. This module is the minimal proof that
 * the TSL authoring path works inside LATCH's build: it constructs a material
 * whose colour is computed entirely from TSL nodes.
 *
 * `three/webgpu` + `three/tsl` are dynamic-imported so the heavy node system stays
 * out of the main bundle. This is validation-only — not yet wired into a node (the
 * same texture-bridge blocker as `rendererBackend.ts` applies; see the plan).
 */

import type { MeshBasicNodeMaterial } from 'three/webgpu'

/**
 * Build an unlit node material whose colour is a UV gradient — `rgb = (u, v, 0)`
 * — authored purely in TSL (`vec4(uv(), 0, 1)`), with no GLSL source string. The
 * renderer compiles the graph to WGSL/GLSL for whichever backend is active.
 */
export async function createUVGradientMaterial(): Promise<MeshBasicNodeMaterial> {
  const { MeshBasicNodeMaterial } = await import('three/webgpu')
  const { uv, vec4 } = await import('three/tsl')
  const material = new MeshBasicNodeMaterial()
  material.colorNode = vec4(uv(), 0, 1)
  return material
}
