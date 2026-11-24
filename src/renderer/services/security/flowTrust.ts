/**
 * Import trust-prompt (SECURITY_MODEL — the boundary for UNTRUSTED flow files).
 *
 * Function / Expression nodes run their stored source IN-PROCESS via `new Function`
 * (engine/executors/code.ts). The preamble there is defense-in-depth, not a sandbox, so a
 * `.latch`/`.json` file someone sent you could carry code that reads your storage or talks
 * to the network. Before such a file is imported, the user is shown what it contains and
 * chooses:
 *
 *  - `disable` (the default / safe choice) — import, but every code node is stamped
 *    `_codeDisabled: true` and its executor refuses to compile or run it;
 *  - `trust`   — import as-is and run the code;
 *  - `cancel`  — don't import.
 *
 * The flag persists with the node (it's ordinary node data), so a disabled node stays
 * disabled across autosave/reload until the user explicitly enables it (Function node
 * "Enable code" button / editing the code / `flowsStore.enableNodeCode`).
 *
 * The user's OWN flows never pass through here: autosave/IndexedDB restore pushes
 * persisted flows straight into the store (usePersistence), and the bundled starter
 * flow is first-party. Only the import-from-file path prompts.
 *
 * Like `capabilityGrants`, the UI is an INJECTED resolver so this stays dependency-free;
 * the default resolver (no modal mounted, tests) chooses `disable` — secure by default.
 */
import { formatCapabilityConsent, type CapabilityManifestLike } from './capabilities'

/** Node types whose stored source is executed as JavaScript. */
export const CODE_NODE_TYPES: Readonly<Record<string, { codeKey: string; what: string }>> = Object.freeze({
  function: { codeKey: 'code', what: 'runs custom JavaScript' },
  expression: { codeKey: 'expression', what: 'evaluates a JavaScript expression' },
})

/** Node data flag that blocks a code node's executor from compiling/running its source. */
export const CODE_DISABLED_KEY = '_codeDisabled'

export function isCodeNodeType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(CODE_NODE_TYPES, type)
}

export interface CodeNodeEntry {
  flowName: string
  nodeId: string
  type: string
  /** What the node does with its source ("runs custom JavaScript"). */
  what: string
  /** First line(s) of the source, trimmed, for the prompt preview. */
  preview: string
}

export interface FlowTrustSummary {
  /** Code-bearing nodes (the reason the prompt is shown). */
  codeNodes: CodeNodeEntry[]
  /** Other things the flow's nodes can do (connections / hardware / models / GPU shaders). */
  capabilities: string[]
}

export type ImportTrustDecision = 'trust' | 'disable' | 'cancel'

/** Structural subset of a v2 flow document we need (no fileFormat import → no cycles). */
interface DocLike {
  flow: { name?: string; nodes: ReadonlyArray<{ id: string; type: string; controls?: Record<string, unknown> }> }
}

const PREVIEW_MAX = 160

function previewOf(src: unknown): string {
  if (typeof src !== 'string') return ''
  // Drop blank + pure `//` comment lines so the preview shows what actually runs.
  const lines = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
  const joined = lines.join(' ⏎ ')
  return joined.length > PREVIEW_MAX ? `${joined.slice(0, PREVIEW_MAX)}…` : joined
}

/**
 * Summarise what an imported set of flow documents can do. `getDef` resolves registry
 * definitions (their declared capabilities feed the "this flow can also" list).
 */
export function summarizeFlowTrust(
  docs: ReadonlyArray<DocLike>,
  getDef: (type: string) => (CapabilityManifestLike & { name?: string }) | undefined,
): FlowTrustSummary {
  const codeNodes: CodeNodeEntry[] = []
  const caps = new Set<string>()
  const seenTypes = new Set<string>()
  for (const doc of docs) {
    for (const n of doc.flow.nodes ?? []) {
      const code = CODE_NODE_TYPES[n.type]
      if (code && Object.prototype.hasOwnProperty.call(CODE_NODE_TYPES, n.type)) {
        // An imported node that is ALREADY disabled carries no live code risk.
        if (n.controls?.[CODE_DISABLED_KEY] !== true) {
          codeNodes.push({
            flowName: doc.flow.name ?? 'Untitled',
            nodeId: n.id,
            type: n.type,
            what: code.what,
            preview: previewOf(n.controls?.[code.codeKey]),
          })
        }
      }
      if (seenTypes.has(n.type)) continue
      seenTypes.add(n.type)
      if (n.type === 'shader') caps.add('Run custom GLSL shaders on your GPU')
      const def = getDef(n.type)
      if (def) for (const line of formatCapabilityConsent(def)) caps.add(line)
    }
  }
  return { codeNodes, capabilities: [...caps] }
}

/** Whether the summary warrants a prompt (only executable code triggers one). */
export function needsTrustPrompt(s: FlowTrustSummary): boolean {
  return s.codeNodes.length > 0
}

let resolver: (summary: FlowTrustSummary) => Promise<ImportTrustDecision> = async () => 'disable'

/** Install the trust-prompt UX (ImportTrustModal on mount; an auto-decider in tests). */
export function setImportTrustResolver(fn: (summary: FlowTrustSummary) => Promise<ImportTrustDecision>): void {
  resolver = fn
}

/** Restore the secure default (no UI → open with code disabled). */
export function resetImportTrustResolver(): void {
  resolver = async () => 'disable'
}

/** Ask the user. A throwing/rejecting resolver fails CLOSED to `disable`. */
export async function requestImportTrust(summary: FlowTrustSummary): Promise<ImportTrustDecision> {
  try {
    const d = await resolver(summary)
    return d === 'trust' || d === 'cancel' ? d : 'disable'
  } catch {
    return 'disable'
  }
}
