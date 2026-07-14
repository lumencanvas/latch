import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Guards the repo's recurring "silent design-token" bug class: a `var(--token)` reference
 * with NO fallback, where `--token` is defined nowhere, silently resolves to an invalid
 * value and the property is dropped (broken rounding, missing error/warning colors, etc.).
 * This test fails if any such reference exists, so the class can't reopen. Give a genuine
 * fallback (`var(--x, <fallback>)`) or define the token in tokens.css.
 */

const ROOT = resolve(process.cwd(), 'src/renderer')

// Custom properties set at RUNTIME (via :style / element.style bindings), not design tokens —
// they legitimately have no tokens.css declaration.
const RUNTIME_ALLOWLIST = new Set([
  '--accent-color',
  '--port-color',
  '--port-count',
  '--port-spacing',
  '--cell-size',
])

function collect(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (/\.(css|vue)$/.test(e.name)) out.push(p)
  }
  return out
}

describe('design tokens', () => {
  const files = collect(ROOT)
  const defined = new Set<string>()
  const texts = files.map((f) => {
    const t = readFileSync(f, 'utf8')
    for (const m of t.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1])
    return { f, t }
  })

  it('every no-fallback var(--token) resolves to a defined token or a runtime-set property', () => {
    const missing: string[] = []
    for (const { f, t } of texts) {
      for (const m of t.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)) {
        const tok = m[1]
        const hasFallback = Boolean(m[2])
        if (hasFallback || defined.has(tok) || RUNTIME_ALLOWLIST.has(tok)) continue
        missing.push(`${tok}  (${f.slice(ROOT.length + 1)})`)
      }
    }
    expect(
      missing,
      `Undefined design token(s) used without a fallback — add to tokens.css or give a var() fallback:\n${[
        ...new Set(missing),
      ].join('\n')}`
    ).toEqual([])
  })
})
