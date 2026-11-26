/**
 * Desktop agent relay: hands this tab's WebMCP tools to MCP clients on this computer (Claude
 * Code, Claude Desktop, Cursor) through `@mcp-b/webmcp-local-relay`, which the person runs
 * locally (`npx @mcp-b/webmcp-local-relay --widget-origin <this origin>`).
 *
 * This replaces the package's `embed.js` with an equivalent loader that:
 * - loads the vendored, pinned widget (public/webmcp/widget.js) from our own origin,
 * - runs it from blob: scripts, so it works under the desktop app's CSP (no inline scripts),
 * - ignores the widget's "reload the page" request (unsaved work must never vanish on an agent's say).
 * The widget only talks to loopback addresses and reads tools from this page's document.modelContext.
 */

const MARK = 'data-latch-agent-relay'
const TAB_KEY = '__webmcp_relay_tab_id'

let frame: HTMLIFrameElement | null = null
let blobUrls: string[] = []
/** Bumped by every stop: a start still awaiting its fetch sees it changed and backs out. */
let generation = 0

function tabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(TAB_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export interface RelayOptions { port?: number }

export async function startRelayWidget(opts: RelayOptions = {}): Promise<void> {
  if (frame) return
  const gen = generation
  const widgetUrl = new URL('webmcp/widget.js', document.baseURI).href
  const res = await fetch(widgetUrl)
  if (!res.ok) throw new Error(`relay widget not found (${res.status})`)
  const widgetJs = await res.text()
  if (gen !== generation || frame) return
  const host = new URL(window.location.href)
  host.search = ''
  host.hash = ''
  const config = {
    autoConnect: 'true',
    relayHost: '127.0.0.1',
    relayPort: String(opts.port ?? 9333),
    requestTimeout: '60000',
    tabId: tabId(),
    hostOrigin: window.location.origin,
    hostUrl: host.href,
    hostTitle: 'LATCH',
  }
  const configUrl = URL.createObjectURL(new Blob([`window.__WEBMCP_RELAY_CONFIG=${JSON.stringify(config)};`], { type: 'text/javascript' }))
  const scriptUrl = URL.createObjectURL(new Blob([widgetJs], { type: 'text/javascript' }))
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>LATCH agent relay</title><script src="${configUrl}"></script></head><body><script src="${scriptUrl}"></script></body></html>`
  const pageUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  blobUrls = [configUrl, scriptUrl, pageUrl]

  const f = document.createElement('iframe')
  f.src = pageUrl
  f.style.display = 'none'
  f.setAttribute('aria-hidden', 'true')
  f.setAttribute('tabindex', '-1')
  f.setAttribute(MARK, '1')
  f.setAttribute('allow', 'loopback-network; local-network; local-network-access')
  document.body.appendChild(f)
  frame = f
  hookExecuteTool()
}

export function stopRelayWidget(): void {
  generation++
  unhookExecute?.()
  unhookExecute = null
  relayMarks.clear()
  frame?.remove()
  frame = null
  for (const u of blobUrls) URL.revokeObjectURL(u)
  blobUrls = []
}

/**
 * Did this call come through the relay? The widget runs in our iframe and passes executeTool an
 * AbortSignal it created there, so the signal belongs to the iframe's realm. In-page agents' don't.
 */
function isRelaySignal(signal: unknown): boolean {
  const Remote = (frame?.contentWindow as (Window & typeof globalThis) | null | undefined)?.AbortSignal
  return !!signal && !!Remote && signal instanceof Remote
}

// WebMCP doesn't tell a tool who called it, so while the relay runs, executeTool is wrapped: a
// call with a relay signal leaves a short-lived mark under the tool's name, which the tool's
// callback claims (takeRelayCall). Used only to label the call ("a desktop agent"), never to
// grant anything.
const relayMarks = new Map<string, number[]>()
const MARK_TTL_MS = 5000
let unhookExecute: (() => void) | null = null

type ExecuteTool = (tool: { name?: string }, input?: unknown, options?: { signal?: AbortSignal }) => unknown

function hookExecuteTool() {
  if (unhookExecute) return
  const mc = ((document as unknown as { modelContext?: object }).modelContext
    ?? (navigator as unknown as { modelContext?: object }).modelContext) as { executeTool?: ExecuteTool } | undefined
  const original = mc?.executeTool
  if (!mc || typeof original !== 'function') return
  const hadOwn = Object.prototype.hasOwnProperty.call(mc, 'executeTool')
  const wrapped: ExecuteTool = function (this: unknown, tool, input, options) {
    if (tool?.name && isRelaySignal(options?.signal)) {
      const marks = relayMarks.get(tool.name) ?? []
      marks.push(performance.now())
      relayMarks.set(tool.name, marks)
    }
    return original.call(this, tool, input, options)
  }
  try {
    mc.executeTool = wrapped
  } catch {
    return // a frozen native implementation: calls are just labelled as in-browser
  }
  unhookExecute = () => {
    if (mc.executeTool !== wrapped) return
    if (hadOwn) mc.executeTool = original
    else delete mc.executeTool
  }
}

/** True once per relay call to this tool (marks older than a few seconds are ignored). */
export function takeRelayCall(toolName: string): boolean {
  const marks = relayMarks.get(toolName)
  if (!marks) return false
  const now = performance.now()
  while (marks.length && now - marks[0] > MARK_TTL_MS) marks.shift()
  const hit = marks.length > 0
  if (hit) marks.shift()
  if (!marks.length) relayMarks.delete(toolName)
  return hit
}

/** Wake the widget after the tab comes back (it backs off to a slow probe when no relay answers). */
export function nudgeRelayWidget(): void {
  frame?.contentWindow?.postMessage({ type: 'webmcp.connect' }, window.location.origin)
}

export function relayCommand(origin = window.location.origin): string {
  return `claude mcp add latch -- npx -y @mcp-b/webmcp-local-relay@6.2.0 --widget-origin ${origin}`
}
