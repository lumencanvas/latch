import { describe, it, expect } from 'vitest'
import * as bellows from 'bellowsjs'
import {
  ENGINES,
  ENGINE_LABELS,
  PARAM_SPECS,
  PRESETS,
  PRESET_SELECT_OPTIONS,
  ENGINE_SELECT_OPTIONS,
  INSERT_FX_OPTIONS,
  isPreset,
  paramControlId,
  buildEngineParamControls,
  resolveVoiceConfig,
  parseRawParams,
  computeParamUpdates,
  computeParamRemovals,
  sameParams,
  paramStep,
  paramLabel,
  buildVoiceControls,
  MANUAL_PRESET_LABEL,
} from './engineParams'

describe('engineParams — engine table', () => {
  it('has a param spec + label for every engine (17 — granular is excluded, it needs a buffer)', () => {
    expect(ENGINES.length).toBe(17)
    expect(ENGINES).not.toContain('granular')
    for (const e of ENGINES) {
      expect(PARAM_SPECS[e], `params for ${e}`).toBeDefined()
      expect(PARAM_SPECS[e].length).toBeGreaterThan(0)
      expect(ENGINE_LABELS[e], `label for ${e}`).toBeTruthy()
    }
  })

  it('every param spec is well-formed (min ≤ default ≤ max)', () => {
    for (const e of ENGINES) {
      for (const p of PARAM_SPECS[e]) {
        expect(p.min, `${e}.${p.name} min≤max`).toBeLessThanOrEqual(p.max)
        expect(p.default, `${e}.${p.name} default≥min`).toBeGreaterThanOrEqual(p.min)
        expect(p.default, `${e}.${p.name} default≤max`).toBeLessThanOrEqual(p.max)
      }
    }
  })

  it('param names are unique within an engine', () => {
    for (const e of ENGINES) {
      const names = PARAM_SPECS[e].map((p) => p.name)
      expect(new Set(names).size, `dup param in ${e}`).toBe(names.length)
    }
  })

  it('ENGINE_SELECT_OPTIONS mirror ENGINES in order', () => {
    expect(ENGINE_SELECT_OPTIONS.map((o) => o.value)).toEqual([...ENGINES])
  })
})

describe('engineParams — presets', () => {
  it('has 50 presets with valid engine ids and unique ids', () => {
    expect(PRESETS.length).toBe(50)
    const ids = PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(50)
    for (const p of PRESETS) {
      expect(ENGINES, `${p.id} → unknown engine ${p.engineId}`).toContain(p.engineId)
      expect(p.label).toBe(
        p.id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
      )
    }
  })

  it('PRESET_SELECT_OPTIONS lead with the manual sentinel', () => {
    expect(PRESET_SELECT_OPTIONS[0]).toEqual({ value: '', label: MANUAL_PRESET_LABEL })
    expect(PRESET_SELECT_OPTIONS.length).toBe(51)
  })

  it('isPreset recognizes real ids and rejects others', () => {
    expect(isPreset('acid-bass')).toBe(true)
    expect(isPreset('')).toBe(false)
    expect(isPreset('va')).toBe(false)
    expect(isPreset('not-a-preset')).toBe(false)
  })
})

describe('engineParams — control generation', () => {
  it('builds one control per (engine, param), gated to engine AND manual mode', () => {
    const controls = buildEngineParamControls()
    const total = ENGINES.reduce((n, e) => n + PARAM_SPECS[e].length, 0)
    expect(controls.length).toBe(total)

    const va0 = PARAM_SPECS.va[0]
    const shape = controls.find((c) => c.id === paramControlId('va', va0.name))!
    expect(shape).toBeDefined()
    expect(shape.default).toBe(va0.default)
    expect(shape.when).toEqual({ engine: 'va', preset: '' })
    // va.shape is a mode index → a labelled select, not a 0–3 number field.
    expect(shape.type).toBe('select')
    expect((shape.props?.options as { value: number; label: string }[]).map((o) => o.label))
      .toEqual(['Saw', 'Square', 'Triangle', 'Sine'])
    const cutoff = controls.find((c) => c.id === paramControlId('va', 'cutoff'))!
    expect(cutoff.type).toBe('number')
    expect(cutoff.props).toMatchObject({ min: 20, max: 20000 })
  })

  it('secondary params hide behind Show All Parameters; core params do not', () => {
    const controls = buildEngineParamControls()
    expect(controls.find((c) => c.id === 'p_va_cutoff')!.when).toEqual({ engine: 'va', preset: '' })
    expect(controls.find((c) => c.id === 'p_va_fAttack')!.when).toEqual({ engine: 'va', preset: '', advanced: true })
    // Small engines show everything.
    for (const c of controls.filter((c) => (c.when as { engine: string }).engine === 'kick')) {
      expect(c.when).not.toHaveProperty('advanced')
    }
  })

  it('no engine opens on more than 10 controls by default', () => {
    const controls = buildEngineParamControls()
    for (const e of ENGINES) {
      const visible = controls.filter((c) => {
        const w = c.when as Record<string, unknown>
        return w.engine === e && !w.advanced
      })
      expect(visible.length, e).toBeLessThanOrEqual(10)
    }
  })

  it('every non-integer param gets a step fine enough to reach its default', () => {
    // Regression: no step → the number field/scrub fell back to step 1, snapping a 0–1
    // sustain to 0/1 and a 0.005 s attack to 0.
    for (const e of ENGINES) {
      for (const p of PARAM_SPECS[e]) {
        const step = paramStep(p)
        expect(step, `${e}.${p.name}`).toBeGreaterThan(0)
        const k = p.default / step
        expect(Math.abs(k - Math.round(k)), `${e}.${p.name} default ${p.default} on step ${step}`).toBeLessThan(1e-6)
      }
    }
  })

  it('labels are human (no raw camelCase ids) and carry units', () => {
    expect(paramLabel('va', PARAM_SPECS.va.find((p) => p.name === 'fAttack')!)).toBe('Filter Attack (s)')
    expect(paramLabel('va', PARAM_SPECS.va.find((p) => p.name === 'cutoff')!)).toBe('Cutoff (Hz)')
    for (const e of ENGINES) {
      for (const p of PARAM_SPECS[e]) {
        expect(paramLabel(e, p), `${e}.${p.name}`).not.toMatch(/^[a-z]+[A-Z]/)
      }
    }
  })

  it('buildVoiceControls orders Preset first, manual block next, trims last', () => {
    const ids = buildVoiceControls('va').map((c) => c.id)
    expect(ids[0]).toBe('preset')
    expect(ids[1]).toBe('engine')
    expect(ids.slice(-3)).toEqual(['sendLevel', 'gain', 'pan'])
    const fxp = buildVoiceControls('va').find((c) => c.id === 'fxParams')!
    expect(fxp.when).toEqual({ preset: '', insertFx: { ne: '' } })
  })

  it('control ids are globally unique across all engines', () => {
    const ids = buildEngineParamControls().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('integer params get step 1', () => {
    const controls = buildEngineParamControls()
    const algo = controls.find((c) => c.id === paramControlId('fm', 'algorithm'))!
    expect(algo.props?.step).toBe(1)
  })
})

// ── Drift guard against the installed bellowsjs catalog ─────────────────────
// The table above is transcribed so the registry needn't import bellows; these diff it against
// bellows' own listEngines()/listEffects()/INSTRUMENT_PRESETS so an upgrade can't drift silently.
describe('engineParams — matches the bellowsjs catalog', () => {
  const catalog = new Map(bellows.listEngines().map((e) => [e.id, e]))
  const ARRAY_EXPANDED = /^(ratio|level|fixed|partial|target|detune)\d+$/

  it('every listed engine exists in bellows', () => {
    for (const e of ENGINES) expect(catalog.has(e), e).toBe(true)
  })

  it('every param spec matches the catalog range, default and unit exactly', () => {
    for (const e of ENGINES) {
      const live = new Map(catalog.get(e)!.params.map((p) => [p.name, p]))
      for (const p of PARAM_SPECS[e]) {
        const c = live.get(p.name)
        expect(c, `${e}.${p.name} missing from bellows`).toBeDefined()
        expect([p.min, p.max, p.default], `${e}.${p.name}`).toEqual([c!.min, c!.max, c!.default])
        expect(p.unit, `${e}.${p.name} unit`).toBe(c!.unit)
        expect(p.curve === 'exp', `${e}.${p.name} curve`).toBe(c!.curve === 'exp')
      }
    }
  })

  it('covers every catalog macro param (only array-expanded params and per-engine pan are left to Raw)', () => {
    for (const e of ENGINES) {
      const ours = new Set(PARAM_SPECS[e].map((p) => p.name))
      const missing = catalog.get(e)!.params
        .map((p) => p.name)
        .filter((n) => !ours.has(n) && n !== 'pan' && !ARRAY_EXPANDED.test(n))
      expect(missing, `${e} params not surfaced`).toEqual([])
    }
  })

  it('built-in engines we leave out are only the buffer-fed granular engine', () => {
    const omitted = [...catalog.keys()].filter((id) => !ENGINES.includes(id))
    expect(omitted).toEqual(['granular'])
  })

  it('presets match INSTRUMENT_PRESETS (ids, families, engines, order)', () => {
    expect(PRESETS.map((p) => [p.id, p.family, p.engineId]))
      .toEqual(bellows.INSTRUMENT_PRESETS.map((p) => [p.id, p.family, p.engineId]))
  })

  it('every insert fx id is a real bellows effect', () => {
    const fx = new Set(bellows.listEffects().map((f) => f.id))
    for (const o of INSERT_FX_OPTIONS.slice(1)) expect(fx.has(o.value), o.value).toBe(true)
  })
})

describe('resolveVoiceConfig — manual mode', () => {
  const base = (extra: [string, unknown][] = []) =>
    new Map<string, unknown>([['preset', ''], ['engine', 'va'], ...extra])

  it('extracts the selected engine params (defaults when unset)', () => {
    const cfg = resolveVoiceConfig(base())
    expect(cfg.preset).toBe('')
    expect(cfg.engine).toBe('va')
    // every va param present with its default
    for (const p of PARAM_SPECS.va) expect(cfg.params[p.name]).toBe(p.default)
  })

  it('overrides a param from its control value', () => {
    const cfg = resolveVoiceConfig(base([[paramControlId('va', 'cutoff'), 1234]]))
    expect(cfg.params.cutoff).toBe(1234)
  })

  it('only the active engine’s params are emitted', () => {
    const cfg = resolveVoiceConfig(base([['engine', 'kick']]))
    expect(Object.keys(cfg.params).sort()).toEqual(PARAM_SPECS.kick.map((p) => p.name).sort())
  })

  it('raw params override/extend the macro params', () => {
    const cfg = resolveVoiceConfig(base([['params', 'cutoff=800, ratio1=2']]))
    expect(cfg.params.cutoff).toBe(800) // override
    expect(cfg.params.ratio1).toBe(2) // extend (array-expanded param)
  })

  it('resolves insert fx and clamps send/pan', () => {
    const cfg = resolveVoiceConfig(base([
      ['insertFx', 'tapeDelay'], ['sendLevel', 2], ['pan', -5], ['gain', 1.3],
    ]))
    expect(cfg.insertFx).toBe('tapeDelay')
    expect(cfg.send).toBe(1) // clamped 0..1
    expect(cfg.pan).toBe(-1) // clamped -1..1
    expect(cfg.gain).toBe(1.3)
  })

  it('rejects an unknown insert fx and unknown engine', () => {
    const cfg = resolveVoiceConfig(base([['engine', 'bogus'], ['insertFx', 'bogus']]))
    expect(cfg.engine).toBe('va') // fallback
    expect(cfg.insertFx).toBeNull()
  })
})

describe('resolveVoiceConfig — preset mode', () => {
  it('carries the preset id and defers params/fx to runtime', () => {
    const cfg = resolveVoiceConfig(new Map<string, unknown>([
      ['preset', 'acid-bass'], ['sendLevel', 0.3], ['gain', 0.5],
    ]))
    expect(cfg.preset).toBe('acid-bass')
    expect(cfg.params).toEqual({}) // preset owns params
    expect(cfg.insertFx).toBeNull()
    expect(cfg.send).toBe(0.3)
    expect(cfg.gain).toBe(0.5)
  })

  it('an invalid preset id falls back to manual', () => {
    const cfg = resolveVoiceConfig(new Map<string, unknown>([['preset', 'nope'], ['engine', 'fm']]))
    expect(cfg.preset).toBe('')
    expect(cfg.engine).toBe('fm')
    expect(Object.keys(cfg.params).length).toBeGreaterThan(0)
  })
})

describe('parseRawParams', () => {
  it('parses a JSON object', () => {
    expect(parseRawParams('{"cutoff": 800, "resonance": 0.4}')).toEqual({ cutoff: 800, resonance: 0.4 })
  })
  it('parses k=v pairs with mixed separators', () => {
    expect(parseRawParams('cutoff=800, ratio1=2; level1=0.5\nfeedback=0.3')).toEqual({
      cutoff: 800, ratio1: 2, level1: 0.5, feedback: 0.3,
    })
  })
  it('accepts a raw object', () => {
    expect(parseRawParams({ a: 1, b: '2', c: 'x' })).toEqual({ a: 1, b: 2 })
  })
  it('drops non-numeric and malformed entries, never throws', () => {
    expect(parseRawParams('cutoff=abc, =5, novalue')).toEqual({})
    expect(parseRawParams('{bad json')).toEqual({})
    expect(parseRawParams('')).toEqual({})
    expect(parseRawParams(null)).toEqual({})
    expect(parseRawParams(42)).toEqual({})
  })
})

describe('computeParamRemovals / sameParams', () => {
  it('lists names dropped from the map (a deleted raw override)', () => {
    expect(computeParamRemovals({ cutoff: 1, ratio2: 3 }, { cutoff: 1 })).toEqual(['ratio2'])
    expect(computeParamRemovals(null, { cutoff: 1 })).toEqual([])
  })
  it('compares by value, order-insensitively', () => {
    expect(sameParams({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(sameParams({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameParams({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })
})

describe('computeParamUpdates', () => {
  it('emits everything when prev is null', () => {
    expect(computeParamUpdates(null, { a: 1, b: 2 })).toEqual([['a', 1], ['b', 2]])
  })
  it('emits only changed values', () => {
    expect(computeParamUpdates({ a: 1, b: 2 }, { a: 1, b: 9 })).toEqual([['b', 9]])
  })
  it('emits nothing when unchanged', () => {
    expect(computeParamUpdates({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual([])
  })
})

describe('INSERT_FX_OPTIONS', () => {
  it('lead with None and carry real bellows fx ids', () => {
    expect(INSERT_FX_OPTIONS[0]).toEqual({ value: '', label: 'None' })
    const ids = INSERT_FX_OPTIONS.map((o) => o.value)
    for (const id of ['delay', 'tapeDelay', 'fdn', 'plate', 'chorus', 'saturator']) {
      expect(ids).toContain(id)
    }
  })
})
