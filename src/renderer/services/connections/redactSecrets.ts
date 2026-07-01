/**
 * Secret redaction for connection configs (SECURITY_MODEL — credential safety).
 *
 * The broker holds connection configs that include secrets (MQTT `password`, clasp
 * `token`). Node-RED's lesson: never hand those secrets out through the normal API —
 * it masks password-typed fields (`__PWRD__`) and only the runtime, internally, sees the
 * real value. This mirrors that: `ConnectionManager`'s PUBLIC read API + events return
 * configs with secret fields replaced by {@link REDACTED_SECRET}; only the internal
 * `connect()`/persistence paths read the raw value. On update, a field still equal to the
 * placeholder means "leave the stored secret unchanged" — so a UI that round-trips a
 * redacted config can't accidentally erase a saved secret.
 *
 * Scope: this stops the credential flowing through the public API + reactive UI state. Note
 * the shareable `.latch` file already carries NO connection configs (only local IndexedDB
 * does), so sharing a flow never leaks a secret. The remaining residual is that a
 * Worker-isolated executor is the only true boundary against ambient access by a malicious
 * community node. See `docs/plans/SECURITY_MODEL_IMPL_2026-07-01.md`.
 */

import type { BaseConnectionConfig, ConnectionTypeDefinition } from './types'

/** Placeholder shown in place of a real secret (mirrors Node-RED's `__PWRD__`). */
export const REDACTED_SECRET = '__latch_redacted_secret__'

// A field is a secret if its config control is declared `type: 'password'`, or — as a
// name-based safety net so an un-marked field still can't leak — its id looks secret-y.
const SECRET_ID_RE = /pass(word|phrase)|token|secret|api[-_]?key|private[-_]?key/i

/** The secret field ids for a protocol type. */
export function secretFieldIds(typeDef: ConnectionTypeDefinition | undefined): string[] {
  const controls = typeDef?.configControls ?? []
  const ids = controls
    .filter((c) => (c.props as { type?: string } | undefined)?.type === 'password' || SECRET_ID_RE.test(c.id))
    .map((c) => c.id)
  return [...new Set(ids)]
}

/** A shallow copy of `config` with every NON-EMPTY secret field replaced by the placeholder. */
export function redactConfig<T extends BaseConnectionConfig>(
  config: T,
  typeDef: ConnectionTypeDefinition | undefined
): T {
  const ids = secretFieldIds(typeDef)
  if (ids.length === 0) return { ...config }
  const clone = { ...config } as Record<string, unknown>
  for (const id of ids) {
    const v = clone[id]
    if (v !== undefined && v !== null && v !== '') clone[id] = REDACTED_SECRET
  }
  return clone as unknown as T
}

/**
 * Merge `updates` onto `existing`, but for any secret field left at the placeholder
 * (i.e. the caller round-tripped a redacted config without changing it), keep the stored
 * secret instead of overwriting it with the placeholder.
 */
export function mergePreservingSecrets<T extends BaseConnectionConfig>(
  existing: T,
  updates: Partial<T>,
  typeDef: ConnectionTypeDefinition | undefined
): T {
  const merged = { ...existing, ...updates } as Record<string, unknown>
  const ex = existing as Record<string, unknown>
  const up = updates as Record<string, unknown>
  for (const id of secretFieldIds(typeDef)) {
    if (up[id] === REDACTED_SECRET) merged[id] = ex[id]
  }
  return merged as unknown as T
}
