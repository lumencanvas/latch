import { describe, it, expect } from 'vitest'
import { createUVGradientMaterial } from '@/services/visual/tslShader'

/**
 * Phase 6 (mod/p6-tsl-node): the TSL authoring path must build a node material
 * with a graph-based colour (no GLSL string). Graph construction needs no GPU
 * device, so it can be exercised headlessly; the actual WGSL compile + render is
 * browser-validated separately.
 */
describe('createUVGradientMaterial', () => {
  it('builds a node material whose colour comes from a TSL graph, not a string', async () => {
    const material = await createUVGradientMaterial()
    expect(material).toBeTruthy()
    expect(material.isMeshBasicNodeMaterial).toBe(true)
    // colorNode is the TSL graph node; its presence (not a GLSL string) is the point.
    expect(material.colorNode).toBeTruthy()
    expect(typeof material.colorNode).toBe('object')
    material.dispose()
  })
})
