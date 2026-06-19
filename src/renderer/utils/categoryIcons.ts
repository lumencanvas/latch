import {
  Bug,
  Download,
  Upload,
  Clock,
  Calculator,
  GitBranch,
  Music,
  Video,
  Tv2,
  Palette,
  Database,
  Cpu,
  Code,
  Box,
  Wifi,
  Radio,
  Layers,
  Type,
  Send,
  Puzzle,
} from 'lucide-vue-next'
import type { NodeCategory } from '@/stores/nodes'

/**
 * Single source of truth mapping a node category to its lucide icon component.
 *
 * Used by the node header (BaseNode), the palette (AppSidebar) and the node
 * explorer (CategoryNav) so a category's icon is identical everywhere. Keep in
 * sync with the `NodeCategory` union — the exhaustive Record type enforces it.
 */
export const categoryIcons: Record<NodeCategory, typeof Bug> = {
  debug: Bug,
  inputs: Download,
  outputs: Upload,
  timing: Clock,
  math: Calculator,
  logic: GitBranch,
  audio: Music,
  video: Video,
  visual: Tv2,
  shaders: Palette,
  data: Database,
  ai: Cpu,
  code: Code,
  '3d': Box,
  connectivity: Wifi,
  clasp: Radio,
  subflows: Layers,
  string: Type,
  messaging: Send,
  custom: Puzzle,
}

/** Fallback icon for an unknown / missing category. */
export const fallbackCategoryIcon = Code
