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
 * Asset types supported
 */
export type AssetType = 'image' | 'video' | 'audio'

/**
 * Asset schema for media library
 */
export interface Asset {
  id: string
  name: string
  type: AssetType
  mimeType: string
  size: number
  data?: Blob // Web: stored in IndexedDB
  path?: string // Electron: filesystem path
  thumbnail?: Blob
  width?: number // For images/video
  height?: number // For images/video
  duration?: number // For audio/video
  createdAt: Date
  updatedAt: Date
  tags: string[]
}

/**
 * Dexie database class for Latch
 */
class LatchDatabase extends Dexie {
  flows!: Table<PersistedFlow, string>
  settings!: Table<AppSettings, string>
  assets!: Table<Asset, string>

  constructor() {
    super('latch')

    // Version 1 schema
    this.version(1).stores({
      flows: 'id, name, createdAt, updatedAt',
      settings: 'id',
    })

    // Version 2 schema - add assets table
    this.version(2).stores({
      flows: 'id, name, createdAt, updatedAt',
      settings: 'id',
      assets: 'id, name, type, mimeType, createdAt, updatedAt, *tags',
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
 * Asset persistence operations
 */
export const assetStorage = {
  /**
   * Get all assets
   */
  async getAll(): Promise<Asset[]> {
    return db.assets.toArray()
  },

  /**
   * Get assets by type
   */
  async getByType(type: AssetType): Promise<Asset[]> {
    return db.assets.where('type').equals(type).toArray()
  },

  /**
   * Get an asset by ID
   */
  async getById(id: string): Promise<Asset | undefined> {
    return db.assets.get(id)
  },

  /**
   * Save an asset (create or update)
   */
  async save(asset: Asset): Promise<void> {
    await db.assets.put(asset)
  },

  /**
   * Delete an asset
   */
  async delete(id: string): Promise<void> {
    await db.assets.delete(id)
  },

  /**
   * Delete all assets
   */
  async deleteAll(): Promise<void> {
    await db.assets.clear()
  },

  /**
   * Search assets by name
   */
  async searchByName(query: string): Promise<Asset[]> {
    const lowerQuery = query.toLowerCase()
    return db.assets
      .filter((asset) => asset.name.toLowerCase().includes(lowerQuery))
      .toArray()
  },

  /**
   * Get assets by tags
   */
  async getByTags(tags: string[]): Promise<Asset[]> {
    return db.assets
      .where('tags')
      .anyOf(tags)
      .distinct()
      .toArray()
  },

  /**
   * Get total size of all assets
   */
  async getTotalSize(): Promise<number> {
    const assets = await db.assets.toArray()
    return assets.reduce((sum, asset) => sum + asset.size, 0)
  },

  /**
   * Get count of assets by type
   */
  async getCountByType(): Promise<Record<AssetType, number>> {
    const assets = await db.assets.toArray()
    return assets.reduce(
      (acc, asset) => {
        acc[asset.type] = (acc[asset.type] || 0) + 1
        return acc
      },
      { image: 0, video: 0, audio: 0 } as Record<AssetType, number>
    )
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
