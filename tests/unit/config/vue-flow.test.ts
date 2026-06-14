import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the Vue Flow upgrade (Phase 3a): package.json must declare the versions
 * we actually run/test against (node_modules already resolved to 1.48.x), and the
 * editor must keep the large-graph virtualization flag enabled. These are easy to
 * regress in a dependency or template refactor.
 */

const root = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

function major(range: string): number {
  return Number(range.replace(/^[^0-9]*/, '').split('.')[0])
}

describe('Vue Flow upgrade (Phase 3a)', () => {
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }

  it('package.json declares the upgraded @vue-flow floors', () => {
    expect(pkg.dependencies['@vue-flow/core']).toBe('^1.48.2')
    expect(pkg.dependencies['@vue-flow/background']).toBe('^1.3.2')
    expect(pkg.dependencies['@vue-flow/controls']).toBe('^1.1.3')
    expect(pkg.dependencies['@vue-flow/minimap']).toBe('^1.5.4')
  })

  it('stays on the 1.x major (no accidental v2 jump)', () => {
    for (const p of ['@vue-flow/core', '@vue-flow/background', '@vue-flow/controls', '@vue-flow/minimap']) {
      expect(major(pkg.dependencies[p])).toBe(1)
    }
  })

  it('enables only-render-visible-elements on the editor canvas', () => {
    const editor = read('src/renderer/views/EditorView.vue')
    expect(editor).toMatch(/:only-render-visible-elements="true"/)
  })
})
