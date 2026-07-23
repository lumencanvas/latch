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
  Usb,
  Radio,
  ScanEye,
  Layers,
  Type,
  Send,
  Puzzle,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { categoryMeta, type NodeCategory } from '@/stores/nodes'

/**
 * Single source of truth mapping a built-in node category to its lucide icon
 * component.
 *
 * Used by the node header (BaseNode), the palette (AppSidebar) and the node
 * explorer (CategoryNav) so a category's icon is identical everywhere. The
 * `satisfies` keeps it EXHAUSTIVE over the known categories (drop one → compile
 * error); the exported type is widened to `Record<string, …>` so indexing with a
 * drop-in category id typechecks (and resolves via `getCategoryIcon`'s fallback).
 */
export const categoryIcons: Record<string, typeof Bug> = {
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
  opencv: ScanEye,
  data: Database,
  ai: Cpu,
  code: Code,
  '3d': Box,
  connectivity: Wifi,
  devices: Usb,
  clasp: Radio,
  subflows: Layers,
  string: Type,
  messaging: Send,
  custom: Puzzle,
} satisfies Record<NodeCategory, typeof Bug>

/** Fallback icon for an unknown / missing category. */
export const fallbackCategoryIcon = Code

/**
 * Resolve a category's icon component. Order: the built-in lucide map, then a
 * drop-in category's own component icon (`defineCategory({ icon: SomeComponent })`,
 * carried on `categoryMeta[id].icon`), then the neutral fallback — so a drop-in
 * that supplies a component renders it, a string-only or unknown category degrades
 * gracefully, and no call site ever hits `<component :is="undefined">`.
 */
export function getCategoryIcon(category: string): Component {
  const builtin = categoryIcons[category]
  if (builtin) return builtin
  const dropIn = categoryMeta[category]?.icon
  if (dropIn && typeof dropIn !== 'string') return dropIn
  return fallbackCategoryIcon
}
