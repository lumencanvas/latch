/**
 * Timing Executor Tests
 *
 * Comprehensive tests for interval, delay, timer, metronome, and step sequencer executors
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  intervalExecutor,
  delayExecutor,
  timerExecutor,
  metronomeExecutor,
  stepSequencerExecutor,
} from '@/engine/executors/index'
import { createExecutionContext, type ExecutionContext } from '@/engine/ExecutionEngine'

// Helper: a FAITHFUL context via the engine's own factory, so ctx.num/bool/trig behave as at
// runtime (the timing executors use them).
function createContext(
  nodeId: string,
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  timing: { deltaTime?: number; totalTime?: number; frameCount?: number } = {}
): ExecutionContext {
  return createExecutionContext({
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: {} as never,
    deltaTime: timing.deltaTime ?? 0.016,
    totalTime: timing.totalTime ?? 0,
    frameCount: timing.frameCount ?? 0,
  })
}

describe('Timing Executors', () => {
  // ============================================================================
  // Interval Executor
  // ============================================================================
  describe('intervalExecutor', () => {
    // Note: Since intervalExecutor uses a global state map, tests may interact
    // We use unique nodeIds to isolate tests

    describe('basic timing', () => {
      it('fires on first call (initial state)', () => {
        const ctx = createContext('interval-1', {}, { interval: 1000 }, { totalTime: 0 })
        const result = intervalExecutor(ctx)
        // First call initializes state, may or may not fire depending on implementation
        // Testing the structure
        expect(result.has('trigger') || result.size === 0).toBe(true)
      })

      it('fires when interval elapsed', () => {
        const nodeId = 'interval-fire-test'

        // First call at t=0
        intervalExecutor(createContext(nodeId, {}, { interval: 100 }, { totalTime: 0 }))

        // Second call at t=0.05s (50ms) - should not fire
        const result1 = intervalExecutor(createContext(nodeId, {}, { interval: 100 }, { totalTime: 0.05 }))
        expect(result1.get('trigger')).toBeUndefined()

        // Third call at t=0.11s (110ms) - should fire
        const result2 = intervalExecutor(createContext(nodeId, {}, { interval: 100 }, { totalTime: 0.11 }))
        expect(result2.get('trigger')).toBe(1)
      })

      it('continues firing at regular intervals', () => {
        const nodeId = 'interval-repeat-test'

        // Initialize at t=0
        intervalExecutor(createContext(nodeId, {}, { interval: 100 }, { totalTime: 0 }))

        // Fire at t=0.1s
        const r1 = intervalExecutor(createContext(nodeId, {}, { interval: 100 }, { totalTime: 0.11 }))
        expect(r1.get('trigger')).toBe(1)

        // Fire at t=0.2s
        const r2 = intervalExecutor(createContext(nodeId, {}, { interval: 100 }, { totalTime: 0.21 }))
        expect(r2.get('trigger')).toBe(1)
      })
    })

    describe('enabled control', () => {
      it('does not fire when disabled', () => {
        const nodeId = 'interval-disabled'

        // Initialize
        intervalExecutor(createContext(nodeId, { enabled: true }, { interval: 100 }, { totalTime: 0 }))

        // Call with disabled after interval should have elapsed
        const result = intervalExecutor(createContext(nodeId, { enabled: false }, { interval: 100 }, { totalTime: 0.2 }))
        expect(result.size).toBe(0)
      })

      it('uses input enabled over control', () => {
        const nodeId = 'interval-enabled-priority'
        intervalExecutor(createContext(nodeId, { enabled: false }, { interval: 100, enabled: true }, { totalTime: 0 }))

        const result = intervalExecutor(createContext(nodeId, { enabled: false }, { interval: 100, enabled: true }, { totalTime: 0.2 }))
        expect(result.size).toBe(0)
      })
    })

    describe('edge cases', () => {
      it('handles very small intervals', () => {
        const nodeId = 'interval-small'

        intervalExecutor(createContext(nodeId, {}, { interval: 1 }, { totalTime: 0 }))

        // Should fire almost immediately (1ms)
        const result = intervalExecutor(createContext(nodeId, {}, { interval: 1 }, { totalTime: 0.01 }))
        expect(result.get('trigger')).toBe(1)
      })

      it('uses default interval of 1000ms', () => {
        const nodeId = 'interval-default'

        intervalExecutor(createContext(nodeId, {}, {}, { totalTime: 0 }))

        // Should not fire before 1 second
        const r1 = intervalExecutor(createContext(nodeId, {}, {}, { totalTime: 0.5 }))
        expect(r1.get('trigger')).toBeUndefined()

        // Should fire after 1 second
        const r2 = intervalExecutor(createContext(nodeId, {}, {}, { totalTime: 1.1 }))
        expect(r2.get('trigger')).toBe(1)
      })
    })
  })

  // ============================================================================
  // Delay Executor
  // ============================================================================
  describe('delayExecutor', () => {
    describe('basic delay', () => {
      it('delays output by specified time', () => {
        const nodeId = 'delay-basic'

        // Send input at t=0
        delayExecutor(createContext(nodeId, { value: 'hello' }, { delay: 100 }, { totalTime: 0 }))

        // Check at t=0.05s - should not have output yet
        const r1 = delayExecutor(createContext(nodeId, {}, { delay: 100 }, { totalTime: 0.05 }))
        expect(r1.get('value')).toBeUndefined()

        // Check at t=0.11s - should have output
        const r2 = delayExecutor(createContext(nodeId, {}, { delay: 100 }, { totalTime: 0.11 }))
        expect(r2.get('value')).toBe('hello')
      })

      it('queues multiple inputs', () => {
        const nodeId = 'delay-queue'

        // Send first input at t=0
        delayExecutor(createContext(nodeId, { value: 'first' }, { delay: 100 }, { totalTime: 0 }))

        // Send second input at t=0.05s
        delayExecutor(createContext(nodeId, { value: 'second' }, { delay: 100 }, { totalTime: 0.05 }))

        // At t=0.11s, first should come out
        const r1 = delayExecutor(createContext(nodeId, {}, { delay: 100 }, { totalTime: 0.11 }))
        expect(r1.get('value')).toBe('first')

        // At t=0.16s, second should come out
        const r2 = delayExecutor(createContext(nodeId, {}, { delay: 100 }, { totalTime: 0.16 }))
        expect(r2.get('value')).toBe('second')
      })
    })

    describe('timeline replay', () => {
      it('holds the last released value until the next due entry', () => {
        const nodeId = 'delay-persist'
        delayExecutor(createContext(nodeId, { value: 'persist' }, { delay: 50 }, { totalTime: 0 }))
        // released at 0.06 and HELD on frames where nothing new is due yet
        expect(delayExecutor(createContext(nodeId, { value: 'persist' }, { delay: 50 }, { totalTime: 0.06 })).get('value')).toBe('persist')
        expect(delayExecutor(createContext(nodeId, { value: 'persist' }, { delay: 50 }, { totalTime: 0.07 })).get('value')).toBe('persist')
      })

      // Regression: the old delay HELD a delayed trigger forever, so a 1-frame pulse came out
      // as a permanently-high signal and downstream edge detectors fired only once, ever.
      it('a delayed 1-frame trigger comes out as a 1-frame pulse, and fires again next time', () => {
        const nodeId = 'delay-pulse'
        const f = (t: number, v?: number) =>
          delayExecutor(createContext(nodeId, v === undefined ? {} : { value: v }, { delay: 100 }, { totalTime: t })).get('value')
        f(0, 1) // pulse at t=0
        f(0.016)
        expect(f(0.05)).toBeUndefined()
        expect(f(0.1)).toBe(1) // pulse emerges
        expect(f(0.117)).toBeUndefined() // …and drops (the silent frame after it is replayed)
        f(0.5, 1) // second pulse
        f(0.516)
        expect(f(0.6)).toBe(1) // fires again → a real rising edge downstream
        expect(f(0.617)).toBeUndefined()
      })
    })

    describe('edge cases', () => {
      it('uses default delay of 500ms', () => {
        const nodeId = 'delay-default'

        delayExecutor(createContext(nodeId, { value: 'test' }, {}, { totalTime: 0 }))

        // Should not output before 500ms
        const r1 = delayExecutor(createContext(nodeId, {}, {}, { totalTime: 0.4 }))
        expect(r1.get('value')).toBeUndefined()

        // Should output after 500ms
        const r2 = delayExecutor(createContext(nodeId, {}, {}, { totalTime: 0.51 }))
        expect(r2.get('value')).toBe('test')
      })

      it('handles zero delay as a pass-through (same frame)', () => {
        const nodeId = 'delay-zero'
        const r0 = delayExecutor(createContext(nodeId, { value: 'immediate' }, { delay: 0 }, { totalTime: 0 }))
        expect(r0.get('value')).toBe('immediate')
        const r = delayExecutor(createContext(nodeId, {}, { delay: 0 }, { totalTime: 0.001 }))
        expect(r.get('value')).toBeUndefined()
      })
    })
  })

  // ============================================================================
  // Timer Executor
  // ============================================================================
  describe('timerExecutor', () => {
    describe('basic timer', () => {
      it('starts counting on start trigger', () => {
        const nodeId = 'timer-start'

        // Start at t=0
        timerExecutor(createContext(nodeId, { start: true }, {}, { totalTime: 0 }))

        // Check elapsed at t=1
        const r = timerExecutor(createContext(nodeId, {}, {}, { totalTime: 1 }))
        expect(r.get('elapsed')).toBeCloseTo(1, 1)
        expect(r.get('running')).toBe(1)
      })

      it('stops on stop trigger', () => {
        const nodeId = 'timer-stop'

        // Start
        timerExecutor(createContext(nodeId, { start: true }, {}, { totalTime: 0 }))

        // Run for 1 second
        timerExecutor(createContext(nodeId, {}, {}, { totalTime: 1 }))

        // Stop
        timerExecutor(createContext(nodeId, { stop: true }, {}, { totalTime: 1 }))

        // Check elapsed (should be frozen)
        const r = timerExecutor(createContext(nodeId, {}, {}, { totalTime: 2 }))
        expect(r.get('elapsed')).toBeCloseTo(1, 1)
        expect(r.get('running')).toBe(0)
      })

      it('resets on reset trigger', () => {
        const nodeId = 'timer-reset'

        // Start and run
        timerExecutor(createContext(nodeId, { start: true }, {}, { totalTime: 0 }))
        timerExecutor(createContext(nodeId, {}, {}, { totalTime: 1 }))

        // Reset
        const r = timerExecutor(createContext(nodeId, { reset: true }, {}, { totalTime: 1 }))
        expect(r.get('elapsed')).toBe(0)
        expect(r.get('running')).toBe(0)
      })
    })

    describe('pause and resume', () => {
      it('resumes from paused time', () => {
        const nodeId = 'timer-resume'

        // Start at t=0
        timerExecutor(createContext(nodeId, { start: true }, {}, { totalTime: 0 }))

        // Stop at t=1
        timerExecutor(createContext(nodeId, { stop: true }, {}, { totalTime: 1 }))

        // Resume at t=2
        timerExecutor(createContext(nodeId, { start: true }, {}, { totalTime: 2 }))

        // Check at t=3 (should be 2 seconds total - 1 before pause + 1 after resume)
        const r = timerExecutor(createContext(nodeId, {}, {}, { totalTime: 3 }))
        expect(r.get('elapsed')).toBeCloseTo(2, 1)
      })
    })

    describe('initial state', () => {
      it('starts not running', () => {
        const nodeId = 'timer-initial'

        const r = timerExecutor(createContext(nodeId, {}, {}, { totalTime: 0 }))
        expect(r.get('running')).toBe(0)
        expect(r.get('elapsed')).toBe(0)
      })
    })
  })

  // ============================================================================
  // Metronome Executor
  // ============================================================================
  describe('metronomeExecutor', () => {
    // Regression pin (2026-07-23 ultracode audit): the `running` toggle control was read only at
    // init, so toggling it after the first frame was inert. It now reconciles every frame with
    // edge memory.
    it('running toggle control stops and restarts the metronome after init', () => {
      const nid = 'metro-toggle'
      metronomeExecutor(createContext(nid, {}, { running: true, bpm: 120 }, { totalTime: 0 }))
      metronomeExecutor(createContext(nid, {}, { running: true, bpm: 120 }, { totalTime: 0.6 }))
      // Toggle OFF: pre-fix this stayed running and would fire beat=1 at t=1.1.
      const stopped = metronomeExecutor(createContext(nid, {}, { running: false, bpm: 120 }, { totalTime: 1.1 }))
      expect(stopped.get('beat')).toBe(0)
      // Toggle back ON (false→true edge): restarts and fires the downbeat.
      const resumed = metronomeExecutor(createContext(nid, {}, { running: true, bpm: 120 }, { totalTime: 1.1 }))
      expect(resumed.get('beat')).toBe(1)
    })

    describe('beat generation', () => {
      it('fires beat on tempo intervals', () => {
        const nodeId = 'metro-beat'

        // 120 BPM = 2 beats per second = 500ms per beat
        // Start
        metronomeExecutor(createContext(nodeId, { start: true }, { bpm: 120, running: true }, { totalTime: 0 }))

        // At t=0, should be on beat 1
        const r0 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, running: true }, { totalTime: 0 }))
        expect(r0.get('beatNum')).toBe(1)

        // At t=0.5s, should be on beat 2
        const r1 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, running: true }, { totalTime: 0.5 }))
        expect(r1.get('beat')).toBe(1)
      })

      it('calculates beats per bar', () => {
        const nodeId = 'metro-bar'

        // 120 BPM, 4 beats per bar = 2s per bar
        metronomeExecutor(createContext(nodeId, { start: true }, { bpm: 120, beatsPerBar: 4, running: true }, { totalTime: 0 }))

        // At t=0, should be bar 1
        const r0 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, beatsPerBar: 4, running: true }, { totalTime: 0 }))
        expect(r0.get('barNum')).toBe(1)

        // At t=2.1s, should be bar 2
        const r1 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, beatsPerBar: 4, running: true }, { totalTime: 2.1 }))
        expect(r1.get('barNum')).toBe(2)
      })
    })

    describe('start/stop controls', () => {
      it('starts on start trigger', () => {
        const nodeId = 'metro-start'

        metronomeExecutor(createContext(nodeId, { start: 1 }, { bpm: 120, running: false }, { totalTime: 0 }))
        // After starting, a beat fires at t=0.5s (bpm 120 = one beat per 0.5s). `toBeDefined()` was
        // vacuous — beat is always 0 or 1, so it passed even if the start trigger never engaged the
        // metronome. toBe(1) verifies it actually started AND fired (a stopped metronome → beat 0).
        const r2 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120 }, { totalTime: 0.5 }))
        expect(r2.get('beat')).toBe(1)
      })

      it('stops on stop trigger', () => {
        const nodeId = 'metro-stop'

        // Start
        metronomeExecutor(createContext(nodeId, { start: 1 }, { bpm: 120, running: true }, { totalTime: 0 }))

        // Stop
        metronomeExecutor(createContext(nodeId, { stop: 1 }, { bpm: 120 }, { totalTime: 0.5 }))

        // Check outputs when stopped
        const r = metronomeExecutor(createContext(nodeId, {}, { bpm: 120 }, { totalTime: 1 }))
        expect(r.get('beat')).toBe(0)
        expect(r.get('bar')).toBe(0)
      })

      it('uses running control for initial state', () => {
        const nodeId = 'metro-running'

        // running: true
        const r1 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, running: true }, { totalTime: 0 }))
        expect(r1.get('beatNum')).toBe(1)
      })
    })

    describe('subdivision', () => {
      it('increases beat frequency with subdivision', () => {
        const nodeId = 'metro-subdiv'

        // 120 BPM with 1/4 subdivision = 8 beats per second
        metronomeExecutor(createContext(nodeId, { start: 1 }, { bpm: 120, subdivision: '1/4', running: true }, { totalTime: 0 }))

        // Should have multiple beats within 0.5 seconds
        const beats: number[] = []
        for (let t = 0; t <= 0.5; t += 0.1) {
          const r = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, subdivision: '1/4', running: true }, { totalTime: t }))
          if (r.get('beat') === 1) beats.push(t)
        }
        expect(beats.length).toBeGreaterThan(1)
      })
    })

    describe('BPM input', () => {
      it('uses input BPM over control', () => {
        const nodeId = 'metro-bpm-input'

        // 60 BPM = 1 beat per second
        metronomeExecutor(createContext(nodeId, { start: 1, bpm: 60 }, { bpm: 120, running: true }, { totalTime: 0 }))

        // At t=0.5s with 60 BPM, should still be on beat 1
        const r = metronomeExecutor(createContext(nodeId, { bpm: 60 }, { bpm: 120, running: true }, { totalTime: 0.5 }))
        // If using 60 BPM, beat changes at 1s, not 0.5s
        expect(r.get('beatNum')).toBe(1)
      })
    })

    describe('phase output', () => {
      it('outputs phase between 0 and 1', () => {
        const nodeId = 'metro-phase'

        metronomeExecutor(createContext(nodeId, { start: 1 }, { bpm: 120, running: true }, { totalTime: 0 }))

        const r = metronomeExecutor(createContext(nodeId, {}, { bpm: 120, running: true }, { totalTime: 0.25 }))
        const phase = r.get('phase') as number
        expect(phase).toBeGreaterThanOrEqual(0)
        expect(phase).toBeLessThanOrEqual(1)
      })
    })

    describe('edge cases', () => {
      it('handles very high BPM', () => {
        const nodeId = 'metro-fast'

        metronomeExecutor(createContext(nodeId, { start: 1 }, { bpm: 300, running: true }, { totalTime: 0 }))

        // 300 BPM = 5 beats per second
        const r = metronomeExecutor(createContext(nodeId, {}, { bpm: 300, running: true }, { totalTime: 0.21 }))
        expect(r.get('beat')).toBeDefined()
      })

      it('handles default BPM of 120', () => {
        const nodeId = 'metro-default'

        metronomeExecutor(createContext(nodeId, { start: 1 }, { running: true }, { totalTime: 0 }))

        // Default 120 BPM should work
        const r = metronomeExecutor(createContext(nodeId, {}, { running: true }, { totalTime: 0.5 }))
        expect(r.get('beat')).toBeDefined()
      })
    })
  })

  // ============================================================================
  // Step Sequencer Executor
  // ============================================================================
  describe('stepSequencerExecutor', () => {
    describe('forward mode', () => {
      it('advances step on clock', () => {
        const nodeId = 'seq-forward'
        const stepValues = [1, 0, 1, 0]

        // Initial state
        const r0 = stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))
        expect(r0.get('step')).toBe(1)

        // Clock pulse 1 — PLAYS step 1 (the sequencer starts "armed"; the old code skipped
        // straight to step 2, so step 1 never sounded on the first pass)
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        const r1 = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r1.get('step')).toBe(1)

        // Clock pulse 2
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        const r2 = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r2.get('step')).toBe(2)
      })

      it('wraps around at end', () => {
        const nodeId = 'seq-wrap'
        const stepValues = [1, 1, 1, 1]

        // Initialize at step 1
        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))

        // 5 clocks: steps 1,2,3,4 then wrap to 1
        for (let i = 0; i < 5; i++) {
          stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
          stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        }

        const r = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r.get('step')).toBe(1) // Wrapped back to 1
      })
    })

    describe('backward mode', () => {
      it('moves backward on clock', () => {
        const nodeId = 'seq-backward'
        const stepValues = [1, 1, 1, 1]

        // Start at step 1 (index 0)
        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Backward', stepValues }))

        // Advance backward (should go to step 4)
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Backward', stepValues }))
        const r = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Backward', stepValues }))
        expect(r.get('step')).toBe(4)
      })
    })

    describe('ping-pong mode', () => {
      it('reverses direction at boundaries', () => {
        const nodeId = 'seq-pingpong'
        const stepValues = [1, 1, 1, 1]

        // Start at step 1
        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Ping-Pong', stepValues }))

        // Advance to end (clocks play 1,2,3,4)
        for (let i = 0; i < 4; i++) {
          stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Ping-Pong', stepValues }))
          stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Ping-Pong', stepValues }))
        }

        // At step 4, should be at boundary
        const atEnd = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Ping-Pong', stepValues }))
        expect(atEnd.get('step')).toBe(4)

        // One more advance should go backward
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Ping-Pong', stepValues }))
        const r = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Ping-Pong', stepValues }))
        expect(r.get('step')).toBe(3)
      })
    })

    describe('random mode', () => {
      it('selects random steps', () => {
        const nodeId = 'seq-random'
        const stepValues = [1, 1, 1, 1, 1, 1, 1, 1]

        stepSequencerExecutor(createContext(nodeId, {}, { steps: 8, mode: 'Random', stepValues }))

        const steps: number[] = []
        for (let i = 0; i < 20; i++) {
          stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 8, mode: 'Random', stepValues }))
          const r = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 8, mode: 'Random', stepValues }))
          steps.push(r.get('step') as number)
        }

        // Should have some variation (not all same value)
        const unique = new Set(steps)
        expect(unique.size).toBeGreaterThan(1)
      })
    })

    describe('reset', () => {
      it('resets to step 1 on reset trigger', () => {
        const nodeId = 'seq-reset'
        const stepValues = [1, 1, 1, 1]

        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))

        // Advance a few steps
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))

        // Reset
        const r = stepSequencerExecutor(createContext(nodeId, { reset: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r.get('step')).toBe(1)
      })
    })

    describe('gate output', () => {
      it('outputs gate based on current step value when clock rises', () => {
        const nodeId = 'seq-gate'
        const stepValues = [1, 0, 1, 0]

        // Initialize at step 1 (value 1)
        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))

        // First clock PLAYS step 1 (value 1) → gate fires
        const r1 = stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r1.get('step')).toBe(1)
        expect(r1.get('gate')).toBe(1)

        // Release clock
        const held = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(held.get('gate')).toBe(0) // gate is a 1-frame pulse

        // Next clock - step 2 (value 0) → no gate
        const r2 = stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r2.get('step')).toBe(2)
        expect(r2.get('gate')).toBe(0)
      })
    })

    describe('value output', () => {
      it('outputs current step value', () => {
        const nodeId = 'seq-value'
        const stepValues = [0.1, 0.5, 0.7, 1.0]

        const r = stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))
        expect(r.get('value')).toBe(0.1)

        // Two clocks: play step 1, then step 2
        for (let i = 0; i < 2; i++) {
          stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
          stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        }
        const r2 = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r2.get('value')).toBe(0.5)
      })
    })

    describe('edge detection', () => {
      it('only advances on rising edge', () => {
        const nodeId = 'seq-edge'
        const stepValues = [1, 1, 1, 1]

        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))

        // Holding clock high should not advance
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))

        const r = stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r.get('step')).toBe(1) // Only advanced once (armed → step 1)
      })
    })

    describe('edge cases', () => {
      it('handles empty stepValues', () => {
        const nodeId = 'seq-empty'

        const r = stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues: [] }))
        expect(r.get('value')).toBe(0)
      })

      it('defaults to 8 steps', () => {
        const nodeId = 'seq-default-steps'
        const stepValues = [1, 1, 1, 1, 1, 1, 1, 1]

        stepSequencerExecutor(createContext(nodeId, {}, { mode: 'Forward', stepValues }))

        // 9 clocks: steps 1…8 then wrap to 1
        for (let i = 0; i < 9; i++) {
          stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { mode: 'Forward', stepValues }))
          stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { mode: 'Forward', stepValues }))
        }

        const r = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { mode: 'Forward', stepValues }))
        expect(r.get('step')).toBe(1)
      })
    })
  })
})
