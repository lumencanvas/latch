import { contextBridge, ipcRenderer } from 'electron'

/**
 * The renderer's entire view of the main process. Runs in a sandboxed preload
 * (Electron 45: no Buffer/timers/url shims), so it only touches `electron` +
 * `process.platform`. Keep it minimal — no generic channel access.
 */

type FileFilter = { name: string; extensions: string[] }

export interface DeviceChooserDevice {
  id: string
  name: string
  detail?: string
}

export type DeviceChooserUpdate =
  | { requestId: number; kind: 'bluetooth' | 'serial'; devices: DeviceChooserDevice[]; closed?: undefined }
  | { requestId: number; kind: 'bluetooth' | 'serial'; closed: true; devices?: undefined }

type FileChange = { eventType: string; packageName: string; filename: string }

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // File dialogs
  openFile: (options?: { filters?: FileFilter[] }) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: { filters?: FileFilter[] }) => ipcRenderer.invoke('dialog:saveFile', options),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Shell (http/https only, enforced in main)
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Custom Nodes API
  customNodes: {
    getPath: () => ipcRenderer.invoke('customNodes:getPath'),
    scanDirectory: () => ipcRenderer.invoke('customNodes:scanDirectory'),
    readDefinition: (packageName: string) => ipcRenderer.invoke('customNodes:readDefinition', packageName),
    readExecutor: (packageName: string) => ipcRenderer.invoke('customNodes:readExecutor', packageName),
    watchDirectory: () => ipcRenderer.invoke('customNodes:watchDirectory'),
    stopWatching: () => ipcRenderer.invoke('customNodes:stopWatching'),
    onFileChange: (callback: (data: FileChange) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: FileChange) => callback(data)
      ipcRenderer.on('customNodes:fileChanged', subscription)
      return () => {
        ipcRenderer.removeListener('customNodes:fileChanged', subscription)
      }
    },
  },

  // Assets API (confined to <userData>/assets in main)
  assets: {
    getBasePath: () => ipcRenderer.invoke('assets:getBasePath'),
    saveFile: (data: Uint8Array, filename: string) => ipcRenderer.invoke('assets:saveFile', data, filename),
    readFile: (filename: string) => ipcRenderer.invoke('assets:readFile', filename),
    deleteFile: (filename: string) => ipcRenderer.invoke('assets:deleteFile', filename),
    listFiles: () => ipcRenderer.invoke('assets:listFiles'),
  },

  // Web Bluetooth / Web Serial device chooser (see src/main/deviceChooser.ts)
  deviceChooser: {
    onUpdate: (callback: (update: DeviceChooserUpdate) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, update: DeviceChooserUpdate) => callback(update)
      ipcRenderer.on('deviceChooser:update', subscription)
      return () => {
        ipcRenderer.removeListener('deviceChooser:update', subscription)
      }
    },
    respond: (requestId: number, deviceId: string | null) =>
      ipcRenderer.invoke('deviceChooser:respond', requestId, deviceId),
  },
})

// Type definitions for renderer
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      platform: NodeJS.Platform
      getVersion: () => Promise<string>
      getPlatform: () => Promise<NodeJS.Platform>
      openFile: (options?: { filters?: FileFilter[] }) => Promise<Electron.OpenDialogReturnValue>
      saveFile: (options?: { filters?: FileFilter[] }) => Promise<Electron.SaveDialogReturnValue>
      openDirectory: () => Promise<Electron.OpenDialogReturnValue>
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      openExternal: (url: string) => Promise<void>
      customNodes: {
        getPath: () => Promise<string>
        scanDirectory: () => Promise<{ success: boolean; packages: string[]; error?: string }>
        readDefinition: (packageName: string) => Promise<{ success: boolean; definition?: unknown; error?: string }>
        readExecutor: (packageName: string) => Promise<{ success: boolean; code?: string; error?: string }>
        watchDirectory: () => Promise<{ success: boolean; error?: string }>
        stopWatching: () => Promise<{ success: boolean }>
        onFileChange: (callback: (data: FileChange) => void) => () => void
      }
      assets: {
        getBasePath: () => Promise<string>
        saveFile: (data: Uint8Array, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>
        readFile: (filename: string) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>
        deleteFile: (filename: string) => Promise<{ success: boolean; error?: string }>
        listFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
      }
      deviceChooser: {
        onUpdate: (callback: (update: DeviceChooserUpdate) => void) => () => void
        respond: (requestId: number, deviceId: string | null) => Promise<boolean>
      }
    }
  }
}
