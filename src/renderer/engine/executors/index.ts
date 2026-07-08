/**
 * Node executors registry
 * Each executor is a function that takes an ExecutionContext and returns outputs
 */

import type { NodeExecutorFn } from '../ExecutionEngine'
import { audioExecutors } from './audio'
import { visualExecutors } from './visual'
import { aiExecutors } from './ai'
import { connectivityExecutors } from './connectivity'
import { claspExecutors, disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus } from './clasp'
import { mqttExecutor, disposeMqttNode, disposeAllMqttNodes, gcMqttState } from './mqtt'
import { websocketExecutor, disposeWebSocketNode, disposeAllWebSocketNodes, gcWebSocketState } from './websocket'
import { httpExecutor, disposeHttpNode, disposeAllHttpNodes, gcHttpState } from './http'
import { codeExecutors } from './code'
import { noiseExecutor } from './noise'
import { colorRampExecutor } from './color-ramp'
import { euclideanExecutor } from './euclidean'
import { easingExecutor } from './easing'
import { springExecutor } from './spring'
import {
  slewLimiterExecutor,
  derivativeExecutor,
  integralExecutor,
  tweenToTargetExecutor,
  tapTempoExecutor,
} from './signal'
import { subflowExecutors } from './subflow'
import { threeExecutors } from './3d'
import { stringExecutors } from './string'
import { messagingExecutors } from './messaging'
import { utilityExecutors } from './utility'
import { dataExecutors } from './data'
import { gamepadExecutor, gamepadVisualExecutor } from './gamepad'
import { emulatorExecutor, gcEmulationState, disposeAllEmulationNodes } from './emulation'
import { opencvExecutors } from './opencv'

// Node-group modules extracted from this file (Phase 1 de-monolith). Imported
// here for the builtinExecutors registry; re-exported below to keep the barrel.
import {
  constantExecutor,
  triggerExecutor,
  textboxExecutor,
  sliderExecutor,
  knobExecutor,
  xyPadExecutor,
  keyboardExecutor,
  timeExecutor,
  lfoExecutor,
} from './input'
import {
  mapRangeExecutor,
  clampExecutor,
  absExecutor,
  smoothExecutor,
  randomExecutor,
  trigExecutor,
  powerExecutor,
  vectorMathExecutor,
  moduloExecutor,
  lerpExecutor,
  stepExecutor,
  smoothstepExecutor,
  remapExecutor,
  quantizeExecutor,
  wrapExecutor,
} from './math'
import {
  compareExecutor,
  andExecutor,
  orExecutor,
  notExecutor,
  gateExecutor,
  selectExecutor,
  switchExecutor,
} from './logic'
import {
  startExecutor,
  intervalExecutor,
  delayExecutor,
  timerExecutor,
  metronomeExecutor,
  stepSequencerExecutor,
} from './timing'
import {
  monitorExecutor,
  oscilloscopeExecutor,
  graphExecutor,
  equalizerExecutor,
  consoleExecutor,
} from './debug'
import { retrieveExecutor, vectorMemoryExecutor } from './rag'
import { llmExecutor } from './webllm'
import { colocatedExecutors } from '@/registry/nodeRegistry'

// Re-export CLASP utilities for external use
export { disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus }

// Re-export new connection executor utilities
export { disposeMqttNode, disposeAllMqttNodes, gcMqttState }
export { disposeWebSocketNode, disposeAllWebSocketNodes, gcWebSocketState }
export { disposeHttpNode, disposeAllHttpNodes, gcHttpState }

// Re-export emulation executor state cleanup
export { gcEmulationState, disposeAllEmulationNodes }

// Re-export the extracted node-group modules so the public barrel
// (@/engine/executors) keeps exposing their executors + state stores.
export * from './input'
export * from './math'
export * from './logic'
export * from './timing'
export * from './debug'
export * from './rag'
export * from './webllm'

// ============================================================================
// Registry
// ============================================================================

export const builtinExecutors: Record<string, NodeExecutorFn> = {
  // Inputs
  constant: constantExecutor,
  trigger: triggerExecutor,
  textbox: textboxExecutor,
  slider: sliderExecutor,
  knob: knobExecutor,
  'xy-pad': xyPadExecutor,
  gamepad: gamepadExecutor,
  'gamepad-visual': gamepadVisualExecutor,
  emulator: emulatorExecutor,
  keyboard: keyboardExecutor,
  time: timeExecutor,
  lfo: lfoExecutor,

  // Timing
  start: startExecutor,
  interval: intervalExecutor,
  delay: delayExecutor,
  timer: timerExecutor,
  metronome: metronomeExecutor,
  'step-sequencer': stepSequencerExecutor,
  euclidean: euclideanExecutor,

  // Math (add/subtract/multiply/divide now co-located — see ...colocatedExecutors below)
  'map-range': mapRangeExecutor,
  clamp: clampExecutor,
  abs: absExecutor,
  smooth: smoothExecutor,
  random: randomExecutor,
  noise: noiseExecutor,
  easing: easingExecutor,
  spring: springExecutor,
  'slew-limiter': slewLimiterExecutor,
  derivative: derivativeExecutor,
  integral: integralExecutor,
  'tween-to-target': tweenToTargetExecutor,
  'tap-tempo': tapTempoExecutor,
  trig: trigExecutor,
  power: powerExecutor,
  'vector-math': vectorMathExecutor,
  modulo: moduloExecutor,
  // Advanced Math
  lerp: lerpExecutor,
  step: stepExecutor,
  smoothstep: smoothstepExecutor,
  remap: remapExecutor,
  quantize: quantizeExecutor,
  wrap: wrapExecutor,

  // Logic
  compare: compareExecutor,
  and: andExecutor,
  or: orExecutor,
  not: notExecutor,
  gate: gateExecutor,
  select: selectExecutor,
  switch: switchExecutor,

  // Debug
  monitor: monitorExecutor,
  oscilloscope: oscilloscopeExecutor,
  graph: graphExecutor,
  equalizer: equalizerExecutor,
  console: consoleExecutor,

  // Audio
  ...audioExecutors,

  // Visual
  ...visualExecutors,
  'color-ramp': colorRampExecutor,

  // AI
  ...aiExecutors,
  retrieve: retrieveExecutor,
  'vector-memory': vectorMemoryExecutor,
  llm: llmExecutor,

  // Connectivity (legacy)
  ...connectivityExecutors,

  // Override with new ConnectionManager-based executors
  'mqtt': mqttExecutor,
  'websocket': websocketExecutor,
  'http-request': httpExecutor,

  // CLASP Protocol
  ...claspExecutors,

  // Code
  ...codeExecutors,

  // Subflows
  ...subflowExecutors,

  // 3D
  ...threeExecutors,

  // String
  ...stringExecutors,

  // Messaging
  ...messagingExecutors,

  // Utility (value checking, type comparison, flow control)
  ...utilityExecutors,

  // Data (arrays, objects, type conversion)
  ...dataExecutors,

  // OpenCV.js (CPU image processing)
  ...opencvExecutors,

  // Co-located `registry/<cat>/<node>/node.ts` executors (ROADMAP Phase 6) — win
  // over any legacy entry above so a migrated node's folder is authoritative.
  ...colocatedExecutors,
}
