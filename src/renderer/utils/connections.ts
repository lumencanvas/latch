import type { Connection } from '@vue-flow/core'
import type { DataType, NodeDefinition } from '@/stores/nodes'
import { dataTypeMeta } from '@/stores/nodes'

/**
 * Connection compatibility matrix
 * Defines which source types can connect to which target types
 */
const compatibilityMatrix: Record<DataType, DataType[]> = {
  // 'any' can connect to/from anything
  any: [
    'any', 'trigger', 'number', 'string', 'boolean', 'audio', 'video', 'texture', 'data', 'array',
    'scene3d', 'object3d', 'geometry3d', 'material3d', 'camera3d', 'light3d', 'transform3d',
  ],

  // Trigger is event-based, only connects to trigger or any
  trigger: ['trigger', 'any'],

  // Number can coerce to string, boolean
  number: ['number', 'string', 'boolean', 'any'],

  // String is fairly universal
  string: ['string', 'any'],

  // Boolean can coerce to number (0/1), string
  boolean: ['boolean', 'number', 'string', 'any'],

  // Media types are strict
  audio: ['audio', 'any'],
  video: ['video', 'any'],
  texture: ['texture', 'any'],

  // Data types
  data: ['data', 'string', 'any'],
  array: ['array', 'data', 'any'],

  // 3D types - scene3d only connects to scene3d
  scene3d: ['scene3d', 'any'],

  // object3d can connect to object3d (for grouping) and is accepted by scene
  object3d: ['object3d', 'any'],

  // geometry3d is strict
  geometry3d: ['geometry3d', 'any'],

  // material3d is strict
  material3d: ['material3d', 'any'],

  // camera3d is strict
  camera3d: ['camera3d', 'any'],

  // light3d can be treated as object3d (lights are objects)
  light3d: ['light3d', 'object3d', 'any'],

  // transform3d is data about position/rotation/scale
  transform3d: ['transform3d', 'data', 'any'],
}

/**
 * Check if a source type can connect to a target type
 */
export function areTypesCompatible(sourceType: DataType, targetType: DataType): boolean {
  // Any type accepts everything
  if (targetType === 'any') return true

  // Check compatibility matrix
  const compatible = compatibilityMatrix[sourceType] ?? []
  return compatible.includes(targetType)
}

/**
 * Get the port type from a node definition
 * For dynamic nodes like Trigger, checks node data for the actual output type
 */
export function getPortType(
  definition: NodeDefinition | undefined,
  portId: string,
  direction: 'input' | 'output',
  nodeData?: Record<string, unknown>
): DataType | undefined {
  if (!definition) return undefined

  // Special handling for Trigger node - output type is dynamic based on control
  if (definition.id === 'trigger' && direction === 'output' && portId === 'trigger') {
    const outputType = nodeData?.outputType as string
    if (outputType && ['boolean', 'number', 'string', 'json', 'timestamp'].includes(outputType)) {
      // Map trigger output types to data types
      if (outputType === 'json') return 'data'
      if (outputType === 'timestamp') return 'number'
      return outputType as DataType
    }
    // Default to trigger type if no outputType set
    return 'trigger'
  }

  const ports = direction === 'input' ? definition.inputs : definition.outputs
  const port = ports.find(p => p.id === portId)
  return port?.type
}

/**
 * Validate a connection between two nodes
 */
export function validateConnection(
  connection: Connection,
  getDefinition: (nodeType: string) => NodeDefinition | undefined,
  getNodeData: (nodeId: string) => Record<string, unknown> | undefined
): { valid: boolean; reason?: string } {
  const { source, sourceHandle, target, targetHandle } = connection

  // Basic validation
  if (!source || !target || !sourceHandle || !targetHandle) {
    return { valid: false, reason: 'Missing connection data' }
  }

  // Can't connect to self
  if (source === target) {
    return { valid: false, reason: 'Cannot connect node to itself' }
  }

  // Get node definitions
  const sourceData = getNodeData(source)
  const targetData = getNodeData(target)

  if (!sourceData || !targetData) {
    return { valid: false, reason: 'Node data not found' }
  }

  const sourceNodeType = sourceData.nodeType as string
  const targetNodeType = targetData.nodeType as string

  const sourceDef = getDefinition(sourceNodeType)
  const targetDef = getDefinition(targetNodeType)

  if (!sourceDef || !targetDef) {
    // Allow connection if definitions not found (custom nodes)
    return { valid: true }
  }

  // Get port types (pass node data for dynamic type resolution)
  const sourcePortType = getPortType(sourceDef, sourceHandle, 'output', sourceData)
  const targetPortType = getPortType(targetDef, targetHandle, 'input', targetData)

  if (!sourcePortType || !targetPortType) {
    // Allow if port types not found
    return { valid: true }
  }

  // Special case: Trigger node can always connect to trigger inputs
  // The Trigger node's outputType controls the VALUE it sends, but it's still a trigger
  if (sourceDef.id === 'trigger' && targetPortType === 'trigger') {
    return { valid: true }
  }

  // Check type compatibility
  if (!areTypesCompatible(sourcePortType, targetPortType)) {
    const sourceLabel = dataTypeMeta[sourcePortType]?.label ?? sourcePortType
    const targetLabel = dataTypeMeta[targetPortType]?.label ?? targetPortType
    return {
      valid: false,
      reason: `Cannot connect ${sourceLabel} to ${targetLabel}`,
    }
  }

  return { valid: true }
}

/**
 * Get the color for a connection based on source port type
 */
export function getConnectionColor(
  sourceNodeType: string,
  sourceHandle: string,
  getDefinition: (nodeType: string) => NodeDefinition | undefined
): string {
  const def = getDefinition(sourceNodeType)
  if (!def) return dataTypeMeta.any.color

  const port = def.outputs.find(p => p.id === sourceHandle)
  if (!port) return dataTypeMeta.any.color

  return dataTypeMeta[port.type]?.color ?? dataTypeMeta.any.color
}

/**
 * Get the line style for a connection
 */
export function getConnectionStyle(
  sourceNodeType: string,
  sourceHandle: string,
  getDefinition: (nodeType: string) => NodeDefinition | undefined
): { stroke: string; strokeWidth: number; strokeDasharray?: string } {
  const def = getDefinition(sourceNodeType)
  const port = def?.outputs.find(p => p.id === sourceHandle)
  const type = port?.type ?? 'any'
  const meta = dataTypeMeta[type] ?? dataTypeMeta.any

  // Base style
  const style: { stroke: string; strokeWidth: number; strokeDasharray?: string } = {
    stroke: meta.color,
    strokeWidth: 2,
  }

  // Adjust based on type
  switch (type) {
    case 'audio':
    case 'video':
      style.strokeWidth = 3
      break
    case 'texture':
      style.strokeDasharray = '5,5'
      break
    case 'boolean':
    case 'any':
      style.strokeDasharray = '3,3'
      break
  }

  return style
}
