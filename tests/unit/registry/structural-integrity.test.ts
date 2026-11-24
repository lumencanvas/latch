import { describe, it, expect } from 'vitest'
// Load the SFC component map before '@/registry' (circular-init hazard under happy-dom;
// see nodeRegistry.test.ts).
import '@/registry/components'
import { allNodes } from '@/registry'

/**
 * Whole-library structural invariants (added in the 2026-07-23 audit — see
 * docs/AUDIT_2026-07-23.md). Every built-in node definition must be internally consistent;
 * these catch a class of authoring mistakes the count/dup-id glob guards don't:
 *
 *  - duplicate control / port ids inside one node (a later one silently shadows the earlier),
 *  - a `when` conditional whose key is not a control on the same node (a dead condition that
 *    hides the control forever or shows it always — the historical sample-hold class of "looks
 *    wired, behaves wrong"),
 *  - a `select` with no options and no dynamic source (renders an empty, unusable dropdown),
 *  - a numeric control whose min > max, or missing a default.
 *
 * At the time of writing the whole 251-node library passes clean; this pins that so a new or
 * edited node can't regress it.
 */
interface Port { id: string; type?: string }
interface Control {
  id: string
  type?: string
  default?: unknown
  when?: Record<string, unknown>
  props?: Record<string, unknown>
}
interface Def { id: string; inputs?: Port[]; outputs?: Port[]; controls?: Control[] }

const defs = allNodes as unknown as Def[]

function dupIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dups.add(id)
    seen.add(id)
  }
  return [...dups]
}

describe('structural integrity — every built-in node', () => {
  it('has no duplicate control ids', () => {
    const bad = defs
      .map((d) => ({ id: d.id, dups: dupIds((d.controls ?? []).map((c) => c.id)) }))
      .filter((x) => x.dups.length)
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('has no duplicate input or output port ids', () => {
    const bad = defs
      .map((d) => ({
        id: d.id,
        inDups: dupIds((d.inputs ?? []).map((p) => p.id)),
        outDups: dupIds((d.outputs ?? []).map((p) => p.id)),
      }))
      .filter((x) => x.inDups.length || x.outDups.length)
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('has no dead `when` conditions (every key is a control on the same node)', () => {
    const bad: string[] = []
    for (const d of defs) {
      const controlIds = new Set((d.controls ?? []).map((c) => c.id))
      for (const c of d.controls ?? []) {
        for (const key of Object.keys(c.when ?? {})) {
          if (!controlIds.has(key)) bad.push(`${d.id}.${c.id} → when:"${key}"`)
        }
      }
    }
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('has no `select` control with an empty option set and no dynamic source', () => {
    const bad: string[] = []
    for (const d of defs) {
      for (const c of d.controls ?? []) {
        if (c.type !== 'select') continue
        const opts = c.props?.options as unknown[] | undefined
        if (!c.props?.deviceType && (!opts || opts.length === 0)) bad.push(`${d.id}.${c.id}`)
      }
    }
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('has no numeric control with min > max or a missing default', () => {
    const badRange: string[] = []
    const noDefault: string[] = []
    for (const d of defs) {
      for (const c of d.controls ?? []) {
        if (c.type !== 'number' && c.type !== 'slider') continue
        const min = c.props?.min
        const max = c.props?.max
        if (typeof min === 'number' && typeof max === 'number' && min > max) {
          badRange.push(`${d.id}.${c.id} (min=${min} > max=${max})`)
        }
        if (c.default === undefined) noDefault.push(`${d.id}.${c.id}`)
      }
    }
    expect(badRange, JSON.stringify(badRange)).toEqual([])
    expect(noDefault, JSON.stringify(noDefault)).toEqual([])
  })
})
