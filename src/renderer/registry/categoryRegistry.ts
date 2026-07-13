/**
 * Auto-discovery registry for DROP-IN categories — the twin of `nodeRegistry`.
 *
 * Globs every `registry/<cat>/category.ts` (`export default defineCategory({...})`)
 * and collects the category presentation metadata. `registry/allNodes.ts` merges
 * the result into `stores/nodes.ts`'s `categoryMeta` at assembly time — a one-way
 * registry→stores push (the same direction as `setCustomNodeTypeIds`), so the
 * store never imports the registry and no eager-glob load cycle is created.
 *
 * The built-in categories keep their metadata in the `categoryMeta` seed (their
 * nodes live under folders that predate this convention and don't 1:1 map — e.g.
 * `opencv`/`emulation` folders vs the `visual`/`code` categories, and `video`/
 * `custom` have no folder at all). This glob is purely additive: it lets a NEW
 * category ship its own metadata alongside its nodes with no core-store edit.
 */

import type { Component } from 'vue'
import type { CategorySpec } from '@/engine/defineCategory'

const isValidCategory = (c: unknown): c is CategorySpec => {
  if (!c || typeof c !== 'object') return false
  const spec = c as CategorySpec
  // `icon` may be a string name or a Vue component (object/function) — see CategorySpec.
  const iconOk =
    typeof spec.icon === 'string' || typeof spec.icon === 'function' || typeof spec.icon === 'object'
  return (
    typeof spec.id === 'string' &&
    typeof spec.label === 'string' &&
    !!spec.icon &&
    iconOk &&
    typeof spec.color === 'string'
  )
}

/**
 * Validate the glob's module defaults into a category-by-id map. Mirrors
 * `nodeRegistry.collectSpecs`: a missing/malformed default fails loudly, a
 * duplicate id (across two `category.ts` files, or clashing with a built-in when a
 * `known` set is supplied) is reported. Pure + exported so the drop-in-category
 * guard test can exercise it with fixtures without a real registry file.
 */
export function collectCategories(
  modules: Record<string, CategorySpec | undefined>,
  known: readonly string[] = [],
): {
  categoriesById: Record<string, CategorySpec>
  duplicateIds: string[]
  invalid: string[]
} {
  const categoriesById: Record<string, CategorySpec> = {}
  const duplicateIds: string[] = []
  const invalid: string[] = []
  const knownSet = new Set(known)
  // Deterministic order so any error message / iteration is stable.
  for (const path of Object.keys(modules).sort()) {
    const spec = modules[path]
    if (!isValidCategory(spec)) {
      invalid.push(path)
      continue
    }
    const id = spec.id
    if (id in categoriesById || knownSet.has(id)) duplicateIds.push(id)
    else categoriesById[id] = spec
  }
  return { categoriesById, duplicateIds, invalid }
}

const modules = import.meta.glob<CategorySpec>('./**/category.ts', {
  eager: true,
  import: 'default',
})
const { categoriesById, duplicateIds, invalid } = collectCategories(modules)

// Fail loudly at import (CI-caught) rather than silently dropping / mis-registering.
if (invalid.length > 0) {
  throw new Error(
    `[categoryRegistry] category.ts without a valid default defineCategory() export: ${invalid.join(', ')}`,
  )
}
if (duplicateIds.length > 0) {
  throw new Error(`[categoryRegistry] duplicate category id(s) across category.ts files: ${duplicateIds.join(', ')}`)
}

/** Every discovered drop-in category, keyed by its id (empty until a `category.ts` ships). */
export const discoveredCategories: Readonly<Record<string, CategorySpec>> = categoriesById

/**
 * Merge discovered drop-in categories into a `categoryMeta`-shaped target IN PLACE
 * — the registry→stores push `allNodes.ts` performs at assembly. Built-in
 * (already-present) ids WIN: a drop-in never silently overrides a seeded category.
 * Exported + pure w.r.t. everything but `target` so the merge contract is
 * unit-tested directly. Returns the ids actually added.
 */
export function applyDiscoveredCategories(
  target: Record<string, { label: string; icon: string | Component; color: string }>,
  discovered: Readonly<Record<string, CategorySpec>>,
): string[] {
  const added: string[] = []
  for (const [id, spec] of Object.entries(discovered)) {
    if (id in target) continue
    target[id] = { label: spec.label, icon: spec.icon, color: spec.color }
    added.push(id)
  }
  return added
}
