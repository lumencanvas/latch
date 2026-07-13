import { categoryMeta } from '@/stores/nodes'

/**
 * Resolve the category swatch colour for a node type. The category lookup is
 * injected (`getCategory`) so the helper stays store-agnostic and unit-testable —
 * the same idiom as `flowToPreview`'s `getColor`. Returns the neutral fallback for
 * unknown or uncategorised types.
 *
 * The single home for the `categoryMeta[category]?.color ?? neutral` resolver that
 * the snippet cards, starter-template thumbnails and minimap all share.
 */
export function nodeTypeColor(
  nodeType: string,
  getCategory: (type: string) => string | undefined,
): string {
  const category = getCategory(nodeType)
  return (category ? categoryMeta[category] : undefined)?.color ?? 'var(--color-neutral-400)'
}
