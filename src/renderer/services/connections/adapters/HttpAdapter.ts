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
  ConnectionTypeDefinition,
} from '../types'

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path?: string
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

export class HttpAdapterImpl extends BaseAdapter {
  protocol = 'http'
  private httpConfig: HttpConnectionConfig
  private abortController: AbortController | null = null

  constructor(config: HttpConnectionConfig) {
    super(config.id, 'http', config)
    this.httpConfig = config
  }

  async connect(): Promise<void> {
    // HTTP doesn't have a persistent connection
    // We'll do a HEAD request to verify the server is reachable
    this.setStatus('connecting')

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

      this.setStatus('connected')
      console.log(`[HTTP] Connected to ${this.httpConfig.baseUrl}`)
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      // For HTTP, we consider it "connected" even if HEAD fails
      // since the actual requests might still work
      this.setStatus('connected')
      console.warn(`[HTTP] HEAD check failed for ${this.httpConfig.baseUrl}, but proceeding:`, error.message)
    }
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect()

    // Cancel any pending requests
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    this.setStatus('disconnected')
  }

  async send(data: unknown, options?: HttpRequestOptions): Promise<void> {
    await this.request({
      method: 'POST',
      body: data,
      ...options,
    })
  }

  /**
   * Make an HTTP request
   */
  async request<T = unknown>(options: HttpRequestOptions): Promise<T> {
    if (this._status !== 'connected') {
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

  dispose(): void {
    super.dispose()
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
