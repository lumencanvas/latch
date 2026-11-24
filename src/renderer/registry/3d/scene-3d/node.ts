import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeSceneRefs, sceneNodeState } from '../shared'

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
  const scene = sceneData.scene

  // Get objects input (can be array or single object)
  const objectsInput = ctx.inputs.get('objects')
  const backgroundColorHex = (ctx.controls.get('backgroundColor') as string) ?? '#000000'
  const showGrid = (ctx.controls.get('showGrid') as boolean) ?? false

  // Background: mutate in place (was a new Color per frame)
  if (scene.background instanceof THREE.Color) scene.background.set(backgroundColorHex)
  else scene.background = new THREE.Color(backgroundColorHex)

  // Persistent helpers. This used to clearScene() every frame — which DISPOSED every upstream
  // mesh's geometry + material (forcing a re-upload and shader recompile per frame) — then
  // re-created the grid and two fallback lights each frame. Now the scene is diffed instead:
  // upstream objects are only attached/detached, never disposed here.
  let st = sceneNodeState.get(ctx.nodeId)
  if (!st) {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    const directional = new THREE.DirectionalLight(0xffffff, 0.8)
    directional.position.set(5, 10, 7)
    st = { grid: null, ambient, directional, current: new Set() }
    sceneNodeState.set(ctx.nodeId, st)
  }

  if (showGrid && !st.grid) st.grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
  if (st.grid) {
    if (st.grid.parent !== scene) scene.add(st.grid)
    st.grid.visible = showGrid
  }

  // Track what we're adding this frame
  const sceneRef = { objects: [] as THREE.Object3D[], lights: [] as THREE.Light[] }
  let hasLight = false
  const next = new Set<THREE.Object3D>()

  if (objectsInput) {
    const objects = Array.isArray(objectsInput) ? objectsInput : [objectsInput]
    for (const obj of objects) {
      if (obj instanceof THREE.Object3D && !next.has(obj)) {
        next.add(obj)
        if (obj.parent !== scene) scene.add(obj)
        sceneRef.objects.push(obj)
        if (obj instanceof THREE.Light) {
          hasLight = true
          sceneRef.lights.push(obj)
        }
      }
    }
  }

  // Detach objects that are no longer wired (still owned by their own nodes)
  for (const obj of st.current) {
    if (!next.has(obj) && obj.parent === scene) scene.remove(obj)
  }
  st.current = next

  // Default lighting only if no lights present
  for (const light of [st.ambient, st.directional]) {
    if (light.parent !== scene) scene.add(light)
    light.visible = !hasLight
  }

  nodeSceneRefs.set(ctx.nodeId, sceneRef)

  const outputs = new Map<string, unknown>()
  outputs.set('scene', scene)
  return outputs
}

export default defineNode({ definition, executor })
