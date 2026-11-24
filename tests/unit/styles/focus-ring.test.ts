import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * base.css once had `input:focus, …, button:focus { outline: none }` — specificity (0,1,1)
 * beats the global `:focus-visible` ring (0,1,0), so keyboard users saw NO focus ring on any
 * form control app-wide. happy-dom can't evaluate :focus-visible, so pin the source instead.
 */
const css = readFileSync(resolve(process.cwd(), 'src/renderer/assets/styles/base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('base.css focus ring', () => {
  it('never removes the outline on a plain :focus of form controls', () => {
    // Any selector ending in `:focus` (not `:focus:not(:focus-visible)`) inside an outline:none rule.
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    for (const [, selector, body] of rules) {
      if (!/outline\s*:\s*(none|0)/.test(body)) continue
      for (const sel of selector.split(',').map((s) => s.trim())) {
        expect(sel, `"${sel}" kills the keyboard focus ring`).not.toMatch(/:focus\s*$/)
      }
    }
  })

  it('keeps the global :focus-visible ring', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/)
  })
})
