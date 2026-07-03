import { describe, it, expect } from 'vitest'
import { validateUISchema, validateDefinition, ValidationError } from '@/services/customNodes/validator'

/**
 * Phase 3 bullet 2 — `validateUISchema` lets a custom (untrusted) node ship a declarative `ui` only
 * if every widget is Tier-A, every `bind` resolves, and `props`/`when` are primitive-only. This is
 * what makes `ui` safe across the trust boundary; `component` (code) is never accepted.
 */
const controls = new Set(['amount', 'gain'])
const outputs = new Set(['out'])

describe('validateUISchema', () => {
  it('accepts a valid Tier-A schema and returns it sanitized', () => {
    const ui = {
      rows: [
        { label: 'Main', widgets: [{ type: 'slider', bind: 'amount', props: { min: 0, max: 10 } }] },
        { when: { amount: { gt: 5 } }, widgets: [{ type: 'readout', bind: 'out', source: 'output' }] },
      ],
      surfaces: ['panel'],
    }
    const out = validateUISchema(ui, controls, outputs)
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].widgets[0]).toMatchObject({ type: 'slider', bind: 'amount', props: { min: 0, max: 10 } })
    expect(out.surfaces).toEqual(['panel'])
  })

  it('rejects widget types outside the Tier-A closed set (aggregate/event widgets are built-in only)', () => {
    for (const type of ['eq', 'env', 'wave', 'xy', 'piano', 'gamepad', 'curve']) {
      expect(() => validateUISchema({ rows: [{ widgets: [{ type, bind: 'amount' }] }] }, controls, outputs)).toThrow(ValidationError)
    }
  })

  it('rejects a bind that does not resolve to a declared control', () => {
    const ui = { rows: [{ widgets: [{ type: 'slider', bind: 'nope' }] }] }
    expect(() => validateUISchema(ui, controls, outputs)).toThrow(/does not resolve/)
  })

  it('resolves a readout against OUTPUTS, not controls', () => {
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'readout', bind: 'out', source: 'output' }] }] }, controls, outputs)).not.toThrow()
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'readout', bind: 'amount', source: 'output' }] }] }, controls, outputs)).toThrow(/does not resolve/)
  })

  it('rejects a disallowed prop key and a non-primitive prop value', () => {
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'slider', bind: 'amount', props: { evil: 1 } }] }] }, controls, outputs)).toThrow(/not allowed/)
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'slider', bind: 'amount', props: { min: () => 1 } }] }] }, controls, outputs)).toThrow(/primitive/)
  })

  it('rejects prototype-aliasing reserved keys in `when` (untrusted boundary)', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(() =>
        validateUISchema({ rows: [{ widgets: [{ type: 'slider', bind: 'amount', when: { [key]: 1 } }] }] }, controls, outputs),
      ).toThrow(/reserved key/)
    }
    // And it must not pollute Object.prototype in the process.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects a malformed `when` operator and a non-primitive bare value', () => {
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'slider', bind: 'amount', when: { amount: { gt: 'x' } } }] }] }, controls, outputs)).toThrow(/must be a number/)
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'slider', bind: 'amount', when: { amount: { bogus: 1 } } }] }] }, controls, outputs)).toThrow(/operator/)
    expect(() => validateUISchema({ rows: [{ widgets: [{ type: 'slider', bind: 'amount', when: { amount: () => true } }] }] }, controls, outputs)).toThrow(/primitive/)
  })
})

describe('validateDefinition — ui pass-through + component strip', () => {
  const base = {
    id: 'c1', name: 'C', version: '1.0.0', description: '', icon: 'box',
    category: 'custom', platforms: ['web'],
    inputs: [], outputs: [{ id: 'out', type: 'number', label: 'Out' }],
    controls: [{ id: 'amount', type: 'slider', label: 'Amount' }],
  }

  it('passes a valid `ui` through sanitized', () => {
    const def = validateDefinition({ ...base, ui: { rows: [{ widgets: [{ type: 'slider', bind: 'amount' }] }] } })
    expect(def.ui?.rows[0].widgets[0]).toMatchObject({ type: 'slider', bind: 'amount' })
  })

  it('strips `component` (code never crosses the boundary)', () => {
    const def = validateDefinition({ ...base, component: { render: () => null } } as unknown)
    expect(def.component).toBeUndefined()
  })

  it('rejects the whole definition when its `ui` is invalid', () => {
    expect(() => validateDefinition({ ...base, ui: { rows: [{ widgets: [{ type: 'slider', bind: 'ghost' }] }] } })).toThrow(ValidationError)
  })
})
