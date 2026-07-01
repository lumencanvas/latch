import { describe, it, expect } from 'vitest'
import {
  describeCapabilities,
  formatCapabilityConsent,
  hasNoCapabilities,
} from '@/services/security/capabilities'

/**
 * Capability disclosure (SECURITY_MODEL step 6). Derives the permission list an install
 * dialog shows before accepting an untrusted node.
 */
describe('capability disclosure', () => {
  it('extracts connections, hardware, and models, de-duplicated', () => {
    const d = describeCapabilities({
      connections: [{ protocol: 'mqtt' }, { protocol: 'http' }, { protocol: 'mqtt' }],
      requires: ['camera', 'serial', 'camera'],
      models: [{ task: 'object-detection' }],
    })
    expect(d.connections).toEqual(['mqtt', 'http'])
    expect(d.hardware).toEqual(['camera', 'serial'])
    expect(d.models).toEqual(['object-detection'])
  })

  it('treats an empty/undeclared manifest as no capabilities', () => {
    const d = describeCapabilities({})
    expect(hasNoCapabilities(d)).toBe(true)
    expect(formatCapabilityConsent({})).toEqual([])
  })

  it('renders human-readable consent lines', () => {
    const lines = formatCapabilityConsent({
      connections: [{ protocol: 'mqtt' }],
      requires: ['camera', 'serial', 'webgpu'],
      models: [{ task: 'sentiment-analysis' }],
    })
    expect(lines).toContain('Use your MQTT connections')
    expect(lines).toContain('Access your camera')
    expect(lines).toContain('Access serial (USB) devices')
    expect(lines).toContain('Use the GPU (WebGPU)')
    expect(lines).toContain('Download and run the sentiment-analysis model')
  })

  it('falls back gracefully for an unknown hardware requirement', () => {
    expect(formatCapabilityConsent({ requires: ['quantum-entangler'] })).toEqual(['Use quantum-entangler'])
  })
})
