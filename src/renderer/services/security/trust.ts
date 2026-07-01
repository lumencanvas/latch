/**
 * Trust tiers for nodes (SECURITY_MODEL step 3).
 *
 * A node's tier is assigned by HOW it reached the runtime — never self-declared by
 * the node author (the validator strips any author-provided `trust`, and the loader
 * stamps the real tier at registration). This is the signal the capability gate
 * (step 2) and the approval store (step 4) key off:
 *
 * - `core`      — shipped built-ins (vetted in-repo). Full ambient authority.
 * - `local`     — user-authored, dropped into `custom-nodes/` (you wrote it). Trusted.
 * - `community` — installed from a share/registry (code you did NOT write). Capability
 *                 access is gated: it must DECLARE a capability and the user must APPROVE it.
 *
 * The default is `core`: a definition with no `trust` field is a built-in (built-ins
 * never set it), so existing behavior is unchanged and the gate is dormant until a
 * genuine community node exists.
 */
export type TrustTier = 'core' | 'local' | 'community'

export const DEFAULT_TRUST: TrustTier = 'core'

/** The tier of a node definition, defaulting to `core` (built-in) when unset. */
export function nodeTrust(def: { trust?: TrustTier } | null | undefined): TrustTier {
  return def?.trust ?? DEFAULT_TRUST
}

/**
 * Pre-trusted tiers bypass the capability gate — `core` and `local` are your own code,
 * so scoping them buys little and hurts usability (SECURITY_MODEL "Trust tiers"). Only
 * `community` (code you didn't write) is gated.
 */
export function isPreTrusted(tier: TrustTier): boolean {
  return tier === 'core' || tier === 'local'
}
