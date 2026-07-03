import type { NodeDefinition } from '@/stores/nodes'

import { markRaw } from 'vue'
import GraphNode from './GraphNode.vue'

export const graphNode: NodeDefinition = {
  id: 'graph',
  component: markRaw(GraphNode),
  name: 'Graph',
  version: '1.0.0',
  category: 'debug',
  description: 'Plot X/Y values with dynamic point inputs',
  icon: 'line-chart',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'x0', type: 'number', label: 'X' },
    { id: 'y0', type: 'number', label: 'Y' },
  ],
  outputs: [],
  controls: [
    { id: 'pointCount', type: 'number', label: 'Points', default: 1, props: { min: 1, max: 8 } },
    { id: 'displayMode', type: 'select', label: 'Mode', default: 'line', props: { options: ['line', 'scatter'] } },
    { id: 'showGrid', type: 'toggle', label: 'Grid', default: true },
    { id: 'autoScale', type: 'toggle', label: 'Auto Scale', default: true },
  ],
  info: {
    overview: 'Plots one or more X/Y data points on a 2D chart. Supports line and scatter modes. Use it to visualize the relationship between two signals or to trace a path over time.',
    tips: [
      'Increase the point count control to add more input pairs for comparing multiple data series.',
      'Disable auto scale and set manual axis ranges when you need a fixed reference frame.',
      'Feed an LFO into X and another into Y to visualize Lissajous figures.',
    ],
    pairsWith: ['oscillator', 'lfo', 'smooth', 'map-range', 'xy-pad'],
  },
}
