/**
 * MessageBus - A global pub/sub message bus for Send/Receive nodes
 *
 * Allows nodes to communicate via named channels without direct connections.
 * Similar to Max/MSP's send~/receive~ system.
 */

type MessageListener = (value: unknown, channel: string) => void

class MessageBus {
  private channels = new Map<string, unknown>()
  private listeners = new Map<string, Set<MessageListener>>()
  private changeFlags = new Map<string, boolean>()

  /**
   * Send a value to a channel
   */
  send(channel: string, value: unknown): void {
    const prevValue = this.channels.get(channel)

    // Only update if value changed
    if (prevValue !== value) {
      this.channels.set(channel, value)
      this.changeFlags.set(channel, true)

      // Notify all listeners
      const channelListeners = this.listeners.get(channel)
      if (channelListeners) {
        for (const listener of channelListeners) {
          listener(value, channel)
        }
      }
    }
  }

  /**
   * Get the current value on a channel
   */
  get(channel: string): unknown {
    return this.channels.get(channel)
  }

  /**
   * Check if a channel value changed since last check
   */
  hasChanged(channel: string): boolean {
    return this.changeFlags.get(channel) ?? false
  }

  /**
   * Clear the change flag for a channel
   */
  clearChangeFlag(channel: string): void {
    this.changeFlags.set(channel, false)
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string, listener: MessageListener): () => void {
    let channelListeners = this.listeners.get(channel)
    if (!channelListeners) {
      channelListeners = new Set()
      this.listeners.set(channel, channelListeners)
    }
    channelListeners.add(listener)

    // Return unsubscribe function
    return () => {
      channelListeners!.delete(listener)
      if (channelListeners!.size === 0) {
        this.listeners.delete(channel)
      }
    }
  }

  /**
   * Get all active channels
   */
  getChannels(): string[] {
    return Array.from(this.channels.keys())
  }

  /**
   * Clear all channels and listeners
   */
  clear(): void {
    this.channels.clear()
    this.listeners.clear()
    this.changeFlags.clear()
  }
}

// Singleton instance
export const messageBus = new MessageBus()
