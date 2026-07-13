import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeSceneRefs } from '../shared'

const definition: NodeDefinition = {
  id: 'scene-3d',
  name: 'Scene 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Container for 3D objects',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'objects', type: 'object3d', label: 'Objects', multiple: true },
  ],
  outputs: [
    { id: 'scene', type: 'scene3d', label: 'Scene' },
  ],
  controls: [
    { id: 'backgroundColor', type: 'color', label: 'Background', default: '#000000' },
    { id: 'showGrid', type: 'toggle', label: 'Show Grid', default: false },
  ],
  tags: ['scene', '3d', 'world', 'stage', 'container', 'root'],
  info: {
    overview: 'Acts as the root container that holds all 3D objects, lights, and groups. Every 3D pipeline starts here. Connect objects to the input and pass the scene output to Render 3D along with a camera.',
    tips: [
      'Enable Show Grid during development to help with object placement and scale reference.',
      'Set the background color to match your intended environment before adding lights.',
      'Connect multiple objects to the objects input; the node accepts several connections.',
    ],
    pairsWith: ['render-3d', 'camera-3d', 'ambient-light-3d', 'directional-light-3d'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()
  const sceneData = renderer.getOrCreateScene(ctx.nodeId)

  // Get objects input (can be array or single object)
  const objectsInput = ctx.inputs.get('objects')
  const backgroundColorHex = (ctx.controls.get('backgroundColor') as string) ?? '#000000'
  const showGrid = (ctx.controls.get('showGrid') as boolean) ?? false

  // Parse background color
  const backgroundColor = new THREE.Color(backgroundColorHex)
  sceneData.scene.background = backgroundColor

  // Clear previous scene objects
  renderer.clearScene(ctx.nodeId)

  // Track what we're adding this frame
  const sceneRef = { objects: [] as THREE.Object3D[], lights: [] as THREE.Light[] }

  // Add grid helper if enabled
  if (showGrid) {
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
    sceneData.scene.add(gridHelper)
  }

  // Add ambient light as default if no lights added
  let hasLight = false

  // Process objects input
  if (objectsInput) {
    const objects = Array.isArray(objectsInput) ? objectsInput : [objectsInput]

    for (const obj of objects) {
      if (obj instanceof THREE.Object3D) {
        sceneData.scene.add(obj)
        sceneRef.objects.push(obj)

        if (obj instanceof THREE.Light) {
          hasLight = true
          sceneRef.lights.push(obj)
        }
      }
    }
  }

  // Add default lighting if no lights present
  if (!hasLight) {
    // Ambient light for overall illumination
    const defaultAmbient = new THREE.AmbientLight(0xffffff, 0.6)
    sceneData.scene.add(defaultAmbient)

    // Directional light for shape/depth
    const defaultDirectional = new THREE.DirectionalLight(0xffffff, 0.8)
    defaultDirectional.position.set(5, 10, 7)
    sceneData.scene.add(defaultDirectional)
  }

  nodeSceneRefs.set(ctx.nodeId, sceneRef)

  const outputs = new Map<string, unknown>()
  outputs.set('scene', sceneData.scene)
  return outputs
}

export default defineNode({ definition, executor })
