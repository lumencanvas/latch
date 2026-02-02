/**
 * Message Buffer Service
 *
 * Queues messages when connection is unavailable and flushes them
 * when connection is restored. Supports TTL, retry limits, and prioritization.
 */

import { nanoid } from 'nanoid'

// ============================================================================
// Types
// ============================================================================

/**
 * Priority levels for buffered messages
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical'

/**
 * A message queued for delivery
 */
export interface BufferedMessage {
  /** Unique message ID */
  id: string
  /** Message payload */
  data: unknown
  /** Optional send options (protocol-specific) */
  options?: Record<string, unknown>
  /** Timestamp when message was buffered */
  timestamp: number
  /** Number of delivery attempts */
  retryCount: number
  /** Maximum retry attempts (0 = unlimited) */
  maxRetries: number
  /** Time-to-live in milliseconds (0 = no expiry) */
  ttl: number
  /** Message priority */
  priority: MessagePriority
  /** Optional topic/channel for the message */
  topic?: string
}

/**
 * Buffer statistics for a connection
 */
export interface BufferStats {
  /** Number of queued messages */
  queued: number
  /** Oldest message timestamp */
  oldest: Date | null
  /** Total bytes (estimated) */
  estimatedBytes: number
  /** Messages by priority */
  byPriority: Record<MessagePriority, number>
}

/**
 * Buffer configuration
 */
export interface BufferConfig {
  /** Maximum number of messages to buffer per connection */
  maxBufferSize: number
  /** Default TTL in milliseconds */
  defaultTTL: number
  /** Default max retries */
  defaultMaxRetries: number
  /** Interval for pruning expired messages (ms) */
  pruneInterval: number
}

/**
 * Options when enqueueing a message
 */
export interface EnqueueOptions {
  /** Message priority */
  priority?: MessagePriority
  /** Time-to-live override */
  ttl?: number
  /** Max retries override */
  maxRetries?: number
  /** Topic/channel for the message */
  topic?: string
  /** Additional send options */
  sendOptions?: Record<string, unknown>
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: BufferConfig = {
  maxBufferSize: 1000,
  defaultTTL: 60000, // 1 minute
  defaultMaxRetries: 3,
  pruneInterval: 10000, // 10 seconds
}

// Priority weights for sorting (higher = send first)
const PRIORITY_WEIGHTS: Record<MessagePriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
}

// ============================================================================
// Message Buffer Class
// ============================================================================

/**
 * Message buffer for a single connection
 */
class ConnectionMessageBuffer {
  private messages: BufferedMessage[] = []
  private config: BufferConfig

  constructor(config: BufferConfig) {
    this.config = config
  }

  /**
   * Add a message to the buffer
   * Returns the message ID, or null if buffer is full
   */
  enqueue(data: unknown, options: EnqueueOptions = {}): string | null {
    // Check buffer size limit
    if (this.messages.length >= this.config.maxBufferSize) {
      // Try to drop lowest priority message
      const lowestPriorityIndex = this.findLowestPriorityIndex()
      if (lowestPriorityIndex !== -1) {
        const priority = options.priority ?? 'normal'
        const existingPriority = this.messages[lowestPriorityIndex].priority
        if (PRIORITY_WEIGHTS[priority] > PRIORITY_WEIGHTS[existingPriority]) {
          this.messages.splice(lowestPriorityIndex, 1)
        } else {
          console.warn('[MessageBuffer] Buffer full, message dropped')
          return null
        }
      } else {
        console.warn('[MessageBuffer] Buffer full, message dropped')
        return null
      }
    }

    const message: BufferedMessage = {
      id: nanoid(8),
      data,
      options: options.sendOptions,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
      ttl: options.ttl ?? this.config.defaultTTL,
      priority: options.priority ?? 'normal',
      topic: options.topic,
    }

    this.messages.push(message)
    this.sortByPriority()

    return message.id
  }

  /**
   * Get all messages ready for delivery (not expired, within retry limit)
   */
  getReadyMessages(): BufferedMessage[] {
    const now = Date.now()
    return this.messages.filter(msg => {
      // Check TTL
      if (msg.ttl > 0 && now - msg.timestamp > msg.ttl) {
        return false
      }
      // Check retries
      if (msg.maxRetries > 0 && msg.retryCount >= msg.maxRetries) {
        return false
      }
      return true
    })
  }

  /**
   * Flush all ready messages from the buffer
   * Returns messages in priority order
   */
  flush(): BufferedMessage[] {
    const ready = this.getReadyMessages()
    this.messages = []
    return ready
  }

  /**
   * Mark a message as sent (remove from buffer)
   */
  markSent(messageId: string): void {
    const index = this.messages.findIndex(m => m.id === messageId)
    if (index !== -1) {
      this.messages.splice(index, 1)
    }
  }

  /**
   * Mark a message as failed (increment retry count)
   */
  markFailed(messageId: string): boolean {
    const message = this.messages.find(m => m.id === messageId)
    if (message) {
      message.retryCount++
      // Check if exceeded max retries
      if (message.maxRetries > 0 && message.retryCount >= message.maxRetries) {
        this.markSent(messageId) // Remove it
        return false // No more retries
      }
      return true // Will retry
    }
    return false
  }

  /**
   * Remove expired messages
   */
  prune(): number {
    const now = Date.now()
    const initialLength = this.messages.length

    this.messages = this.messages.filter(msg => {
      // Remove expired
      if (msg.ttl > 0 && now - msg.timestamp > msg.ttl) {
        return false
      }
      // Remove exceeded retries
      if (msg.maxRetries > 0 && msg.retryCount >= msg.maxRetries) {
        return false
      }
      return true
    })

    return initialLength - this.messages.length
  }

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    const byPriority: Record<MessagePriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      critical: 0,
    }

    let estimatedBytes = 0
    let oldest: Date | null = null

    for (const msg of this.messages) {
      byPriority[msg.priority]++
      estimatedBytes += JSON.stringify(msg.data).length
      if (!oldest || msg.timestamp < oldest.getTime()) {
        oldest = new Date(msg.timestamp)
      }
    }

    return {
      queued: this.messages.length,
      oldest,
      estimatedBytes,
      byPriority,
    }
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = []
  }

  /**
   * Get message count
   */
  get size(): number {
    return this.messages.length
  }

  private sortByPriority(): void {
    this.messages.sort((a, b) => {
      // Higher priority first
      const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]
      if (priorityDiff !== 0) return priorityDiff
      // Then by timestamp (older first)
      return a.timestamp - b.timestamp
    })
  }

  private findLowestPriorityIndex(): number {
    let lowestIndex = -1
    let lowestWeight = Infinity

    for (let i = 0; i < this.messages.length; i++) {
      const weight = PRIORITY_WEIGHTS[this.messages[i].priority]
      if (weight < lowestWeight) {
        lowestWeight = weight
        lowestIndex = i
      }
    }

    return lowestIndex
  }
}

// ============================================================================
// Global Message Buffer Manager
// ============================================================================

/**
 * Manages message buffers for all connections
 */
export class MessageBufferManager {
  private buffers = new Map<string, ConnectionMessageBuffer>()
  private config: BufferConfig
  private pruneTimer?: ReturnType<typeof setInterval>

  constructor(config: Partial<BufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startPruning()
  }

  /**
   * Enqueue a message for a connection
   */
  enqueue(
    connectionId: string,
    data: unknown,
    options: EnqueueOptions = {}
  ): string | null {
    const buffer = this.getOrCreateBuffer(connectionId)
    return buffer.enqueue(data, options)
  }

  /**
   * Flush all ready messages for a connection
   */
  flush(connectionId: string): BufferedMessage[] {
    const buffer = this.buffers.get(connectionId)
    if (!buffer) return []
    return buffer.flush()
  }

  /**
   * Mark a message as successfully sent
   */
  markSent(connectionId: string, messageId: string): void {
    const buffer = this.buffers.get(connectionId)
    if (buffer) {
      buffer.markSent(messageId)
    }
  }

  /**
   * Mark a message as failed (for retry tracking)
   */
  markFailed(connectionId: string, messageId: string): boolean {
    const buffer = this.buffers.get(connectionId)
    if (buffer) {
      return buffer.markFailed(messageId)
    }
    return false
  }

  /**
   * Get statistics for a connection's buffer
   */
  getStats(connectionId: string): BufferStats {
    const buffer = this.buffers.get(connectionId)
    if (!buffer) {
      return {
        queued: 0,
        oldest: null,
        estimatedBytes: 0,
        byPriority: { low: 0, normal: 0, high: 0, critical: 0 },
      }
    }
    return buffer.getStats()
  }

  /**
   * Get total statistics across all connections
   */
  getTotalStats(): { connections: number; totalMessages: number } {
    let totalMessages = 0
    for (const buffer of this.buffers.values()) {
      totalMessages += buffer.size
    }
    return {
      connections: this.buffers.size,
      totalMessages,
    }
  }

  /**
   * Clear buffer for a connection
   */
  clear(connectionId: string): void {
    const buffer = this.buffers.get(connectionId)
    if (buffer) {
      buffer.clear()
    }
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    for (const buffer of this.buffers.values()) {
      buffer.clear()
    }
    this.buffers.clear()
  }

  /**
   * Remove buffer for a connection (when connection is deleted)
   */
  removeBuffer(connectionId: string): void {
    this.buffers.delete(connectionId)
  }

  /**
   * Prune expired messages from all buffers
   */
  prune(): number {
    let totalPruned = 0
    for (const buffer of this.buffers.values()) {
      totalPruned += buffer.prune()
    }
    if (totalPruned > 0) {
      // pruned stale messages
    }
    return totalPruned
  }

  /**
   * Dispose the manager
   */
  dispose(): void {
    this.stopPruning()
    this.clearAll()
  }

  private getOrCreateBuffer(connectionId: string): ConnectionMessageBuffer {
    let buffer = this.buffers.get(connectionId)
    if (!buffer) {
      buffer = new ConnectionMessageBuffer(this.config)
      this.buffers.set(connectionId, buffer)
    }
    return buffer
  }

  private startPruning(): void {
    this.pruneTimer = setInterval(() => {
      this.prune()
    }, this.config.pruneInterval)
  }

  private stopPruning(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer)
      this.pruneTimer = undefined
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: MessageBufferManager | null = null

/**
 * Get the global message buffer manager instance
 */
export function getMessageBufferManager(): MessageBufferManager {
  if (!instance) {
    instance = new MessageBufferManager()
  }
  return instance
}

/**
 * Reset the message buffer manager (for testing)
 */
export function resetMessageBufferManager(): void {
  if (instance) {
    instance.dispose()
    instance = null
  }
}
