import type { NodeDefinition } from '../types'

export const colorRampNode: NodeDefinition = {
  id: 'color-ramp',
  name: 'Color Ramp',
  version: '1.0.0',
  category: 'visual',
  description: 'Map a 0–1 value to a colour via a gradient palette (colormap)',
  icon: 'palette',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 't', type: 'number', label: 'T' },
    { id: 'colorA', type: 'data', label: 'Color A' },
    { id: 'colorB', type: 'data', label: 'Color B' },
  ],
  outputs: [
    { id: 'color', type: 'data', label: 'Color' },
    { id: 'r', type: 'number', label: 'R' },
    { id: 'g', type: 'number', label: 'G' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  controls: [
    {
      id: 'preset',
      type: 'select',
      label: 'Palette',
      default: 'viridis',
      // Keep in sync with PALETTES in engine/executors/color-ramp.ts (+ 'custom').
      props: { options: ['viridis', 'rainbow', 'heat', 'fire', 'ice', 'cool', 'grayscale', 'custom'] },
    },
    { id: 'reverse', type: 'toggle', label: 'Reverse', default: false },
  ],
  tags: ['color ramp', 'gradient', 'palette', 'colormap', 'lut', 'lookup', 'heatmap', 'rainbow', 'viridis', 'color'],
  info: {
    overview:
      'Maps a 0–1 input to a colour by sampling a gradient palette — the colour equivalent of Map Range. Pick a built-in colormap (viridis, rainbow, heat, fire, ice, cool, grayscale), or choose "custom" to interpolate between the Color A and Color B inputs. Outputs an [r,g,b,a] colour plus separate channels.',
    tips: [
      'Drive T with an LFO, Noise, or audio level to cycle colours in time with your flow.',
      'Feed the colour output straight into a Shader uniform or a Color Correction tint.',
      'Use "custom" with two Color nodes for a simple two-stop brand-colour gradient.',
      'Enable Reverse to flip the palette direction.',
    ],
    pairsWith: ['lfo', 'noise', 'audio-analyzer', 'shader', 'color'],
  },
}
