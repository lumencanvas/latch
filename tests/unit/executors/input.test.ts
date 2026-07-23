import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import {
  constantExecutor,
  sliderExecutor,
  textboxExecutor,
  knobExecutor,
  xyPadExecutor,
  keyboardExecutor,
  timeExecutor,
  lfoExecutor,
  triggerExecutor,
} from '@/engine/executors/input'

function ctx(
  controls: Record<string, unknown> = {},
  opts: { nodeId?: string; totalTime?: number; deltaTime?: number; frameCount?: number } = {}
): ExecutionContext {
  return {
    nodeId: opts.nodeId ?? 'in-test',
    inputs: new Map(),
    controls: new Map(Object.entries(controls)),
    totalTime: opts.totalTime ?? 0,
    deltaTime: opts.deltaTime ?? 0.016,
    frameCount: opts.frameCount ?? 0,
  } as unknown as ExecutionContext
}

describe('input value sources — passthrough + defaults', () => {
  it('constant / slider / textbox emit their control value (with defaults)', () => {
    expect(constantExecutor(ctx()).get('value')).toBe(0)
    expect(constantExecutor(ctx({ value: 7 })).get('value')).toBe(7)
    expect(sliderExecutor(ctx()).get('value')).toBe(0.5) // slider defaults to 0.5, not 0
    expect(sliderExecutor(ctx({ value: 0.9 })).get('value')).toBe(0.9)
    expect(textboxExecutor(ctx({ text: 'hi' })).get('text')).toBe('hi')
    expect(textboxExecutor(ctx()).get('text')).toBe('')
  })

  it('keyboard passes its control values through', () => {
    const o = keyboardExecutor(ctx({ note: 64, velocity: 80, gate: true, noteOn: true }))
    expect(o.get('note')).toBe(64)
    expect(o.get('velocity')).toBe(80)
    expect(o.get('gate')).toBe(true)
    expect(o.get('noteOn')).toBe(true)
  })

  it('time exposes the engine clock', () => {
    const o = timeExecutor(ctx({}, { totalTime: 3.5, deltaTime: 0.02, frameCount: 210 }))
    expect(o.get('time')).toBe(3.5)
    expect(o.get('delta')).toBe(0.02)
    expect(o.get('frame')).toBe(210)
  })
})

describe('knob / xy-pad — normalized→range mapping', () => {
  it('knob maps its 0..1 value into [min,max]', () => {
    expect(knobExecutor(ctx({ value: 0.5, min: 0, max: 10 })).get('value')).toBe(5)
    expect(knobExecutor(ctx({ value: 0.25, min: 20, max: 40 })).get('value')).toBe(25)
    expect(knobExecutor(ctx({ value: 0 })).get('value')).toBe(0) // default range 0..1
  })

  it('xy-pad maps normX/normY into their ranges and echoes the normalized values', () => {
    const o = xyPadExecutor(ctx({ normalizedX: 0.5, normalizedY: 0.25, minX: 0, maxX: 100, minY: -1, maxY: 1 }))
    expect(o.get('rawX')).toBe(50)
    expect(o.get('rawY')).toBeCloseTo(-0.5, 6)
    expect(o.get('normX')).toBe(0.5)
    expect(o.get('normY')).toBe(0.25)
  })
})

describe('lfoExecutor — waveform generation', () => {
  // phase = totalTime * frequency * 2π. At freq 1: t=0 → 0, t=0.25 → π/2, t=0.5 → π, t=0.75 → 3π/2.
  it('sine follows sin(phase)', () => {
    expect(lfoExecutor(ctx({ waveform: 'sine' }, { totalTime: 0 })).get('value') as number).toBeCloseTo(0, 6)
    expect(lfoExecutor(ctx({ waveform: 'sine' }, { totalTime: 0.25 })).get('value') as number).toBeCloseTo(1, 6)
    expect(lfoExecutor(ctx({ waveform: 'sine' }, { totalTime: 0.75 })).get('value') as number).toBeCloseTo(-1, 6)
  })

  it('square is ±1 around the sine zero crossing', () => {
    expect(lfoExecutor(ctx({ waveform: 'square' }, { totalTime: 0.25 })).get('value')).toBe(1)
    expect(lfoExecutor(ctx({ waveform: 'square' }, { totalTime: 0.75 })).get('value')).toBe(-1)
  })

  it('sawtooth ramps -1..1 over each period', () => {
    expect(lfoExecutor(ctx({ waveform: 'sawtooth' }, { totalTime: 0 })).get('value')).toBe(-1)
    expect(lfoExecutor(ctx({ waveform: 'sawtooth' }, { totalTime: 0.5 })).get('value') as number).toBeCloseTo(0, 6)
  })

  it('triangle peaks at the sine peak', () => {
    expect(lfoExecutor(ctx({ waveform: 'triangle' }, { totalTime: 0 })).get('value') as number).toBeCloseTo(0, 6)
    expect(lfoExecutor(ctx({ waveform: 'triangle' }, { totalTime: 0.25 })).get('value') as number).toBeCloseTo(1, 6)
  })

  it('applies amplitude and offset: value*amp + offset', () => {
    // sine at t=0.25 (freq 1) = 1 → 1*3 + 10 = 13
    const v = lfoExecutor(ctx({ waveform: 'sine', amplitude: 3, offset: 10 }, { totalTime: 0.25 })).get('value') as number
    expect(v).toBeCloseTo(13, 6)
  })
})

describe('triggerExecutor — rising-edge with typed output', () => {
  it('fires ONLY on the false→true edge, not while held', () => {
    const id = 'trig-edge'
    // held low → no output at all
    expect(triggerExecutor(ctx({ value: false }, { nodeId: id })).has('trigger')).toBe(false)
    // rising edge → fires
    expect(triggerExecutor(ctx({ value: true }, { nodeId: id })).get('trigger')).toBe(true)
    // still held high → no re-fire
    expect(triggerExecutor(ctx({ value: true }, { nodeId: id })).has('trigger')).toBe(false)
    // released then pressed → fires again
    triggerExecutor(ctx({ value: false }, { nodeId: id }))
    expect(triggerExecutor(ctx({ value: true }, { nodeId: id })).get('trigger')).toBe(true)
  })

  it('emits the configured output type on fire', () => {
    expect(triggerExecutor(ctx({ value: true, outputType: 'number' }, { nodeId: 'trig-num' })).get('trigger')).toBe(1)
    expect(
      triggerExecutor(ctx({ value: true, outputType: 'string', stringValue: 'go' }, { nodeId: 'trig-str' })).get('trigger')
    ).toBe('go')
    expect(
      triggerExecutor(ctx({ value: true, outputType: 'json', jsonValue: '{"a":1}' }, { nodeId: 'trig-json' })).get('trigger')
    ).toEqual({ a: 1 })
    // malformed JSON degrades to {}
    expect(
      triggerExecutor(ctx({ value: true, outputType: 'json', jsonValue: '{bad' }, { nodeId: 'trig-badjson' })).get('trigger')
    ).toEqual({})
  })
})
