/**
 * HTTP Executor
 *
 * HTTP node executor with template support using the ConnectionManager pattern.
 * Supports three modes:
 * 1. Template mode: connectionId + templateId + params -> adapter.executeTemplate()
 * 2. Inline mode: connectionId + url/method/headers/body -> adapter.request()
 * 3. Direct URL mode: url + method (no connection) -> fetch() (backwards compatible)
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { useConnectionsStore } from '@/stores/connections'
import type { HttpAdapterImpl } from '@/services/connections/adapters/HttpAdapter'

// Cache for HTTP request state
const httpCache = new Map<string, unknown>()

/**
 * Set cached value
 */
function setCached(key: string, value: unknown): void {
  httpCache.set(key, value)
}

/**
 * Get cached value
 */
function getCached<T>(key: string, defaultValue: T): T {
  if (httpCache.has(key)) {
    return httpCache.get(key) as T
  }
  return defaultValue
}

/**
 * Get HTTP adapter from ConnectionManager
 */
function getHttpAdapter(connectionId: string): HttpAdapterImpl | null {
  if (!connectionId) return null

  try {
    const connectionsStore = useConnectionsStore()
    const adapter = connectionsStore.getAdapter(connectionId)

    if (adapter && adapter.protocol === 'http') {
      return adapter as HttpAdapterImpl
    }
  } catch (e) {
    console.warn('[HTTP] Could not get adapter:', e)
  }

  return null
}

/**
 * Ensure connection is established
 */
async function ensureConnected(connectionId: string): Promise<HttpAdapterImpl | null> {
  const adapter = getHttpAdapter(connectionId)
  if (!adapter) return null

  if (adapter.status !== 'connected') {
    try {
      const connectionsStore = useConnectionsStore()
      await connectionsStore.connect(connectionId)
    } catch (e) {
      console.warn('[HTTP] Auto-connect failed:', e)
      return null
    }
  }

  return adapter
}

/**
 * HTTP Request Node Executor
 */
export const httpExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  // Get connection and template from inputs or controls
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const templateId = (ctx.inputs.get('templateId') as string) ?? (ctx.controls.get('templateId') as string) ?? ''
  const params = (ctx.inputs.get('params') as Record<string, unknown>) ?? {}

  // Get inline mode values
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''
  const method = (ctx.controls.get('method') as string) ?? 'GET'
  const headers = (ctx.inputs.get('headers') as Record<string, string>) ?? {}
  const body = ctx.inputs.get('body')
  const trigger = ctx.inputs.get('trigger') as boolean | undefined
  const timeout = (ctx.controls.get('timeout') as number) ?? 30000

  const outputs = new Map<string, unknown>()

  // Only fetch when triggered
  const shouldFetch = trigger === true

  if (!shouldFetch) {
    outputs.set('response', getCached(`${ctx.nodeId}:response`, null))
    outputs.set('status', getCached(`${ctx.nodeId}:status`, 0))
    outputs.set('error', getCached(`${ctx.nodeId}:error`, null))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Determine the mode
  const hasConnection = !!connectionId
  const hasTemplate = !!templateId
  const hasDirectUrl = url.startsWith('http://') || url.startsWith('https://')

  // Mode 3: Direct URL mode (no connection, backwards compatible)
  if (!hasConnection && hasDirectUrl) {
    return await executeDirectRequest(ctx.nodeId, url, method, headers, body, timeout)
  }

  // Need a connection for modes 1 and 2
  if (!hasConnection) {
    outputs.set('response', null)
    outputs.set('status', 0)
    outputs.set('error', 'No connection selected')
    outputs.set('loading', false)
    return outputs
  }

  // Get adapter
  const adapter = await ensureConnected(connectionId)

  if (!adapter) {
    outputs.set('response', null)
    outputs.set('status', 0)
    outputs.set('error', 'Connection not found or not available')
    outputs.set('loading', false)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)

  try {
    let response: unknown

    if (hasTemplate) {
      // Mode 1: Template mode
      response = await adapter.executeTemplate(
        templateId,
        params,
        Object.keys(headers).length > 0 || body !== undefined
          ? { headers: Object.keys(headers).length > 0 ? headers : undefined, body }
          : undefined
      )
    } else {
      // Mode 2: Inline mode with connection
      const path = url || '/'
      response = await adapter.request({
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path,
        headers,
        body,
      })
    }

    setCached(`${ctx.nodeId}:response`, response)
    setCached(`${ctx.nodeId}:status`, 200)
    setCached(`${ctx.nodeId}:error`, null)
    setCached(`${ctx.nodeId}:loading`, false)

    outputs.set('response', response)
    outputs.set('status', 200)
    outputs.set('error', null)
    outputs.set('loading', false)
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)

    // Try to extract status code from error message
    let status = 0
    const statusMatch = errorMsg.match(/HTTP (\d+)/)
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10)
    }

    setCached(`${ctx.nodeId}:response`, null)
    setCached(`${ctx.nodeId}:status`, status)
    setCached(`${ctx.nodeId}:error`, errorMsg)
    setCached(`${ctx.nodeId}:loading`, false)

    outputs.set('response', null)
    outputs.set('status', status)
    outputs.set('error', errorMsg)
    outputs.set('loading', false)
  }

  return outputs
}

/**
 * Execute a direct HTTP request without a connection (backwards compatible)
 */
async function executeDirectRequest(
  nodeId: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  timeout: number = 30000
): Promise<Map<string, unknown>> {
  const outputs = new Map<string, unknown>()

  setCached(`${nodeId}:loading`, true)

  // Create AbortController for timeout support
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''

    let data: unknown
    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    setCached(`${nodeId}:response`, data)
    setCached(`${nodeId}:status`, response.status)
    setCached(`${nodeId}:error`, response.ok ? null : `HTTP ${response.status}`)
    setCached(`${nodeId}:loading`, false)

    outputs.set('response', data)
    outputs.set('status', response.status)
    outputs.set('error', response.ok ? null : `HTTP ${response.status}`)
    outputs.set('loading', false)
  } catch (e) {
    clearTimeout(timeoutId)

    let errorMsg: string
    if (e instanceof Error) {
      if (e.name === 'AbortError') {
        errorMsg = `Request timeout after ${timeout}ms`
      } else {
        errorMsg = e.message
      }
    } else {
      errorMsg = String(e)
    }

    setCached(`${nodeId}:response`, null)
    setCached(`${nodeId}:status`, 0)
    setCached(`${nodeId}:error`, errorMsg)
    setCached(`${nodeId}:loading`, false)

    outputs.set('response', null)
    outputs.set('status', 0)
    outputs.set('error', errorMsg)
    outputs.set('loading', false)
  }

  return outputs
}

/**
 * Dispose HTTP node and clean up resources
 */
export function disposeHttpNode(nodeId: string): void {
  // Clear cached state
  const keys = Array.from(httpCache.keys()).filter((k) => k.startsWith(nodeId))
  for (const key of keys) {
    httpCache.delete(key)
  }
}

/**
 * Dispose all HTTP node resources
 */
export function disposeAllHttpNodes(): void {
  httpCache.clear()
}

/**
 * Garbage collect HTTP state for removed nodes
 */
export function gcHttpState(validNodeIds: Set<string>): void {
  for (const key of httpCache.keys()) {
    const nodeId = key.split(':')[0]
    if (!validNodeIds.has(nodeId)) {
      httpCache.delete(key)
    }
  }
}
