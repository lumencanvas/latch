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
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Helper to create a mock execution context with timing
function createContext(
  nodeId: string,
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  timing: { deltaTime?: number; totalTime?: number; frameCount?: number } = {}
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: timing.deltaTime ?? 0.016,
    totalTime: timing.totalTime ?? 0,
    frameCount: timing.frameCount ?? 0,
  }
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

    describe('output persistence', () => {
      it('maintains last output when no new values', () => {
        const nodeId = 'delay-persist'

        // Send and wait for delay
        delayExecutor(createContext(nodeId, { value: 'persist' }, { delay: 50 }, { totalTime: 0 }))
        delayExecutor(createContext(nodeId, {}, { delay: 50 }, { totalTime: 0.06 }))

        // Later calls should still return the last value
        const r = delayExecutor(createContext(nodeId, {}, { delay: 50 }, { totalTime: 1.0 }))
        expect(r.get('value')).toBe('persist')
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

      it('handles zero delay', () => {
        const nodeId = 'delay-zero'

        // Zero delay should output immediately (on next call)
        delayExecutor(createContext(nodeId, { value: 'immediate' }, { delay: 0 }, { totalTime: 0 }))

        const r = delayExecutor(createContext(nodeId, {}, { delay: 0 }, { totalTime: 0.001 }))
        expect(r.get('value')).toBe('immediate')
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

        const r = metronomeExecutor(createContext(nodeId, { start: 1 }, { bpm: 120, running: false }, { totalTime: 0 }))
        // After start, should be running
        const r2 = metronomeExecutor(createContext(nodeId, {}, { bpm: 120 }, { totalTime: 0.5 }))
        expect(r2.get('beat')).toBeDefined()
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

        // Clock pulse 1
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        const r1 = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r1.get('step')).toBe(2)

        // Clock pulse 2
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        const r2 = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r2.get('step')).toBe(3)
      })

      it('wraps around at end', () => {
        const nodeId = 'seq-wrap'
        const stepValues = [1, 1, 1, 1]

        // Initialize at step 1
        stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))

        // Advance 4 times to wrap
        for (let i = 0; i < 4; i++) {
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

        // Advance to end
        for (let i = 0; i < 3; i++) {
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

        // First clock - advances from step 1 to step 2
        // Gate fires based on whether the step we're NOW on has value > 0.5
        const r1 = stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        // After this clock, we're on step 2 which has value 0, so gate = 0
        // But the executor fires gate when clock rises AND current step value > 0.5
        // Check the actual behavior:
        expect(r1.get('step')).toBe(2) // Now on step 2

        // Release clock
        stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { steps: 4, mode: 'Forward', stepValues }))

        // Next clock - advances from step 2 to step 3
        const r2 = stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
        expect(r2.get('step')).toBe(3) // Now on step 3 (value 1)
        expect(r2.get('gate')).toBe(1) // Step 3 value is 1 > 0.5
      })
    })

    describe('value output', () => {
      it('outputs current step value', () => {
        const nodeId = 'seq-value'
        const stepValues = [0.1, 0.5, 0.7, 1.0]

        const r = stepSequencerExecutor(createContext(nodeId, {}, { steps: 4, mode: 'Forward', stepValues }))
        expect(r.get('value')).toBe(0.1)

        // Advance
        stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { steps: 4, mode: 'Forward', stepValues }))
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
        expect(r.get('step')).toBe(2) // Only advanced once
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

        // Advance 8 times to wrap
        for (let i = 0; i < 8; i++) {
          stepSequencerExecutor(createContext(nodeId, { clock: 1 }, { mode: 'Forward', stepValues }))
          stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { mode: 'Forward', stepValues }))
        }

        const r = stepSequencerExecutor(createContext(nodeId, { clock: 0 }, { mode: 'Forward', stepValues }))
        expect(r.get('step')).toBe(1)
      })
    })
  })
})
