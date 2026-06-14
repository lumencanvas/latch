import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the transformers.js v3 -> v4 upgrade (Phase 3d). The point of the bump
 * is to be on v4 (C++ WebGPU runtime, q1/q2 dtypes, ModelRegistry); a silent
 * downgrade back to v3 would undo it. The app's `env`/`pipeline` usage is
 * type-compatible with v4 (verified by typecheck + build); runtime model loading
 * is validated in-browser.
 */

const root = resolve(__dirname, '../../..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

describe('transformers.js upgrade (Phase 3d)', () => {
  it('declares @huggingface/transformers v4', () => {
    expect(pkg.dependencies['@huggingface/transformers']).toMatch(/^\^4\./)
  })
})
