import Dexie, { type Table } from 'dexie'
import type { Node, Edge } from '@vue-flow/core'

/**
 * Database schema for persisted flow data
 */
export interface PersistedFlow {
  id: string
  name: string
  description: string
  nodes: Node[]
  edges: Edge[]
  createdAt: Date
  updatedAt: Date
}

export interface AppSettings {
  id: string // Always 'settings'
  theme: 'light' | 'dark' | 'system'
  showMinimap: boolean
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  sidebarWidth: number
  lastOpenedFlowId: string | null
}

/**
 * Dexie database class for Latch
 */
class LatchDatabase extends Dexie {
  flows!: Table<PersistedFlow, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('latch')

    // Version 1 schema
    this.version(1).stores({
      flows: 'id, name, createdAt, updatedAt',
      settings: 'id',
    })
  }
}

// Singleton database instance
export const db = new LatchDatabase()

/**
 * Flow persistence operations
 */
export const flowStorage = {
  /**
   * Get all flows
   */
  async getAll(): Promise<PersistedFlow[]> {
    return db.flows.toArray()
  },

  /**
   * Get a flow by ID
   */
  async getById(id: string): Promise<PersistedFlow | undefined> {
    return db.flows.get(id)
  },

  /**
   * Save a flow (create or update)
   */
  async save(flow: PersistedFlow): Promise<void> {
    await db.flows.put(flow)
  },

  /**
   * Delete a flow
   */
  async delete(id: string): Promise<void> {
    await db.flows.delete(id)
  },

  /**
   * Delete all flows
   */
  async deleteAll(): Promise<void> {
    await db.flows.clear()
  },
}

/**
 * Settings persistence operations
 */
export const settingsStorage = {
  /**
   * Get app settings
   */
  async get(): Promise<AppSettings | undefined> {
    return db.settings.get('settings')
  },

  /**
   * Save app settings
   */
  async save(settings: Omit<AppSettings, 'id'>): Promise<void> {
    await db.settings.put({ ...settings, id: 'settings' })
  },

  /**
   * Get default settings
   */
  getDefaults(): Omit<AppSettings, 'id'> {
    return {
      theme: 'light',
      showMinimap: true,
      showGrid: true,
      snapToGrid: true,
      gridSize: 20,
      sidebarWidth: 280,
      lastOpenedFlowId: null,
    }
  },
}

/**
 * Initialize database with default data if empty
 */
export async function initializeDatabase(): Promise<void> {
  // Check if settings exist, create defaults if not
  const settings = await settingsStorage.get()
  if (!settings) {
    await settingsStorage.save(settingsStorage.getDefaults())
  }
}
