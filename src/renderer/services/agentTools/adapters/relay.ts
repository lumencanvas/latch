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
  const widgetUrl = new URL('webmcp/widget.js', document.baseURI).href
  const res = await fetch(widgetUrl)
  if (!res.ok) throw new Error(`relay widget not found (${res.status})`)
  const widgetJs = await res.text()
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
}

export function stopRelayWidget(): void {
  frame?.remove()
  frame = null
  for (const u of blobUrls) URL.revokeObjectURL(u)
  blobUrls = []
}

/** Wake the widget after the tab comes back (it backs off to a slow probe when no relay answers). */
export function nudgeRelayWidget(): void {
  frame?.contentWindow?.postMessage({ type: 'webmcp.connect' }, window.location.origin)
}

export function relayCommand(origin = window.location.origin): string {
  return `claude mcp add latch -- npx -y @mcp-b/webmcp-local-relay@6.2.0 --widget-origin ${origin}`
}
