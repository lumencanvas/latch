import { dataTypeMeta } from '@/stores/nodes'

/**
 * Port presentation shared by BaseNode and NodePorts (custom-component nodes),
 * so the handle colour, non-colour cue and "float / cam / pulse" chip can't
 * drift between the two (they were two hand-kept copies).
 */

type Meta = { color?: string; glyph?: string; lineStyle?: string } | undefined
const meta = (type: string): Meta => dataTypeMeta[type as keyof typeof dataTypeMeta] as Meta

export function portTypeColor(type: string): string {
  return meta(type)?.color ?? 'var(--color-neutral-400)'
}

/** Non-colour type glyph (WCAG 1.4.1), revealed with the port label. */
export function portTypeGlyph(type: string): string {
  return meta(type)?.glyph ?? '*'
}

export function portHandleStyle(type: string): Record<string, string> {
  const color = portTypeColor(type)
  return { background: color, '--port-color': color }
}

/** Dotted/dashed types render as a hollow ring so type isn't conveyed by hue alone. */
export function portLineClass(type: string): Record<string, boolean> {
  const lineStyle = meta(type)?.lineStyle
  return {
    'port-line-dotted': lineStyle === 'dotted',
    'port-line-dashed': lineStyle === 'dashed',
  }
}

const TYPE_LABELS: Record<string, string> = {
  boolean: 'bool',
  trigger: 'pulse',
  any: 'any',
  number: 'float',
  string: 'str',
  texture: 'tex',
  audio: 'audio',
  data: 'data',
  scene3d: 'scene',
  object3d: 'obj3d',
  geometry3d: 'geo',
  material3d: 'mat',
  camera3d: 'cam',
  light3d: 'light',
  transform3d: 'xfm',
  video: 'video',
}

/** Short semantic chip for a port ("0→1", "raw", "pass", or a type abbreviation). */
export function portSemanticLabel(portId: string, type: string): string {
  if (portId.includes('norm') || portId.includes('Norm') || portId.startsWith('0-1') || portId.includes('normalized')) {
    return '0→1'
  }
  if (portId.includes('raw') || portId.includes('Raw')) return 'raw'
  if (portId === 'pass' || portId.includes('through') || portId === 'passthrough') return 'pass'
  return TYPE_LABELS[type] ?? type
}
