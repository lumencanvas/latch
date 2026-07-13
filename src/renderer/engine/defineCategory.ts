/**
 * `defineCategory` — the drop-in category manifest (the twin of `defineNode`).
 *
 * A whole node category is declared by dropping a single
 * `registry/<cat>/category.ts` that `export default defineCategory({ id, label,
 * icon, color })`. The `categoryRegistry` glob discovers it and merges its
 * presentation metadata into `categoryMeta` at registry assembly — so **adding a
 * category is "drop a folder", with ZERO edits to the core `stores/nodes.ts`
 * `categoryMeta` Record or the `NodeCategory` union** (which now only seeds the
 * built-ins + drives authoring autocomplete via `KnownNodeCategory`).
 *
 * Kept deliberately store-free (a leaf, exactly like a `node.ts`'s
 * `@/engine/defineNode` import) so a `category.ts` never value-imports the stores
 * or the registry — the same eager-glob cycle-safety the `node-import-hygiene`
 * guard enforces for `node.ts`/`nodes.ts`.
 */

import type { Component } from 'vue'

export interface CategorySpec {
  /** Stable category id — the value nodes put in `definition.category`. */
  readonly id: string
  /** Human label shown in the palette / explorer nav. */
  readonly label: string
  /**
   * The category's icon. Pass a **component** (e.g. `import { Sparkles } from
   * 'lucide-vue-next'`) to actually RENDER an icon in the palette / node header —
   * `getCategoryIcon` returns it directly. A **string** is accepted as inert
   * metadata (a name/label) but does NOT resolve to a component, so a string-only
   * drop-in renders the neutral fallback icon. (The built-in categories seed a
   * string here and get their rendered icon from `utils/categoryIcons` instead.)
   */
  readonly icon: string | Component
  /** Swatch / accent colour (any CSS colour, e.g. `'#A855F7'`). */
  readonly color: string
}

/**
 * Brand a category manifest. Identity today (the value IS the spec); a function so
 * the authoring surface matches `defineNode` and stays the single place future
 * validation/derivation would hook in.
 */
export function defineCategory(spec: CategorySpec): CategorySpec {
  return spec
}
