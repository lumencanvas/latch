import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getConnectionManager,
  resetConnectionManager,
  ConnectionManagerImpl,
} from '@/services/connections/ConnectionManager'
import type {
  BaseConnectionConfig,
  ConnectionAdapter,
  ConnectionTypeDefinition,
  ConnectionStatusInfo,
} from '@/services/connections/types'

// Mock adapter for testing
class MockAdapter implements ConnectionAdapter {
  status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  protocol = 'mock'
  connectionId: string
  private statusListeners = new Set<(status: ConnectionStatusInfo) => void>()
  private messageListeners = new Set<(msg: { topic?: string; data: unknown }) => void>()
  private errorListeners = new Set<(err: Error) => void>()

  constructor(config: BaseConnectionConfig) {
    this.connectionId = config.id
  }

  async connect(): Promise<void> {
    this.status = 'connected'
    this.notifyStatus({ status: 'connected' })
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected'
    this.notifyStatus({ status: 'disconnected' })
  }

  dispose(): void {
    this.statusListeners.clear()
    this.messageListeners.clear()
    this.errorListeners.clear()
  }

  onStatusChange(callback: (status: ConnectionStatusInfo) => void): () => void {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
  }

  onMessage(callback: (message: { topic?: string; data: unknown }) => void): () => void {
    this.messageListeners.add(callback)
    return () => this.messageListeners.delete(callback)
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorListeners.add(callback)
    return () => this.errorListeners.delete(callback)
  }

  async send(_data: unknown): Promise<void> {
    // Mock send
  }

  private notifyStatus(status: ConnectionStatusInfo): void {
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }
}

// Mock connection type
const mockConnectionType: ConnectionTypeDefinition<BaseConnectionConfig> = {
  id: 'mock',
  name: 'Mock Connection',
  icon: 'plug',
  color: '#888',
  category: 'protocol',
  description: 'A mock connection for testing',
  platforms: ['web', 'electron'],
  configControls: [],
  defaultConfig: {
    autoConnect: false,
    autoReconnect: false,
    reconnectDelay: 1000,
    maxReconnectAttempts: 3,
  },
  createAdapter: (config) => new MockAdapter(config),
}

describe('ConnectionManager', () => {
  beforeEach(() => {
    // Reset the singleton before each test
    resetConnectionManager()
  })

  afterEach(() => {
    resetConnectionManager()
  })

  describe('Singleton', () => {
    it('should return the same instance', () => {
      const manager1 = getConnectionManager()
      const manager2 = getConnectionManager()
      expect(manager1).toBe(manager2)
    })

    it('should create new instance after reset', () => {
      const manager1 = getConnectionManager()
      resetConnectionManager()
      const manager2 = getConnectionManager()
      expect(manager1).not.toBe(manager2)
    })
  })

  describe('Type Registry', () => {
    it('should register a connection type', () => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)

      const type = manager.getType('mock')
      expect(type).toBeDefined()
      expect(type?.name).toBe('Mock Connection')
    })

    it('should list all registered types', () => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)

      const types = manager.getTypes()
      expect(types).toHaveLength(1)
      expect(types[0].id).toBe('mock')
    })

    it('should unregister a connection type', () => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)
      manager.unregisterType('mock')

      const type = manager.getType('mock')
      expect(type).toBeUndefined()
    })

    it('should filter types by platform', () => {
      const manager = getConnectionManager()

      const webOnlyType: ConnectionTypeDefinition = {
        ...mockConnectionType,
        id: 'web-only',
        platforms: ['web'],
      }

      const electronOnlyType: ConnectionTypeDefinition = {
        ...mockConnectionType,
        id: 'electron-only',
        platforms: ['electron'],
      }

      manager.registerType(webOnlyType)
      manager.registerType(electronOnlyType)

      const webTypes = manager.getTypesForPlatform('web')
      expect(webTypes).toHaveLength(1)
      expect(webTypes[0].id).toBe('web-only')

      const electronTypes = manager.getTypesForPlatform('electron')
      expect(electronTypes).toHaveLength(1)
      expect(electronTypes[0].id).toBe('electron-only')
    })
  })

  describe('Connection Management', () => {
    beforeEach(() => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)
    })

    it('should add a connection', () => {
      const manager = getConnectionManager()

      const config: BaseConnectionConfig = {
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      }

      manager.addConnection(config)

      const connection = manager.getConnection('test-conn')
      expect(connection).toBeDefined()
      expect(connection?.name).toBe('Test Connection')
    })

    it('should list all connections', () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'conn-1',
        name: 'Connection 1',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      manager.addConnection({
        id: 'conn-2',
        name: 'Connection 2',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      const connections = manager.getConnections()
      expect(connections).toHaveLength(2)
    })

    it('should remove a connection', () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      manager.removeConnection('test-conn')

      const connection = manager.getConnection('test-conn')
      expect(connection).toBeUndefined()
    })

    it('should update a connection', () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      manager.updateConnection('test-conn', { name: 'Updated Name' })

      const connection = manager.getConnection('test-conn')
      expect(connection?.name).toBe('Updated Name')
    })

    it('should filter connections by protocol', () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'mock-conn',
        name: 'Mock Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      const mockConnections = manager.getConnectionsByProtocol('mock')
      expect(mockConnections).toHaveLength(1)

      const otherConnections = manager.getConnectionsByProtocol('other')
      expect(otherConnections).toHaveLength(0)
    })
  })

  describe('Adapter Management', () => {
    beforeEach(() => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)
    })

    it('should connect and create adapter', async () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      await manager.connect('test-conn')

      const adapter = manager.getAdapter('test-conn')
      expect(adapter).toBeDefined()
      expect(adapter?.status).toBe('connected')
    })

    it('should disconnect adapter', async () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      await manager.connect('test-conn')
      await manager.disconnect('test-conn')

      const status = manager.getStatus('test-conn')
      expect(status?.status).toBe('disconnected')
    })

    it('should track connection status', async () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      const initialStatus = manager.getStatus('test-conn')
      expect(initialStatus?.status).toBe('disconnected')

      await manager.connect('test-conn')

      const connectedStatus = manager.getStatus('test-conn')
      expect(connectedStatus?.status).toBe('connected')
    })
  })

  describe('Events', () => {
    beforeEach(() => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)
    })

    it('should emit connection-added event', () => {
      const manager = getConnectionManager()
      const handler = vi.fn()

      manager.on('connection-added', handler)

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-conn' }))
    })

    it('should emit connection-removed event', () => {
      const manager = getConnectionManager()
      const handler = vi.fn()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      manager.on('connection-removed', handler)
      manager.removeConnection('test-conn')

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('test-conn')
    })

    it('should emit status-change event', async () => {
      const manager = getConnectionManager()
      const handler = vi.fn()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      manager.on('status-change', handler)
      await manager.connect('test-conn')

      // Should be called for connecting and connected states
      expect(handler).toHaveBeenCalled()
    })

    it('should unsubscribe from events', () => {
      const manager = getConnectionManager()
      const handler = vi.fn()

      const unsubscribe = manager.on('connection-added', handler)
      unsubscribe()

      manager.addConnection({
        id: 'test-conn',
        name: 'Test Connection',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('Serialization', () => {
    beforeEach(() => {
      const manager = getConnectionManager()
      manager.registerType(mockConnectionType)
    })

    it('should export connections', () => {
      const manager = getConnectionManager()

      manager.addConnection({
        id: 'conn-1',
        name: 'Connection 1',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      // Access the export method via the implementation
      const impl = manager as ConnectionManagerImpl
      const exported = impl.exportConnections()

      expect(exported).toHaveLength(1)
      expect(exported[0].id).toBe('conn-1')
    })

    it('should import connections', () => {
      const manager = getConnectionManager()
      const impl = manager as ConnectionManagerImpl

      const configs = [
        {
          id: 'imported-1',
          name: 'Imported 1',
          protocol: 'mock',
          autoConnect: false,
          autoReconnect: false,
          reconnectDelay: 1000,
          maxReconnectAttempts: 0,
        },
      ]

      impl.importConnections(configs)

      const connection = manager.getConnection('imported-1')
      expect(connection).toBeDefined()
      expect(connection?.name).toBe('Imported 1')
    })

    it('should replace all connections', () => {
      const manager = getConnectionManager()
      const impl = manager as ConnectionManagerImpl

      manager.addConnection({
        id: 'existing',
        name: 'Existing',
        protocol: 'mock',
        autoConnect: false,
        autoReconnect: false,
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
      })

      const newConfigs = [
        {
          id: 'new-1',
          name: 'New 1',
          protocol: 'mock',
          autoConnect: false,
          autoReconnect: false,
          reconnectDelay: 1000,
          maxReconnectAttempts: 0,
        },
      ]

      impl.replaceConnections(newConfigs)

      expect(manager.getConnection('existing')).toBeUndefined()
      expect(manager.getConnection('new-1')).toBeDefined()
    })
  })
})
