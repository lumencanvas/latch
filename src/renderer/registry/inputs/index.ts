// All input nodes are co-located at registry/inputs/<id>/node.ts (Phase 6). The
// re-categorized `midi-input` (home: connectivity) and `webcam` (home: visual) are
// now co-located in their home folders and discovered by the glob.
import type { NodeDefinition } from '../types'

export const inputNodes: NodeDefinition[] = []
