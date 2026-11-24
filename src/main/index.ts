import { app, BrowserWindow, dialog, shell } from 'electron'
import { join, resolve, sep } from 'path'
import { readdir, readFile, stat, writeFile, unlink, mkdir } from 'fs/promises'
import { watch, type FSWatcher, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_ENTRY_URL, handleAppScheme, registerAppScheme } from './protocol'
import {
  handleTrusted,
  installNavigationGuards,
  installPermissionPolicy,
  isHttpUrl,
  setDevRendererUrl,
} from './security'
import { attachDeviceChooser, registerDeviceChooserIpc } from './deviceChooser'
import { migrateFileOriginStorage } from './storageMigration'

let mainWindow: BrowserWindow | null = null
let customNodesWatcher: FSWatcher | null = null

const devRendererUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
setDevRendererUrl(devRendererUrl)

// Must happen before the 'ready' event.
registerAppScheme()

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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Web Bluetooth / Web Serial: route Chromium's device pick to the renderer chooser.
  attachDeviceChooser(mainWindow.webContents)

  if (devRendererUrl) {
    void mainWindow.loadURL(devRendererUrl)
  } else {
    void mainWindow.loadURL(APP_ENTRY_URL)
  }
}

// App lifecycle
app.whenReady().then(async () => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.lumencanvas.latch')

  handleAppScheme(join(__dirname, '../renderer'))
  installNavigationGuards()
  installPermissionPolicy()
  registerDeviceChooserIpc()

  // Default open or close DevTools by F12 in dev mode
  // and ignore CommandOrControl + R in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Packaged builds only: carry saved flows/prefs over from the pre-app:// (file://) origin.
  if (!devRendererUrl) await migrateFileOriginStorage()

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

// ============================================================================
// IPC Handlers — every channel is sender-validated (top-level frame of our
// renderer origin only). Keep this surface minimal: it is what a compromised
// renderer could reach.
// ============================================================================

type FileFilter = { name: string; extensions: string[] }

function sanitizeFilters(filters: unknown): FileFilter[] | undefined {
  if (!Array.isArray(filters)) return undefined
  return filters
    .filter((f): f is FileFilter => !!f && typeof f.name === 'string' && Array.isArray(f.extensions))
    .map((f) => ({ name: f.name, extensions: f.extensions.filter((e) => typeof e === 'string') }))
}

// File dialogs (parented to the requesting window)
handleTrusted('dialog:openFile', async (event, options?: { filters?: unknown }) => {
  return dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
    properties: ['openFile'],
    filters: sanitizeFilters(options?.filters) ?? [
      { name: 'CLASP Flow', extensions: ['cfp', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
})

handleTrusted('dialog:saveFile', async (event, options?: { filters?: unknown }) => {
  return dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
    filters: sanitizeFilters(options?.filters) ?? [
      { name: 'CLASP Flow', extensions: ['cfp'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  })
})

handleTrusted('dialog:openDirectory', async (event) => {
  return dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
    properties: ['openDirectory'],
  })
})

// App info
handleTrusted('app:getVersion', () => app.getVersion())
handleTrusted('app:getPlatform', () => process.platform)

// Window controls
handleTrusted('window:minimize', () => {
  mainWindow?.minimize()
})

handleTrusted('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

handleTrusted('window:close', () => {
  mainWindow?.close()
})

handleTrusted('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// Shell: http(s) only — never file://, custom schemes or OS handlers.
handleTrusted('shell:openExternal', (_, url: unknown) => {
  if (!isHttpUrl(url)) return Promise.resolve()
  return shell.openExternal(url)
})

// ============================================================================
// Custom Nodes
// ============================================================================

function customNodesDir(): string {
  // In development, use the project root; in production, the user data folder.
  return is.dev ? join(process.cwd(), 'custom-nodes') : join(app.getPath('userData'), 'custom-nodes')
}

handleTrusted('customNodes:getPath', () => customNodesDir())

// Scan custom-nodes directory for node packages
handleTrusted('customNodes:scanDirectory', async () => {
  const customNodesPath = customNodesDir()
  // First run: create the folder so users can drop packages in (and the scan/watch don't log
  // ENOENT errors on every launch).
  await mkdir(customNodesPath, { recursive: true }).catch(() => {})

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
handleTrusted('customNodes:readDefinition', async (_, packageName: string) => {
  const pkgDir = containedPath(customNodesDir(), packageName)
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
handleTrusted('customNodes:readExecutor', async (_, packageName: string) => {
  const pkgDir = containedPath(customNodesDir(), packageName)
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
handleTrusted('customNodes:watchDirectory', () => {
  const customNodesPath = customNodesDir()

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
handleTrusted('customNodes:stopWatching', () => {
  if (customNodesWatcher) {
    customNodesWatcher.close()
    customNodesWatcher = null
  }
  return { success: true }
})

app.on('will-quit', () => {
  customNodesWatcher?.close()
  customNodesWatcher = null
})

// ============================================================================
// Assets — confined to <userData>/assets (the renderer can no longer move it).
// ============================================================================

function getAssetsPath(): string {
  return join(app.getPath('userData'), 'assets')
}

async function ensureAssetsDir(): Promise<void> {
  const path = getAssetsPath()
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true })
  }
}

handleTrusted('assets:getBasePath', () => getAssetsPath())

// Save file to assets directory
handleTrusted('assets:saveFile', async (_, data: Uint8Array, filename: string) => {
  try {
    if (!(data instanceof Uint8Array)) return { success: false, error: 'Invalid data' }
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
handleTrusted('assets:readFile', async (_, filename: string) => {
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
handleTrusted('assets:deleteFile', async (_, filename: string) => {
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
handleTrusted('assets:listFiles', async () => {
  try {
    await ensureAssetsDir()
    const files = await readdir(getAssetsPath())
    return { success: true, files }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
