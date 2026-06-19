import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, resolve, sep } from 'path'
import { readdir, readFile, stat, writeFile, unlink, mkdir } from 'fs/promises'
import { watch, type FSWatcher, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let customNodesWatcher: FSWatcher | null = null
let assetsBasePath: string | null = null

/** Only allow opening external http(s) URLs (not file://, custom schemes, etc.). */
function isHttpUrl(url: string): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

/**
 * Resolve `userPath` under `base` and refuse anything that escapes it (path
 * traversal via `..`). Returns the absolute path, or null if it would escape.
 */
function containedPath(base: string, userPath: string): string | null {
  if (typeof userPath !== 'string') return null
  const full = resolve(base, userPath)
  const baseResolved = resolve(base)
  if (full === baseResolved || full.startsWith(baseResolved + sep)) return full
  return null
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for some native modules
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only hand http(s) links to the OS; never file:// or custom schemes.
    if (isHttpUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.lumencanvas.latch')

  // Default open or close DevTools by F12 in dev mode
  // and ignore CommandOrControl + R in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers

// File dialogs
ipcMain.handle('dialog:openFile', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: options?.filters ?? [
      { name: 'CLASP Flow', extensions: ['cfp', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return result
})

ipcMain.handle('dialog:saveFile', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: options?.filters ?? [
      { name: 'CLASP Flow', extensions: ['cfp'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  })
  return result
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return result
})

// App info
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPlatform', () => {
  return process.platform
})

ipcMain.handle('app:getPath', (_, name: string) => {
  return app.getPath(name as any)
})

// Window controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized()
})

// Shell operations
ipcMain.handle('shell:openExternal', (_, url: string) => {
  if (!isHttpUrl(url)) return Promise.resolve()
  return shell.openExternal(url)
})

ipcMain.handle('shell:openPath', (_, path: string) => {
  return shell.openPath(path)
})

ipcMain.handle('shell:showItemInFolder', (_, path: string) => {
  shell.showItemInFolder(path)
})

// Custom Nodes IPC Handlers

// Get the path to custom-nodes folder
ipcMain.handle('customNodes:getPath', () => {
  // In development, use the project root; in production, use app resources
  if (is.dev) {
    return join(process.cwd(), 'custom-nodes')
  }
  return join(app.getPath('userData'), 'custom-nodes')
})

// Scan custom-nodes directory for node packages
ipcMain.handle('customNodes:scanDirectory', async () => {
  const customNodesPath = is.dev
    ? join(process.cwd(), 'custom-nodes')
    : join(app.getPath('userData'), 'custom-nodes')

  try {
    const entries = await readdir(customNodesPath, { withFileTypes: true })
    const packages: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // Check if it has a definition.json
        const defPath = join(customNodesPath, entry.name, 'definition.json')
        try {
          await stat(defPath)
          packages.push(entry.name)
        } catch {
          // No definition.json, skip this folder
        }
      }
    }

    return { success: true, packages }
  } catch (error) {
    return { success: false, error: String(error), packages: [] }
  }
})

// Read a node's definition.json
ipcMain.handle('customNodes:readDefinition', async (_, packageName: string) => {
  const customNodesPath = is.dev
    ? join(process.cwd(), 'custom-nodes')
    : join(app.getPath('userData'), 'custom-nodes')

  const pkgDir = containedPath(customNodesPath, packageName)
  if (!pkgDir) return { success: false, error: 'Invalid package name' }
  const defPath = join(pkgDir, 'definition.json')

  try {
    const content = await readFile(defPath, 'utf-8')
    const definition = JSON.parse(content)
    return { success: true, definition }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Read a node's executor.js
ipcMain.handle('customNodes:readExecutor', async (_, packageName: string) => {
  const customNodesPath = is.dev
    ? join(process.cwd(), 'custom-nodes')
    : join(app.getPath('userData'), 'custom-nodes')

  const pkgDir = containedPath(customNodesPath, packageName)
  if (!pkgDir) return { success: false, error: 'Invalid package name' }
  const execPath = join(pkgDir, 'executor.js')

  try {
    const code = await readFile(execPath, 'utf-8')
    return { success: true, code }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Start watching custom-nodes directory for changes
ipcMain.handle('customNodes:watchDirectory', () => {
  const customNodesPath = is.dev
    ? join(process.cwd(), 'custom-nodes')
    : join(app.getPath('userData'), 'custom-nodes')

  // Stop existing watcher if any
  if (customNodesWatcher) {
    customNodesWatcher.close()
    customNodesWatcher = null
  }

  try {
    customNodesWatcher = watch(customNodesPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
        // Extract package name from the changed file path
        const parts = filename.split(/[/\\]/)
        const packageName = parts[0]
        if (packageName && !packageName.startsWith('.')) {
          mainWindow?.webContents.send('customNodes:fileChanged', {
            eventType,
            packageName,
            filename,
          })
        }
      }
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Stop watching
ipcMain.handle('customNodes:stopWatching', () => {
  if (customNodesWatcher) {
    customNodesWatcher.close()
    customNodesWatcher = null
  }
  return { success: true }
})

// ============================================================================
// Assets IPC Handlers
// ============================================================================

// Get the default assets path
function getAssetsPath(): string {
  if (assetsBasePath) {
    return assetsBasePath
  }
  return join(app.getPath('userData'), 'assets')
}

// Ensure assets directory exists
async function ensureAssetsDir(): Promise<void> {
  const path = getAssetsPath()
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true })
  }
}

// Get assets base path
ipcMain.handle('assets:getBasePath', () => {
  return getAssetsPath()
})

// Set custom assets base path
ipcMain.handle('assets:setBasePath', async (_, path: string) => {
  try {
    // Verify path exists or can be created
    if (!existsSync(path)) {
      await mkdir(path, { recursive: true })
    }
    assetsBasePath = path
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Save file to assets directory
ipcMain.handle('assets:saveFile', async (_, data: Uint8Array, filename: string) => {
  try {
    await ensureAssetsDir()
    const filePath = containedPath(getAssetsPath(), filename)
    if (!filePath) return { success: false, error: 'Invalid filename' }
    await writeFile(filePath, Buffer.from(data))
    return { success: true, path: filePath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Read file from assets directory
ipcMain.handle('assets:readFile', async (_, filename: string) => {
  try {
    const filePath = containedPath(getAssetsPath(), filename)
    if (!filePath) return { success: false, error: 'Invalid filename' }
    const data = await readFile(filePath)
    return { success: true, data: new Uint8Array(data) }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Delete file from assets directory
ipcMain.handle('assets:deleteFile', async (_, filename: string) => {
  try {
    const filePath = containedPath(getAssetsPath(), filename)
    if (!filePath) return { success: false, error: 'Invalid filename' }
    await unlink(filePath)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// List files in assets directory
ipcMain.handle('assets:listFiles', async () => {
  try {
    await ensureAssetsDir()
    const files = await readdir(getAssetsPath())
    return { success: true, files }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
