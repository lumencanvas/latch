import { watch, onMounted, onUnmounted } from 'vue'
import { useFlowsStore } from '@/stores/flows'
import { useRuntimeStore } from '@/stores/runtime'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { builtinExecutors } from '@/engine/executors'
import { audioManager } from '@/services/audio/AudioManager'

/**
 * Composable for integrating the execution engine with the editor
 */
export function useExecutionEngine() {
  const flowsStore = useFlowsStore()
  const runtimeStore = useRuntimeStore()
  const engine = getExecutionEngine()

  /**
   * Register all built-in executors
   */
  function registerBuiltinExecutors() {
    for (const [nodeType, executor] of Object.entries(builtinExecutors)) {
      engine.registerExecutor(nodeType, executor)
    }
  }

  /**
   * Update engine graph when flow changes
   */
  function syncGraph() {
    if (flowsStore.activeFlow) {
      engine.updateGraph(flowsStore.activeFlow.nodes, flowsStore.activeFlow.edges)
    }
  }

  /**
   * Start execution
   */
  async function start() {
    // Initialize audio system (requires user gesture - play button click satisfies this)
    try {
      await audioManager.initialize()
    } catch (error) {
      console.warn('[ExecutionEngine] Failed to initialize audio:', error)
    }

    syncGraph()
    engine.start()
  }

  /**
   * Stop execution
   */
  function stop() {
    engine.stop()
  }

  /**
   * Pause execution
   */
  function pause() {
    engine.pause()
  }

  /**
   * Resume execution
   */
  function resume() {
    engine.resume()
  }

  /**
   * Toggle play/pause
   */
  function toggle() {
    if (runtimeStore.isStopped) {
      start()
    } else if (runtimeStore.isRunning) {
      pause()
    } else {
      resume()
    }
  }

  /**
   * Get output value from a node
   */
  function getOutputValue(nodeId: string, portId: string): unknown {
    return engine.getOutputValue(nodeId, portId)
  }

  // Setup
  onMounted(() => {
    registerBuiltinExecutors()
  })

  // Watch for flow changes and sync to engine
  watch(
    () => [flowsStore.activeFlow?.nodes, flowsStore.activeFlow?.edges],
    () => {
      if (runtimeStore.isRunning || runtimeStore.isPaused) {
        syncGraph()
      }
    },
    { deep: true }
  )

  // Cleanup
  onUnmounted(() => {
    stop()
  })

  return {
    start,
    stop,
    pause,
    resume,
    toggle,
    syncGraph,
    getOutputValue,
    engine,
  }
}
