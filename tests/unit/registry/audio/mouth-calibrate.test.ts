import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'
import node from '@/registry/audio/mouth-calibrate/node'
import { parseCalibration, CALIBRATION_STEPS } from '@/registry/audio/bellows-mouth-voice/mouthFeatures'

afterEach(() => vi.restoreAllMocks())

const FACES: Record<string, Record<string, number>> = {
  rest: { jawOpen: 0.02 },
  'ɑ': { jawOpen: 0.6 },
  i: { jawOpen: 0.05, mouthSmileLeft: 0.7, mouthSmileRight: 0.7 },
  u: { jawOpen: 0.05, mouthPucker: 0.8 },
  o: { jawOpen: 0.3, mouthFunnel: 0.6 },
  'ɛ': { jawOpen: 0.35, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
}

describe('mouth-calibrate', () => {
  it('runs the guided steps, then saves a calibration and switches itself off', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    const id = 'cal-1'
    const frame = (inputs: Record<string, unknown>, controls: Record<string, unknown>) => node.executor(makeContext(inputs, controls, { nodeId: id })) as Map<string, unknown>

    let out = frame({}, { calibrate: false })
    expect(out.get('calibrated')).toBe(false)
    let saved: unknown
    let step = 0
    // 60 fps until done, showing the face for whichever step the prompt names
    for (let i = 0; i < 60 * 30 && saved === undefined; i++) {
      t += 1000 / 60
      out = frame({ blendshapes: FACES[CALIBRATION_STEPS[Math.min(step, CALIBRATION_STEPS.length - 1)].id] }, { calibrate: true, holdSeconds: 1 })
      const p = String(out.get('prompt'))
      const m = /^(\d)\//.exec(p)
      if (m) step = Number(m[1]) - 1
      const upd = out.get('_controlUpdates') as Record<string, unknown> | undefined
      if (upd?.saved) { saved = upd.saved; expect(upd.calibrate).toBe(false); expect(out.get('done')).toBe(1) }
    }
    const cal = parseCalibration(saved)
    expect(cal).not.toBeNull()
    expect(Object.keys(cal!.vowels).sort()).toEqual(['i', 'o', 'u', 'ɑ', 'ɛ'].sort())
    expect(cal!.vowels['ɑ'].jaw).toBeCloseTo(0.6, 3)
    out = frame({}, { calibrate: false, saved })
    expect(out.get('calibrated')).toBe(true)
    expect(out.get('prompt')).toBe('')
  })

  it('waits on a step while the face is not seen', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    const id = 'cal-2'
    let out: Map<string, unknown> = new Map()
    for (let i = 0; i < 60 * 5; i++) {
      t += 1000 / 60
      out = node.executor(makeContext({}, { calibrate: true, holdSeconds: 1 }, { nodeId: id })) as Map<string, unknown>
    }
    expect(String(out.get('prompt'))).toMatch(/^1\/6|LOOK AT THE CAMERA/)
    expect(out.get('_controlUpdates')).toBeUndefined()
  })
})
