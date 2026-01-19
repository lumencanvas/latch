import { defineStore } from 'pinia'

export type RuntimeStatus = 'stopped' | 'running' | 'paused'

export interface NodeMetrics {
  nodeId: string
  executionTime: number
  lastExecuted: Date | null
  errorCount: number
  lastError: string | null
  outputValues?: Record<string, unknown>
}

export interface RuntimeError {
  id: string
  nodeId: string
  nodeName: string
  message: string
  timestamp: Date
}

interface RuntimeState {
  status: RuntimeStatus
  fps: number
  targetFps: number
  frameCount: number
  startTime: Date | null
  nodeMetrics: Map<string, NodeMetrics>
  // Version counter to trigger reactivity when Map is mutated
  nodeMetricsVersion: number
  errors: RuntimeError[]
  maxErrors: number
}

export const useRuntimeStore = defineStore('runtime', {
  state: (): RuntimeState => ({
    status: 'stopped',
    fps: 0,
    targetFps: 60,
    frameCount: 0,
    startTime: null,
    nodeMetrics: new Map(),
    nodeMetricsVersion: 0,
    errors: [],
    maxErrors: 100,
  }),

  getters: {
    isRunning: (state) => state.status === 'running',
    isPaused: (state) => state.status === 'paused',
    isStopped: (state) => state.status === 'stopped',

    uptime: (state): number => {
      if (!state.startTime) return 0
      return Date.now() - state.startTime.getTime()
    },

    errorCount: (state) => state.errors.length,

    recentErrors: (state) => state.errors.slice(-10),

    getNodeMetrics: (state) => (nodeId: string): NodeMetrics | undefined => {
      // Reference nodeMetricsVersion to ensure reactivity
      void state.nodeMetricsVersion
      return state.nodeMetrics.get(nodeId)
    },
  },

  actions: {
    start() {
      if (this.status === 'stopped') {
        this.startTime = new Date()
        this.frameCount = 0
      }
      this.status = 'running'
    },

    pause() {
      if (this.status === 'running') {
        this.status = 'paused'
      }
    },

    resume() {
      if (this.status === 'paused') {
        this.status = 'running'
      }
    },

    stop() {
      this.status = 'stopped'
      this.fps = 0
      this.startTime = null
    },

    toggle() {
      if (this.status === 'running') {
        this.pause()
      } else {
        this.start()
      }
    },

    setFps(fps: number) {
      this.fps = fps
    },

    setTargetFps(fps: number) {
      this.targetFps = Math.max(1, Math.min(120, fps))
    },

    incrementFrameCount() {
      this.frameCount++
    },

    updateNodeMetrics(nodeId: string, data: { lastExecutionTime?: number; outputValues?: Record<string, unknown> }) {
      const existing = this.nodeMetrics.get(nodeId)
      this.nodeMetrics.set(nodeId, {
        nodeId,
        executionTime: data.lastExecutionTime ?? existing?.executionTime ?? 0,
        lastExecuted: new Date(),
        errorCount: existing?.errorCount ?? 0,
        lastError: existing?.lastError ?? null,
        outputValues: data.outputValues ?? existing?.outputValues,
      })
      // Trigger reactivity by incrementing version
      this.nodeMetricsVersion++
    },

    updateFps(deltaTime: number) {
      // Smooth FPS calculation
      const instantFps = 1 / deltaTime
      this.fps = Math.round(this.fps * 0.9 + instantFps * 0.1)
      this.frameCount++
    },

    addError(error: { nodeId: string; message: string; timestamp: number }) {
      const runtimeError: RuntimeError = {
        id: `${error.nodeId}-${error.timestamp}`,
        nodeId: error.nodeId,
        nodeName: error.nodeId, // Will be resolved later if needed
        message: error.message,
        timestamp: new Date(error.timestamp),
      }

      this.errors.push(runtimeError)

      // Limit error history
      if (this.errors.length > this.maxErrors) {
        this.errors = this.errors.slice(-this.maxErrors)
      }

      // Update node metrics
      const metrics = this.nodeMetrics.get(error.nodeId)
      if (metrics) {
        metrics.errorCount++
        metrics.lastError = error.message
        this.nodeMetricsVersion++
      }
    },

    recordNodeError(nodeId: string, nodeName: string, message: string) {
      const error: RuntimeError = {
        id: `${nodeId}-${Date.now()}`,
        nodeId,
        nodeName,
        message,
        timestamp: new Date(),
      }

      this.errors.push(error)

      // Limit error history
      if (this.errors.length > this.maxErrors) {
        this.errors = this.errors.slice(-this.maxErrors)
      }

      // Update node metrics
      const metrics = this.nodeMetrics.get(nodeId)
      if (metrics) {
        metrics.errorCount++
        metrics.lastError = message
        this.nodeMetricsVersion++
      }
    },

    clearErrors() {
      this.errors = []
    },

    clearNodeMetrics() {
      this.nodeMetrics.clear()
      this.nodeMetricsVersion++
    },

    reset() {
      this.stop()
      this.clearErrors()
      this.clearNodeMetrics()
    },
  },
})
