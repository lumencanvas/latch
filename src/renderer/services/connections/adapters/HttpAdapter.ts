/**
 * HTTP Adapter
 *
 * HTTP/REST adapter for making API requests.
 * Unlike other adapters, HTTP doesn't maintain a persistent connection,
 * but provides a configured client for making requests.
 */

import { BaseAdapter } from './BaseAdapter'
import type {
  HttpConnectionConfig,
  HttpEndpointTemplate,
  ConnectionTypeDefinition,
  SendOptions,
} from '../types'

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path?: string
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

export class HttpAdapterImpl extends BaseAdapter {
  private httpConfig: HttpConnectionConfig
  private abortController: AbortController | null = null

  constructor(config: HttpConnectionConfig) {
    super(config.id, 'http', config)
    this.httpConfig = config
    // HTTP doesn't buffer messages - each request is independent
    this.bufferEnabled = false
  }

  protected async doConnect(): Promise<void> {
    // HTTP doesn't have a persistent connection
    // We'll do a HEAD request to verify the server is reachable
    try {
      const response = await fetch(this.httpConfig.baseUrl, {
        method: 'HEAD',
        headers: this.httpConfig.headers,
        signal: AbortSignal.timeout(this.httpConfig.timeout ?? 10000),
      })

      if (!response.ok && response.status !== 405) {
        // 405 is ok - some servers don't support HEAD
        throw new Error(`Server responded with ${response.status}`)
      }

    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      // For HTTP, we consider it "connected" even if HEAD fails
      // since the actual requests might still work
      console.warn(`[HTTP] HEAD check failed for ${this.httpConfig.baseUrl}, but proceeding:`, error.message)
    }
  }

  protected async doDisconnect(): Promise<void> {
    // Cancel any pending requests
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  protected async doSend(data: unknown, options?: SendOptions): Promise<void> {
    await this.request({
      method: 'POST',
      body: data,
      path: options?.topic,
    })
  }

  /**
   * Make an HTTP request
   */
  async request<T = unknown>(options: HttpRequestOptions): Promise<T> {
    if (!this.stateMachine.isConnected()) {
      throw new Error('Not connected')
    }

    const {
      method = 'GET',
      path = '',
      headers = {},
      body,
      timeout = this.httpConfig.timeout ?? 30000,
    } = options

    const url = path.startsWith('http')
      ? path
      : `${this.httpConfig.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`

    const requestHeaders: Record<string, string> = {
      ...this.httpConfig.headers,
      ...headers,
    }

    if (body && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json'
    }

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      signal: AbortSignal.timeout(timeout),
    }

    if (body && method !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const contentType = response.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      return await response.json() as T
    }

    return await response.text() as unknown as T
  }

  /**
   * GET request
   */
  async get<T = unknown>(path: string, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<T> {
    return this.request<T>({ ...options, method: 'GET', path })
  }

  /**
   * POST request
   */
  async post<T = unknown>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<T> {
    return this.request<T>({ ...options, method: 'POST', path, body })
  }

  /**
   * PUT request
   */
  async put<T = unknown>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<T> {
    return this.request<T>({ ...options, method: 'PUT', path, body })
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<T> {
    return this.request<T>({ ...options, method: 'PATCH', path, body })
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(path: string, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<T> {
    return this.request<T>({ ...options, method: 'DELETE', path })
  }

  /**
   * Get templates from the connection config
   */
  getTemplates(): HttpEndpointTemplate[] {
    return this.httpConfig.templates ?? []
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(templateId: string): HttpEndpointTemplate | undefined {
    return this.getTemplates().find((t) => t.id === templateId)
  }

  /**
   * Execute a template with parameter substitution
   */
  async executeTemplate<T = unknown>(
    templateId: string,
    params: Record<string, unknown> = {},
    overrides?: { headers?: Record<string, string>; body?: unknown }
  ): Promise<T> {
    const template = this.getTemplate(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    // Resolve path with parameters
    const resolvedPath = this.resolveTemplate(template.path, params)

    // Resolve headers with parameters
    const resolvedHeaders: Record<string, string> = {}
    if (template.headers) {
      for (const [key, value] of Object.entries(template.headers)) {
        resolvedHeaders[key] = this.resolveTemplate(value, params)
      }
    }
    if (overrides?.headers) {
      Object.assign(resolvedHeaders, overrides.headers)
    }

    // Resolve body with parameters
    let body: unknown = overrides?.body
    if (body === undefined && template.bodyTemplate) {
      const resolvedBodyStr = this.resolveTemplate(template.bodyTemplate, params)
      try {
        body = JSON.parse(resolvedBodyStr)
      } catch {
        body = resolvedBodyStr
      }
    }

    return this.request<T>({
      method: template.method,
      path: resolvedPath,
      headers: resolvedHeaders,
      body,
    })
  }

  /**
   * Resolve {{placeholders}} in a template string
   */
  private resolveTemplate(template: string, params: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = params[key]
      if (value === undefined || value === null) {
        return ''
      }
      if (typeof value === 'object') {
        return JSON.stringify(value)
      }
      return String(value)
    })
  }
}

export const httpConnectionType: ConnectionTypeDefinition<HttpConnectionConfig> = {
  id: 'http',
  name: 'HTTP/REST',
  icon: 'globe',
  color: '#3B82F6',
  category: 'protocol',
  description: 'HTTP/REST API client for web services',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'baseUrl',
      type: 'text',
      label: 'Base URL',
      description: 'Base URL for API requests',
      default: 'https://api.example.com',
    },
    {
      id: 'timeout',
      type: 'number',
      label: 'Timeout (ms)',
      description: 'Request timeout in milliseconds',
      default: 30000,
      props: { min: 1000, max: 300000, step: 1000 },
    },
    {
      id: 'autoConnect',
      type: 'checkbox',
      label: 'Auto Connect',
      description: 'Verify connection on startup',
      default: false,
    },
  ],
  defaultConfig: {
    baseUrl: 'https://api.example.com',
    headers: {},
    timeout: 30000,
    autoConnect: false,
    autoReconnect: false,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  createAdapter: (config) => new HttpAdapterImpl(config),
}
