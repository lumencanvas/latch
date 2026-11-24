/**
 * Regression tests for the 2026-11 data / math / logic / string / code / timing node audit.
 * Each case pins a bug that was verified against the pre-fix code. Uses the faithful
 * runNode/runFrames helper (real createExecutionContext → ctx.num/bool/trig as at runtime).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runNode, runFrames, resetNodeState } from '../../helpers/testNode'
import type { NodeSpec } from '@/engine/defineNode'

import arraySort from '@/registry/data/array-sort/node'
import arrayRange from '@/registry/data/array-range/node'
import arrayUnique from '@/registry/data/array-unique/node'
import arrayGet from '@/registry/data/array-get/node'
import arrayContains from '@/registry/data/array-contains/node'
import arraySlice from '@/registry/data/array-slice/node'
import arrayJoin from '@/registry/data/array-join/node'
import jsonParse from '@/registry/data/json-parse/node'
import jsonStringify from '@/registry/data/json-stringify/node'
import objectCreate from '@/registry/data/object-create/node'
import objectGet from '@/registry/data/object-get/node'
import objectHas from '@/registry/data/object-has/node'
import formatNumber from '@/registry/data/format-number/node'
import parseInt_ from '@/registry/data/parse-int/node'
import toString_ from '@/registry/data/to-string/node'
import toNumber from '@/registry/data/to-number/node'
import toBoolean from '@/registry/data/to-boolean/node'
import toArray from '@/registry/data/to-array/node'
import router from '@/registry/data/router/node'
import debounce from '@/registry/data/debounce/node'
import throttle from '@/registry/data/throttle/node'
import modulo from '@/registry/math/modulo/node'
import clamp from '@/registry/math/clamp/node'
import add from '@/registry/math/add/node'
import atan2 from '@/registry/math/atan2/node'
import quantize from '@/registry/math/quantize/node'
import remap from '@/registry/math/remap/node'
import smoothstep from '@/registry/math/smoothstep/node'
import smooth from '@/registry/math/smooth/node'
import vectorMath from '@/registry/math/vector-math/node'
import random from '@/registry/math/random/node'
import equals from '@/registry/logic/equals/node'
import changed from '@/registry/logic/changed/node'
import inRange from '@/registry/logic/in-range/node'
import matchValue from '@/registry/logic/match-value/node'
import andNode from '@/registry/logic/and/node'
import gate from '@/registry/logic/gate/node'
import select from '@/registry/logic/select/node'
import stringCase from '@/registry/string/string-case/node'
import stringReplace from '@/registry/string/string-replace/node'
import stringTemplate from '@/registry/string/string-template/node'
import stringSlice from '@/registry/string/string-slice/node'
import stringSplit from '@/registry/string/string-split/node'
import stringContains from '@/registry/string/string-contains/node'
import stringPad from '@/registry/string/string-pad/node'
import counter from '@/registry/code/counter/node'
import valueDelay from '@/registry/code/value-delay/node'
import lfo from '@/registry/timing/lfo/node'
import metronome from '@/registry/timing/metronome/node'
import interval from '@/registry/timing/interval/node'
import timer from '@/registry/timing/timer/node'
import stepSequencer from '@/registry/timing/step-sequencer/node'
import euclidean from '@/registry/timing/euclidean/node'

beforeEach(resetNodeState)

const out = async (spec: NodeSpec, inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}, port = 'result') =>
  (await runNode(spec, { inputs, controls })).get(port)

// ── data ────────────────────────────────────────────────────────────────────────────────
describe('data nodes', () => {
  it('array-sort: auto mode is consistent on mixed arrays; numeric sorts NaN last', async () => {
    expect(await out(arraySort, { array: [10, 9, 1, '2'] })).toEqual([1, '2', 9, 10]) // all numeric → numeric
    expect(await out(arraySort, { array: ['b', 10, 'a', 2] })).toEqual([10, 2, 'a', 'b']) // mixed → string for all
    expect(await out(arraySort, { array: [3, 'x', 1, 2] }, { type: 'numeric' })).toEqual([1, 2, 3, 'x'])
    expect(await out(arraySort, { array: ['item10', 'item2'] }, { type: 'natural' })).toEqual(['item2', 'item10'])
  })

  it('array-range: fractional steps have no float dust or extra element; inputs modulate', async () => {
    expect(await out(arrayRange, {}, { start: 0, end: 0.5, step: 0.1 })).toEqual([0, 0.1, 0.2, 0.3, 0.4])
    expect(await out(arrayRange, { end: 3 }, { start: 0, end: 10, step: 1 })).toEqual([0, 1, 2])
    expect((await out(arrayRange, {}, { start: 0, end: 1e9, step: 1 }) as number[]).length).toBe(10000)
    expect(await out(arrayRange, {}, { start: 3, end: 0, step: 1 })).toEqual([3, 2, 1])
  })

  it('array-unique: 1 and "1" (and null / "null") stay distinct; NaN dedupes', async () => {
    expect(await out(arrayUnique, { array: [1, '1', null, 'null', NaN, NaN, { a: 1 }, { a: 1 }] }))
      .toEqual([1, '1', null, 'null', NaN, { a: 1 }])
  })

  it('array-get: default parses the same way on both miss paths; index control works', async () => {
    expect(await out(arrayGet, {}, { default: '5' }, 'value')).toBe(5) // not an array
    expect(await out(arrayGet, { array: [], index: 3 }, { default: '5' }, 'value')).toBe(5) // out of range
    expect(await out(arrayGet, { array: ['a', 'b'] }, { index: 1 }, 'value')).toBe('b')
  })

  it('array-contains: NaN is found; plain objects match structurally', async () => {
    expect(await out(arrayContains, { array: [1, NaN], value: NaN }, {}, 'index')).toBe(1)
    expect(await out(arrayContains, { array: [{ b: 2, a: 1 }], value: { a: 1, b: 2 } }, {}, 'index')).toBe(0)
    expect(await out(arrayContains, { array: [1], value: '1' }, {}, 'index')).toBe(-1)
  })

  it('array-slice: End -1 = to the end; other negatives keep JS slice meaning (saved flows)', async () => {
    expect(await out(arraySlice, { array: [1, 2, 3] }, { start: 0, end: -1 })).toEqual([1, 2, 3])
    expect(await out(arraySlice, { array: [1, 2, 3] }, { start: 0, end: -2 })).toEqual([1])
  })

  it('array-join: \\n separator escape and JSON objects', async () => {
    expect(await out(arrayJoin, { array: ['a', { k: 1 }, null] }, { separator: '\\n' })).toBe('a\n{"k":1}\n')
  })

  it('json-parse: path walks own properties only and reports found', async () => {
    const r = await runNode(jsonParse, { inputs: { input: '{"a":{"b":0}}' }, controls: { path: 'a.b' } })
    expect(r.get('output')).toBe(0)
    expect(r.get('found')).toBe(1)
    const miss = await runNode(jsonParse, { inputs: { input: '{}' }, controls: { path: 'constructor' } })
    expect(miss.get('output')).toBeUndefined()
    expect(miss.get('found')).toBe(0)
  })

  it('json-stringify: accepts primitives and reports a cyclic value', async () => {
    expect(await out(jsonStringify, { input: 5 }, {}, 'output')).toBe('5')
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    expect((await runNode(jsonStringify, { inputs: { input: cyc } })).get('_error')).toMatch(/serializable/)
  })

  it('object-create: typed key controls; __proto__ key ignored; undefined values skipped', async () => {
    const r = await out(objectCreate, { value1: 1, value2: 2, value3: undefined }, { key1: 'a', key2: '__proto__', key3: 'c' }) as Record<string, unknown>
    expect(r).toEqual({ a: 1 })
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype)
  })

  it('object-get / object-has: inherited members are not "present"', async () => {
    expect(await out(objectHas, { object: {} }, { defaultPath: 'toString' })).toBe(0)
    expect(await out(objectGet, { object: { a: [1, 2] } }, { defaultPath: 'a.length' }, 'value')).toBe(2)
  })

  it('format-number: out-of-range decimals clamp instead of dropping all formatting', async () => {
    expect(await out(formatNumber, { value: 1.5 }, { decimals: 50, locale: 'en-US' })).toMatch(/^1\.50+$/)
    expect(await out(formatNumber, { value: 1234.5 }, { decimals: 1, locale: 'de-DE' })).toBe('1.234,5')
  })

  it('parse-int: #hex, 0b, 0o prefixes; radix clamped', async () => {
    expect(await out(parseInt_, { value: '#ff0000' }, { radix: 16 })).toBe(0xff0000)
    expect(await out(parseInt_, { value: '0b1010' }, { radix: 2 })).toBe(10)
    expect(await out(parseInt_, { value: '0o17' }, { radix: 8 })).toBe(15)
    expect(await out(parseInt_, { value: '42' }, { radix: 99 }, 'valid')).toBe(1)
  })

  it('to-string: fixed precision clamps (no RangeError); typed arrays render as arrays', async () => {
    expect(await out(toString_, { value: 1.5 }, { format: 'fixed', precision: 500 })).toMatch(/^1\.5/)
    expect(await out(toString_, { value: new Uint8Array([12, 34]) })).toBe('[12,34]')
  })

  it('to-number: empty string and Infinity are invalid', async () => {
    expect(await out(toNumber, { value: '  ' }, {}, 'valid')).toBe(0)
    expect(await out(toNumber, { value: Infinity }, {}, 'valid')).toBe(0)
    expect(await out(toNumber, { value: '3.5' })).toBe(3.5)
  })

  it('to-boolean strict: yes/on/1 are true, "false" is false', async () => {
    expect(await out(toBoolean, { value: ' Yes ' }, { mode: 'strict' })).toBe(1)
    expect(await out(toBoolean, { value: 'false' }, { mode: 'strict' })).toBe(0)
  })

  it('to-array: unwired → []; iterables; split escapes + trim', async () => {
    expect(await out(toArray, {})).toEqual([])
    expect(await out(toArray, { value: new Set([1, 2]) }, { mode: 'from' })).toEqual([1, 2])
    expect(await out(toArray, { value: 'a\n b' }, { mode: 'split', separator: '\\n', trim: true })).toEqual(['a', 'b'])
  })

  it('router: a NaN route falls back to the Route control instead of silencing all outputs', async () => {
    const r = await runNode(router, { inputs: { value: 'x', route: NaN }, controls: { route: 2 } })
    expect(r.get('out2')).toBe('x')
  })

  it('debounce: HOLDS the last settled value while the input is changing', async () => {
    const frames = await runFrames(debounce, [
      { inputs: { value: 1 }, controls: { delay: 100 }, totalTime: 0 },
      { inputs: { value: 1 }, controls: { delay: 100 }, totalTime: 0.2 }, // settles → 1
      { inputs: { value: 2 }, controls: { delay: 100 }, totalTime: 0.25 }, // changing
      { inputs: { value: 3 }, controls: { delay: 100 }, totalTime: 0.3 }, // still changing
      { inputs: { value: 3 }, controls: { delay: 100 }, totalTime: 0.45 }, // settles → 3
    ])
    expect(frames.map((f) => f.get('result'))).toEqual([undefined, 1, 1, 1, 3])
    expect(frames[3].get('pending')).toBe(1)
    // a cyclic value must not throw
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    await expect(runNode(debounce, { inputs: { value: cyc }, nodeId: 'cyc' })).resolves.toBeDefined()
  })

  it('throttle: a 1-frame pulse passes (leading edge) and drops back; trailing value emitted', async () => {
    const f = await runFrames(throttle, [
      { inputs: { value: 1 }, controls: { interval: 100 }, totalTime: 0.0 }, // leading → 1
      { inputs: {}, controls: { interval: 100 }, totalTime: 0.016 }, // falls low immediately
      { inputs: { value: 5 }, controls: { interval: 100 }, totalTime: 0.03 }, // inside window → pending
      { inputs: { value: 5 }, controls: { interval: 100 }, totalTime: 0.11 }, // window closed → trailing 5
    ])
    expect(f.map((m) => m.get('result'))).toEqual([1, undefined, undefined, 5])
  })
})

// ── math ────────────────────────────────────────────────────────────────────────────────
describe('math nodes', () => {
  it('modulo: Positive is Euclidean for negative divisors; quotient output', async () => {
    expect(await out(modulo, { value: -1 }, { divisor: -3, mode: 'Positive' })).toBe(2)
    expect(await out(modulo, { value: -1 }, { divisor: 3, mode: 'Floor' })).toBe(2)
    expect(await out(modulo, { value: -1 }, { divisor: -3, mode: 'Floor' })).toBe(-1)
    expect(await out(modulo, { value: 7 }, { divisor: 3 }, 'quotient')).toBe(2)
    expect(await out(modulo, { value: -1e-17 }, { divisor: 1, mode: 'Floor' })).toBe(0)
  })

  it('clamp: inverted bounds are normalised; NaN → lower bound', async () => {
    expect(await out(clamp, { value: 0.5 }, { min: 1, max: 0 })).toBe(0.5)
    expect(await out(clamp, { value: NaN }, { min: 2, max: 5 })).toBe(2)
    expect(await out(clamp, { value: Infinity }, { min: 0, max: 1 })).toBe(1)
  })

  it('add: numeric strings add (not concatenate)', async () => {
    expect(await out(add, { a: '2', b: 3 })).toBe(5)
  })

  it('atan2: Output Degrees', async () => {
    expect(await out(atan2, { y: 1, x: 0 }, { degrees: true })).toBeCloseTo(90)
  })

  it('quantize: no float dust; floor/ceil modes', async () => {
    expect(await out(quantize, { value: 0.31 }, { step: 0.1 })).toBe(0.3)
    expect(await out(quantize, { value: 0.39 }, { step: 0.1, mode: 'floor' })).toBe(0.3)
    expect(await out(quantize, { value: 0.31 }, { step: 0.1, mode: 'ceil' })).toBe(0.4)
  })

  it('remap: unclamped easing extrapolates monotonically (no fold-back)', async () => {
    const below = await out(remap, { value: -1 }, { clamp: false, easing: 'ease-in', outMin: 0, outMax: 100 }) as number
    expect(below).toBe(-100)
  })

  it('smoothstep: value exactly at an edge', async () => {
    expect(await out(smoothstep, { value: 0 }, { edge0: 0, edge1: 1 })).toBe(0)
    expect(await out(smoothstep, { value: 1 }, { edge0: 0, edge1: 1 })).toBe(1)
    expect(await out(smoothstep, { value: 0.5 }, { edge0: 0.5, edge1: 0.5 })).toBe(1) // degenerate edge
    expect(await out(smoothstep, { value: 0.5, edge0: 0, edge1: 1 })).toBe(0.5) // edges as inputs
  })

  it('smooth: a NaN frame holds instead of poisoning; low fps still smooths', async () => {
    const f = await runFrames(smooth, [
      { inputs: { value: 0 }, controls: { factor: 0.1 } },
      { inputs: { value: NaN }, controls: { factor: 0.1 } },
      { inputs: { value: 1 }, controls: { factor: 0.1 }, deltaTime: 0.25 },
    ])
    expect(f[1].get('result')).toBe(0)
    const r = f[2].get('result') as number
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1) // old linear form clamped alpha to 1 → jumped straight to 1
  })

  it('vector-math: Dot magnitude is |dot|', async () => {
    const r = await runNode(vectorMath, { inputs: { ax: 1, bx: -2 }, controls: { operation: 'Dot' } })
    expect(r.get('x')).toBe(-2)
    expect(r.get('magnitude')).toBe(2)
  })

  it('random: on-trigger mode holds until the trigger edge; integers inclusive', async () => {
    const f = await runFrames(random, [
      { controls: { mode: 'on-trigger' } },
      { controls: { mode: 'on-trigger' } },
    ])
    expect(f[0].get('result')).toBe(f[1].get('result'))
    for (let i = 0; i < 50; i++) {
      const v = (await runNode(random, { controls: { min: 1, max: 3, integer: true }, nodeId: `r${i}` })).get('result') as number
      expect([1, 2, 3]).toContain(v)
    }
  })
})

// ── logic ───────────────────────────────────────────────────────────────────────────────
describe('logic nodes', () => {
  it('equals: wired 5 equals typed "5" (control parsed as JSON); NaN equals NaN; cyclic safe', async () => {
    expect(await out(equals, { a: 5 }, { b: '5', strict: true })).toBe(1)
    expect(await out(equals, { a: NaN, b: NaN })).toBe(1)
    const c: Record<string, unknown> = {}
    c.self = c
    expect(await out(equals, { a: c, b: c })).toBe(1)
  })

  it('changed: NaN is not "changed" every frame', async () => {
    const f = await runFrames(changed, [{ inputs: { value: NaN } }, { inputs: { value: NaN } }])
    expect(f[1].get('changed')).toBe(0)
  })

  it('in-range: inverted bounds normalised', async () => {
    expect(await out(inRange, { value: 0.5 }, { min: 1, max: 0 })).toBe(1)
  })

  it('match-value: the string "false" does not match target "true"', async () => {
    expect(await out(matchValue, { value: 'false' }, { target: 'true' })).toBe(0)
    expect(await out(matchValue, { value: '' }, { target: '0' })).toBe(0)
  })

  it('and: the string "false" is false', async () => {
    expect(await out(andNode, { a: 'false', b: true })).toBe(0)
  })

  it('gate: an open gate passes a 1-frame trigger as a pulse (not stuck high)', async () => {
    const f = await runFrames(gate, [
      { inputs: { value: 1, gate: true } },
      { inputs: { gate: true } },
      { inputs: { value: 7, gate: false } },
    ])
    expect(f.map((m) => m.get('result'))).toEqual([1, undefined, 1]) // closed → hold last passed
    const blocked = await runNode(gate, { inputs: { value: 7, gate: false }, controls: { whenClosed: 'block' }, nodeId: 'g2' })
    expect(blocked.get('result')).toBeUndefined()
  })

  it('select: index control + NaN index', async () => {
    expect(await out(select, { a: 'A', b: 'B' }, { index: 1 })).toBe('B')
    expect(await out(select, { a: 'A', b: 'B', index: NaN })).toBe('A')
  })
})

// ── string ──────────────────────────────────────────────────────────────────────────────
describe('string nodes', () => {
  it('string-case: keeps camel boundaries; no leading capital / trailing separators', async () => {
    expect(await out(stringCase, { input: 'helloWorld' }, { mode: 'snake_case' })).toBe('hello_world')
    expect(await out(stringCase, { input: '  foo bar ' }, { mode: 'camelCase' })).toBe('fooBar')
    expect(await out(stringCase, { input: 'foo bar ' }, { mode: 'kebab-case' })).toBe('foo-bar')
    expect(await out(stringCase, { input: "it's here" }, { mode: 'Title' })).toBe("It's Here")
  })

  it('string nodes never throw on object inputs', async () => {
    expect(await out(stringCase, { input: { a: 1 } }, { mode: 'UPPER' })).toBe('{"A":1}')
  })

  it('string-replace: literal mode does not interpret $& in the replacement; keeps the _error port (saved wires)', async () => {
    expect(await out(stringReplace, { input: 'a-b' }, { search: '-', replace: '$&$&', replaceAll: false })).toBe('a$&$&b')
    expect(stringReplace.definition.outputs.some((p) => p.id === '_error')).toBe(true)
  })

  it('equals: a typed control stays text against a wired string (saved-flow compat), parses against a number', async () => {
    const { default: equals } = await import('@/registry/logic/equals/node')
    expect(await out(equals, { a: '42' }, { b: '42', strict: true })).toBe(1)
    expect(await out(equals, { a: 42 }, { b: '42', strict: true })).toBe(1)
    expect(await out(equals, { a: 'x' }, { b: '"x"', strict: true })).toBe(0)
  })

  it('string-template: a value containing $& is inserted literally; objects as JSON', async () => {
    expect(await out(stringTemplate, { a: '$&', b: { k: 1 } }, { template: '{a} {b}' })).toBe('$& {"k":1}')
  })

  it('string-slice: End -1 = to the end; End -2 keeps JS slice meaning (saved flows)', async () => {
    expect(await out(stringSlice, { input: 'abc' }, { start: 0, end: -1 })).toBe('abc')
    expect(await out(stringSlice, { input: 'abc' }, { start: 0, end: -2 })).toBe('a')
  })

  it('string-split: \\n separator + trim', async () => {
    expect(await out(stringSplit, { input: 'a\n b' }, { separator: '\\n', trim: true }, 'parts')).toEqual(['a', 'b'])
  })

  it('string-contains: search can be typed', async () => {
    expect(await out(stringContains, { input: 'hello' }, { search: 'ell' })).toBe(1)
  })

  it('string-pad: huge length is clamped (no RangeError)', async () => {
    expect((await out(stringPad, { input: 'x' }, { length: 1e12 }) as string).length).toBe(10000)
  })
})

// ── code ────────────────────────────────────────────────────────────────────────────────
describe('code nodes', () => {
  it('counter: a continuously-wired Set no longer pins the count', async () => {
    const f = await runFrames(counter, [
      { inputs: { set: 5 } },
      { inputs: { set: 5, increment: 1 } },
      { inputs: { set: 5, increment: 0 } },
      { inputs: { set: 5, increment: 1 } },
    ])
    expect(f.map((m) => m.get('count'))).toEqual([5, 6, 6, 7])
  })

  it('counter: min === max gives normalized 0 (not NaN)', async () => {
    expect(await out(counter, {}, { min: 3, max: 3 }, 'normalized')).toBe(0)
  })

  it('value-delay: an early trigger is NOT passed through undelayed', async () => {
    const f = await runFrames(valueDelay, [
      { inputs: { input: 1 }, controls: { frames: 2 } },
      { inputs: {}, controls: { frames: 2 } },
      { inputs: {}, controls: { frames: 2 } },
      { inputs: {}, controls: { frames: 2 } },
    ])
    expect(f.map((m) => m.get('output'))).toEqual([undefined, undefined, 1, undefined])
  })
})

// ── timing ──────────────────────────────────────────────────────────────────────────────
describe('timing nodes', () => {
  it('lfo: changing frequency does not jump the phase', async () => {
    // At t = 100 s, the old totalTime*frequency form jumped a whole cycle for 1 → 1.01 Hz.
    const f = await runFrames(lfo, [
      { controls: { frequency: 1 }, totalTime: 100, deltaTime: 1 / 60 },
      { controls: { frequency: 1.01 }, totalTime: 100 + 1 / 60, deltaTime: 1 / 60 },
    ])
    const a = f[0].get('value') as number
    const b = f[1].get('value') as number
    expect(Math.abs(b - a)).toBeLessThan(0.2) // one frame of a 1 Hz sine moves ≤ 0.105
  })

  it('lfo: frequency input modulates; reset restarts the cycle', async () => {
    const r = await runFrames(lfo, [
      { inputs: { frequency: 0.25 }, controls: { waveform: 'sawtooth' }, totalTime: 0 },
      { inputs: { frequency: 0.25 }, controls: { waveform: 'sawtooth' }, totalTime: 1, deltaTime: 1 },
      { inputs: { frequency: 0.25, reset: 1 }, controls: { waveform: 'sawtooth' }, totalTime: 2, deltaTime: 1 },
    ])
    expect(r[1].get('value')).toBeCloseTo(-0.5) // quarter cycle of a −1…1 saw
    expect(r[2].get('value')).toBe(-1)
  })

  it('metronome: a BPM change does not jump the beat position', async () => {
    const frames = []
    for (let i = 0; i <= 61; i++) frames.push({ controls: { bpm: i < 60 ? 120 : 121 }, totalTime: 100 + i / 60, frameCount: i })
    const f = await runFrames(metronome, frames)
    // 1 s at 120 BPM = 2 beats; the BPM change at frame 60 must not add ~13 extra ticks.
    expect(f[61].get('beatNum')).toBe(3)
    expect(f[61].get('barNum')).toBe(1)
  })

  it('metronome: fast ticks still drop low between pulses (edges survive)', async () => {
    const frames = []
    for (let i = 0; i < 10; i++) frames.push({ controls: { bpm: 999, subdivision: '1/16' }, totalTime: i / 60, frameCount: i })
    const beats = (await runFrames(metronome, frames)).map((m) => m.get('beat'))
    for (let i = 1; i < beats.length; i++) expect(beats[i] === 1 && beats[i - 1] === 1).toBe(false)
  })

  it('metronome: swing delays the off-beat trigger itself', async () => {
    const frames = []
    for (let i = 0; i <= 40; i++) frames.push({ controls: { bpm: 60, swing: 100 }, totalTime: i / 20, frameCount: i })
    const f = await runFrames(metronome, frames)
    const firstOff = f.findIndex((m, i) => i > 0 && m.get('beat') === 1)
    expect(firstOff / 20).toBeCloseTo(1.5, 1) // straight would be 1.0 s
  })

  it('interval: does not drift (schedule-based), and re-enabling restarts the period', async () => {
    const frames = []
    for (let i = 0; i <= 600; i++) frames.push({ controls: { interval: 1000 }, totalTime: i * 0.017 })
    const fires = (await runFrames(interval, frames)).filter((m) => m.get('trigger') === 1).length
    expect(fires).toBe(10) // 10.2 s → 10 ticks (snapping to frame time lost one)
  })

  it('timer: a held-high start does not restart the timer right after stop', async () => {
    const f = await runFrames(timer, [
      { inputs: { start: 1 }, totalTime: 0 },
      { inputs: { start: 1, stop: 1 }, totalTime: 1 },
      { inputs: { start: 1 }, totalTime: 2 },
    ])
    expect(f[2].get('running')).toBe(0)
    expect(f[2].get('elapsed')).toBeCloseTo(1)
  })

  it('step-sequencer: the first clock plays step 1; a held reset no longer blocks the clock', async () => {
    const ctl = { steps: 4, stepValues: [1, 0, 0, 0] }
    const f = await runFrames(stepSequencer, [
      { inputs: { clock: 1 }, controls: ctl },
      { inputs: { clock: 0, reset: 1 }, controls: ctl },
      { inputs: { clock: 1, reset: 1 }, controls: ctl }, // reset held high
    ])
    expect(f[0].get('step')).toBe(1)
    expect(f[0].get('gate')).toBe(1)
    expect(f[2].get('step')).toBe(1) // re-armed by the reset edge → clock plays step 1
    expect(f[2].get('gate')).toBe(1)
  })

  it('euclidean: Onset pulses on every pulse step, even adjacent ones', async () => {
    const f = await runFrames(euclidean, [0, 1, 1, 2].map((step) => ({ inputs: { step }, controls: { steps: 4, pulses: 4 } })))
    expect(f.map((m) => m.get('trigger'))).toEqual([1, 1, 0, 1])
    expect(f.map((m) => m.get('gate'))).toEqual([true, true, true, true])
  })
})
