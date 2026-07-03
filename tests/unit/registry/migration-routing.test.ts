import { describe, it, expect } from 'vitest'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'
import { PERSISTENCE_SPECIAL_NODE_TYPES } from '@/composables/usePersistence'

/**
 * There are TWO routing lists that decide whether a node renders via its bespoke SFC or via
 * BaseNode + NodeView: `CUSTOM_NODE_TYPE_IDS` (registry/components.ts — freshly-added nodes via
 * resolveVueFlowType) and `PERSISTENCE_SPECIAL_NODE_TYPES` (usePersistence.toFlowState — nodes
 * rehydrated from IndexedDB at startup). A node migrated to a declarative `ui` schema MUST be absent
 * from BOTH, or a persisted instance keeps the old Vue Flow `type`, whose component no longer exists →
 * it fails to render. This regression (found by the migration audit) is the guard against re-adding one
 * of these to either list, or migrating a 5th node and forgetting the persistence path.
 */
const MIGRATED_TO_UI = ['envelope-visual', 'parametric-eq', 'wavetable', 'xy-pad']

describe('bespoke→ui migrated nodes are de-registered from BOTH routing lists', () => {
  for (const type of MIGRATED_TO_UI) {
    it(`${type} is not a bespoke component type (components.ts)`, () => {
      expect(CUSTOM_NODE_TYPE_IDS).not.toContain(type)
    })
    it(`${type} is not a persistence special type (usePersistence rehydration)`, () => {
      expect(PERSISTENCE_SPECIAL_NODE_TYPES).not.toContain(type)
    })
  }
})

/**
 * The two lists must not merely both-exclude the migrated nodes — they must be the SAME set. Both now
 * derive from the one source (`definition.component`), so a bespoke node added later is routed correctly
 * on BOTH the fresh-add path and the persistence-rehydration path without a second hand-edit. (This
 * killed a latent drift where gamepad-visual/dispatch/emulator were in components.ts but missing from
 * the hand-maintained persistence list — only masked by the `healNodeTypes` fixup on flow activation.)
 */
describe('the two routing lists are one source of truth', () => {
  it('PERSISTENCE_SPECIAL_NODE_TYPES is the SAME array as CUSTOM_NODE_TYPE_IDS (an alias, not a copy)', () => {
    // Reference identity, not value equality: a value-equal copy (`[...CUSTOM_NODE_TYPE_IDS]`) or a
    // re-hardcoded list would silently drift if the source ever changed. `.toBe` fails the instant the
    // alias is replaced by ANY freshly-built array — the exact regression this guards against.
    expect(PERSISTENCE_SPECIAL_NODE_TYPES).toBe(CUSTOM_NODE_TYPE_IDS)
  })
})
