import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the three.js r162 -> r184 upgrade (Phase 3b, WebGLRenderer path only).
 * `three` and `@types/three` must stay on the r184 line and in lockstep (the
 * types minor tracks the three minor). The r162->r184 break window is small for
 * our usage — no deprecated encoding constants / legacy lights / lightmap chunk in
 * our code; the only fixes were type-level casts for stricter @types/three 0.184
 * signatures (texture.image -> `{}`, renderer.properties.get() -> `unknown`).
 */

const root = resolve(__dirname, '../../..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('three.js upgrade (Phase 3b)', () => {
  it('declares three r184', () => {
    expect(pkg.dependencies['three']).toMatch(/^\^0\.184\./)
  })

  it('keeps @types/three in lockstep on the r184 line', () => {
    expect(pkg.devDependencies['@types/three']).toMatch(/^\^?0\.184\./)
  })
})
