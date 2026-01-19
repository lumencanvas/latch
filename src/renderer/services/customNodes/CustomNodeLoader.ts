import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { getExecutionEngine, type NodeExecutorFn } from '@/engine/ExecutionEngine'
import { validateDefinition, ValidationError } from './validator'
import { compileExecutor, CompilationError } from './compiler'

export interface CustomNodePackage {
  packageName: string
  definition: NodeDefinition
  executor: NodeExecutorFn
  loadedAt: number
}

export interface LoadError {
  packageName: string
  error: string
  type: 'validation' | 'compilation' | 'load'
}

class CustomNodeLoaderService {
  private loadedNodes: Map<string, CustomNodePackage> = new Map()
  private loadErrors: LoadError[] = []
  private watcherCleanup: (() => void) | null = null
  private initialized = false
  private onReloadCallbacks: Set<(packageName: string) => void> = new Set()
  private pendingReloads: Map<string, ReturnType<typeof setTimeout>> = new Map()

  /**
   * Check if running in Electron environment
   */
  private isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.isElectron
  }

  /**
   * Initialize the custom node loader
   * Should be called once when the app starts
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('CustomNodeLoader already initialized')
      return
    }

    this.initialized = true

    if (!this.isElectron()) {
      console.log('CustomNodeLoader: Running in web mode, file-based custom nodes disabled')
      return
    }

    // Load all custom nodes
    await this.loadAllNodes()

    // Start watching for changes
    await this.startWatching()
  }

  /**
   * Load all custom nodes from the custom-nodes directory
   */
  async loadAllNodes(): Promise<CustomNodePackage[]> {
    if (!this.isElectron()) {
      return []
    }

    const api = window.electronAPI!.customNodes
    this.loadErrors = []

    // Scan directory for packages
    const scanResult = await api.scanDirectory()
    if (!scanResult.success) {
      console.warn('Failed to scan custom-nodes directory:', scanResult.error)
      return []
    }

    const loadedPackages: CustomNodePackage[] = []

    for (const packageName of scanResult.packages) {
      try {
        const pkg = await this.loadNode(packageName)
        if (pkg) {
          loadedPackages.push(pkg)
        }
      } catch (error) {
        // Error already recorded in loadNode
        console.error(`Failed to load custom node "${packageName}":`, error)
      }
    }

    console.log(`CustomNodeLoader: Loaded ${loadedPackages.length} custom nodes`)
    return loadedPackages
  }

  /**
   * Load a single custom node package
   */
  async loadNode(packageName: string): Promise<CustomNodePackage | null> {
    if (!this.isElectron()) {
      throw new Error('Custom node loading only supported in Electron')
    }

    const api = window.electronAPI!.customNodes

    // Read definition
    const defResult = await api.readDefinition(packageName)
    if (!defResult.success || !defResult.definition) {
      this.recordError(packageName, defResult.error ?? 'Failed to read definition', 'load')
      return null
    }

    // Validate definition
    let definition: NodeDefinition
    try {
      definition = validateDefinition(defResult.definition)
    } catch (error) {
      const message = error instanceof ValidationError ? error.message : String(error)
      this.recordError(packageName, message, 'validation')
      return null
    }

    // Read executor
    const execResult = await api.readExecutor(packageName)
    if (!execResult.success || !execResult.code) {
      this.recordError(packageName, execResult.error ?? 'Failed to read executor', 'load')
      return null
    }

    // Compile executor
    let executor: NodeExecutorFn
    try {
      executor = compileExecutor(execResult.code, definition.id)
    } catch (error) {
      const message = error instanceof CompilationError ? error.message : String(error)
      this.recordError(packageName, message, 'compilation')
      return null
    }

    // Unload existing node with same ID if any
    if (this.loadedNodes.has(definition.id)) {
      this.unloadNode(definition.id)
    }

    // Register with stores
    const nodesStore = useNodesStore()
    nodesStore.register(definition)

    const engine = getExecutionEngine()
    engine.registerExecutor(definition.id, executor)

    // Store loaded package
    const pkg: CustomNodePackage = {
      packageName,
      definition,
      executor,
      loadedAt: Date.now(),
    }
    this.loadedNodes.set(definition.id, pkg)

    console.log(`CustomNodeLoader: Loaded "${definition.name}" (${definition.id})`)
    return pkg
  }

  /**
   * Unload a custom node by its ID
   */
  unloadNode(nodeId: string): void {
    const pkg = this.loadedNodes.get(nodeId)
    if (!pkg) {
      return
    }

    const nodesStore = useNodesStore()
    nodesStore.unregister(nodeId)

    const engine = getExecutionEngine()
    engine.unregisterExecutor(nodeId)

    this.loadedNodes.delete(nodeId)
    console.log(`CustomNodeLoader: Unloaded "${nodeId}"`)
  }

  /**
   * Reload a custom node package
   */
  async reloadNode(packageName: string): Promise<void> {
    console.log(`CustomNodeLoader: Reloading "${packageName}"`)

    // Find existing node with this package name
    for (const [nodeId, pkg] of this.loadedNodes) {
      if (pkg.packageName === packageName) {
        this.unloadNode(nodeId)
        break
      }
    }

    // Remove old errors for this package
    this.loadErrors = this.loadErrors.filter(e => e.packageName !== packageName)

    // Reload
    const newPkg = await this.loadNode(packageName)

    // Notify listeners
    if (newPkg) {
      this.notifyReload(packageName)
    }
  }

  /**
   * Start watching for file changes
   */
  private async startWatching(): Promise<void> {
    if (!this.isElectron()) return

    const api = window.electronAPI!.customNodes

    // Start the watcher
    const watchResult = await api.watchDirectory()
    if (!watchResult.success) {
      console.warn('Failed to start custom-nodes watcher:', watchResult.error)
      return
    }

    // Listen for file changes
    this.watcherCleanup = api.onFileChange(async (data) => {
      // Debounce rapid changes using proper Map
      const debounceKey = data.packageName

      // Clear existing timeout if any
      const existingTimeout = this.pendingReloads.get(debounceKey)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Set new debounced reload
      const timeoutId = setTimeout(async () => {
        this.pendingReloads.delete(debounceKey)
        // Reload the package
        await this.reloadNode(data.packageName)
      }, 300)

      this.pendingReloads.set(debounceKey, timeoutId)
    })

    console.log('CustomNodeLoader: File watcher started')
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    // Clear all pending reload timeouts
    for (const timeoutId of this.pendingReloads.values()) {
      clearTimeout(timeoutId)
    }
    this.pendingReloads.clear()

    if (this.watcherCleanup) {
      this.watcherCleanup()
      this.watcherCleanup = null
    }

    if (this.isElectron()) {
      await window.electronAPI!.customNodes.stopWatching()
    }
  }

  /**
   * Record a load error
   */
  private recordError(packageName: string, error: string, type: LoadError['type']): void {
    this.loadErrors.push({ packageName, error, type })
  }

  /**
   * Get all loaded custom node packages
   */
  getLoadedNodes(): CustomNodePackage[] {
    return Array.from(this.loadedNodes.values())
  }

  /**
   * Get all load errors
   */
  getLoadErrors(): LoadError[] {
    return [...this.loadErrors]
  }

  /**
   * Check if a node is a custom node
   */
  isCustomNode(nodeId: string): boolean {
    return this.loadedNodes.has(nodeId)
  }

  /**
   * Register a callback for when a node is reloaded
   */
  onReload(callback: (packageName: string) => void): () => void {
    this.onReloadCallbacks.add(callback)
    return () => {
      this.onReloadCallbacks.delete(callback)
    }
  }

  /**
   * Notify reload listeners
   */
  private notifyReload(packageName: string): void {
    for (const callback of this.onReloadCallbacks) {
      callback(packageName)
    }
  }

  /**
   * Load a custom node from raw definition and code (for web mode)
   */
  loadFromCode(definitionJson: string, executorCode: string): CustomNodePackage {
    // Parse definition
    let defObj: unknown
    try {
      defObj = JSON.parse(definitionJson)
    } catch (error) {
      throw new ValidationError('Invalid JSON in definition')
    }

    // Validate definition
    const definition = validateDefinition(defObj)

    // Compile executor
    const executor = compileExecutor(executorCode, definition.id)

    // Unload existing if any
    if (this.loadedNodes.has(definition.id)) {
      this.unloadNode(definition.id)
    }

    // Register
    const nodesStore = useNodesStore()
    nodesStore.register(definition)

    const engine = getExecutionEngine()
    engine.registerExecutor(definition.id, executor)

    // Store
    const pkg: CustomNodePackage = {
      packageName: `web:${definition.id}`,
      definition,
      executor,
      loadedAt: Date.now(),
    }
    this.loadedNodes.set(definition.id, pkg)

    return pkg
  }

  /**
   * Cleanup when the service is no longer needed
   */
  async dispose(): Promise<void> {
    await this.stopWatching()

    // Unload all custom nodes
    for (const nodeId of this.loadedNodes.keys()) {
      this.unloadNode(nodeId)
    }

    this.initialized = false
  }
}

// Singleton instance
let instance: CustomNodeLoaderService | null = null

export function getCustomNodeLoader(): CustomNodeLoaderService {
  if (!instance) {
    instance = new CustomNodeLoaderService()
  }
  return instance
}
