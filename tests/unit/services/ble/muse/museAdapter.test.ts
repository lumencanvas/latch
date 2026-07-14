import { describe, it, expect } from 'vitest'
import { frameMuseCommand, batteryFromTelemetry, contactFromRms } from '@/services/connections/adapters/MuseAdapter'

describe('frameMuseCommand', () => {
  it('prefixes the byte length (command + newline) and appends \\n', () => {
    // 'p50' → [len=4, 'p','5','0','\n']
    expect(Array.from(frameMuseCommand('p50'))).toEqual([4, 0x70, 0x35, 0x30, 0x0a])
    // 'h' → [len=2, 'h','\n']
    expect(Array.from(frameMuseCommand('h'))).toEqual([2, 0x68, 0x0a])
    // 'd' → [len=2, 'd','\n']
    expect(Array.from(frameMuseCommand('d'))).toEqual([2, 0x64, 0x0a])
  })

  it('length prefix always equals the number of following bytes', () => {
    for (const cmd of ['h', 's', 'd', 'p50', 'p21', 'p20', 'v6']) {
      const f = frameMuseCommand(cmd)
      expect(f[0]).toBe(f.length - 1)
      expect(f[f.length - 1]).toBe(0x0a) // trailing newline
    }
  })
})

describe('batteryFromTelemetry', () => {
  const packet = (battery: number) => {
    const buf = new ArrayBuffer(10)
    const dv = new DataView(buf)
    dv.setUint16(0, 1) // seq
    dv.setUint16(2, battery) // battery raw
    return dv
  }

  it('decodes battery raw/512 as a 0..1 fraction', () => {
    expect(batteryFromTelemetry(packet(51200))!).toBeCloseTo(1, 5) // 51200/512/100 = 1.0
    expect(batteryFromTelemetry(packet(25600))!).toBeCloseTo(0.5, 5)
    expect(batteryFromTelemetry(packet(0))!).toBe(0)
  })

  it('clamps to [0,1] and returns null on a short packet', () => {
    expect(batteryFromTelemetry(packet(60000))!).toBe(1) // 60000/512/100 = 1.17 → clamps to 1
    expect(batteryFromTelemetry(new DataView(new ArrayBuffer(2)))).toBeNull()
  })
})

describe('contactFromRms', () => {
  it('reports no contact for a flat/disconnected channel', () => {
    expect(contactFromRms(0)).toBe(0)
    expect(contactFromRms(1)).toBe(0)
  })

  it('reports good contact for a plausible EEG amplitude', () => {
    expect(contactFromRms(20)).toBe(1)
    expect(contactFromRms(100)).toBe(1)
  })

  it('ramps in near the low edge and falls off when railing', () => {
    expect(contactFromRms(5)).toBeGreaterThan(0)
    expect(contactFromRms(5)).toBeLessThan(1)
    expect(contactFromRms(500)).toBeLessThan(1) // motion / railing
    expect(contactFromRms(700)).toBe(0)
  })
})
