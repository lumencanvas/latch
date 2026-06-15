import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the @clasp-to/core 3 -> 4 upgrade (Phase 3c). v4 is the current
 * first-party CLASP client; a silent downgrade to v3 would regress it. The v3->v4
 * break does NOT touch the surface LATCH uses (`Clasp` / `ClaspBuilder` / `Value`
 * are identical in v4 — verified against the source + npm; only additive changes:
 * a `browser` export field and an optional 3rd arg on `set()`), so the bump is
 * drop-in and typecheck + build stay green. Realtime send/receive is validated
 * against a running CLASP server.
 */

const root = resolve(__dirname, '../../..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

describe('@clasp-to/core upgrade (Phase 3c)', () => {
  it('declares @clasp-to/core v4', () => {
    expect(pkg.dependencies['@clasp-to/core']).toMatch(/^\^4\./)
  })
})
