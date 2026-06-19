import type { NodeDefinition } from '../types'

export const noiseNode: NodeDefinition = {
  id: 'noise',
  name: 'Noise',
  version: '1.0.0',
  category: 'math',
  description: 'Coherent simplex noise — smooth pseudo-random values for organic motion',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'x', type: 'number', label: 'X' },
    { id: 'y', type: 'number', label: 'Y' },
    { id: 'z', type: 'number', label: 'Z' },
  ],
  outputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'normalized', type: 'number', label: 'Normalized' },
  ],
  controls: [
    { id: 'frequency', type: 'number', label: 'Frequency', default: 1 },
    { id: 'octaves', type: 'number', label: 'Octaves', default: 1, props: { min: 1, max: 8, step: 1 } },
    { id: 'seed', type: 'number', label: 'Seed', default: 0 },
  ],
  tags: ['noise', 'simplex', 'perlin', 'fbm', 'fractal', 'organic', 'generator', 'procedural', 'smooth', 'gradient noise'],
  info: {
    overview:
      'Generates coherent (smooth) noise using a 3D simplex field. Unlike Random, nearby inputs give nearby outputs, so driving the X input with Time produces flowing, organic motion rather than jitter. The value output is roughly -1..1 and normalized is 0..1. Wire X/Y/Z to sample a 1D, 2D, or 3D slice of the field.',
    tips: [
      'Wire a Time node into X for a continuously evolving 1D signal — the backbone of organic animation.',
      'Raise Octaves to add finer fractal detail (fBm); Frequency sets the base scale.',
      'Change Seed to get a completely different field while keeping the same motion settings.',
      'Feed the output into a Shader uniform or Displacement strength for liquid, smoke-like visuals.',
    ],
    pairsWith: ['time', 'lfo', 'map-range', 'shader', 'displacement'],
  },
}
