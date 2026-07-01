/**
 * Capability grants + approval (SECURITY_MODEL step 4).
 *
 * A `community` node that DECLARED a capability (step 2) still needs the user's
 * approval before it's handed the resource. The connection gate is synchronous
 * (returns a handle-or-null every frame) and approval is asynchronous (a user prompt),
 * so we can't await it inline. The pattern mirrors auto-connect: on first access the
 * gate fires the prompt ONCE (fire-and-forget) and denies; once the user approves, the
 * grant is recorded and the next frame's lookup allows.
 *
 * A plain module singleton (like the auto-connect throttle in `engine/connection.ts`),
 * not a Pinia store — the gate consults it every frame and it must be dependency-free.
 * The approval UX is an INJECTED resolver so this stays UI-agnostic; the default DENIES
 * (secure by default — nothing is granted unless something explicitly approves it).
 */

/** `granted`/`denied` are terminal; `pending` means a prompt is in flight (don't re-ask). */
type GrantState = 'granted' | 'denied' | 'pending'

const grants = new Map<string, GrantState>()

/** Resolve a user approval for (nodeType, capability). Default: deny. Injected by the UI. */
let resolver: (nodeType: string, capability: string) => Promise<boolean> = async () => false

/** Capability keys are `connection:<protocol>` / `model:<task>` (matches the manifest). */
export function grantKey(nodeType: string, capability: string): string {
  return `${nodeType}::${capability}`
}

/** Install the approval UX (a modal in-app; an auto-decider in tests). */
export function setGrantResolver(fn: (nodeType: string, capability: string) => Promise<boolean>): void {
  resolver = fn
}

/** True only when the capability has been explicitly granted. `pending`/`denied`/unknown → false. */
export function isGranted(nodeType: string, capability: string): boolean {
  return grants.get(grantKey(nodeType, capability)) === 'granted'
}

/**
 * Fire the approval prompt for (nodeType, capability) at most once. Idempotent: a
 * pending/decided grant is left alone, so calling this every frame won't re-prompt.
 */
export function ensureRequested(nodeType: string, capability: string): void {
  const key = grantKey(nodeType, capability)
  if (grants.has(key)) return
  grants.set(key, 'pending')
  void resolver(nodeType, capability)
    .then((ok) => grants.set(key, ok ? 'granted' : 'denied'))
    .catch(() => grants.set(key, 'denied'))
}

/** Record a decision directly (a UI toggle in the permissions panel, or a test). */
export function setGrant(nodeType: string, capability: string, allowed: boolean): void {
  grants.set(grantKey(nodeType, capability), allowed ? 'granted' : 'denied')
}

/** The recorded state (for a permissions UI / debugging). */
export function grantState(nodeType: string, capability: string): GrantState | 'unknown' {
  return grants.get(grantKey(nodeType, capability)) ?? 'unknown'
}

/** Test/reset helper — clears grants and restores the deny-by-default resolver. */
export function resetGrants(): void {
  grants.clear()
  resolver = async () => false
}
