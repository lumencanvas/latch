import type { NodeDefinition } from '../types'

export const objectDetectionLiveNode: NodeDefinition = {
  id: 'object-detection-live',
  name: 'Detect Objects (Live)',
  version: '1.0.0',
  category: 'ai',
  description: 'Continuously detect objects on a live feed with an annotated texture output',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'trigger', type: 'trigger', label: 'Detect Now' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Annotated' },
    { id: 'detections', type: 'data', label: 'Detections' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'topLabel', type: 'string', label: 'Top Label' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'model',
      type: 'select',
      label: 'Model',
      default: 'Xenova/yolos-tiny',
      props: {
        options: [
          { value: 'Xenova/yolos-tiny', label: 'YOLOS Tiny (~27 MB, fastest)' },
          { value: 'onnx-community/dfine_s_coco-ONNX', label: 'D-FINE-S (~41 MB, NMS-free)' },
          { value: 'onnx-community/rtdetr_v2_r18vd-ONNX', label: 'RT-DETRv2 R18 (~81 MB, accurate)' },
          { value: 'Xenova/detr-resnet-50', label: 'DETR ResNet-50 (~160 MB)' },
        ],
      },
    },
    { id: 'threshold', type: 'slider', label: 'Threshold', default: 0.5, props: { min: 0.1, max: 1, step: 0.05 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 20, props: { min: 1, max: 120 } },
    { id: 'showBoxes', type: 'toggle', label: 'Show Boxes', default: true },
    { id: 'showLabels', type: 'toggle', label: 'Show Labels', default: true },
    { id: 'boxColor', type: 'color', label: 'Box Color', default: '#00ff00' },
    { id: 'lineWidth', type: 'slider', label: 'Line Width', default: 2, props: { min: 1, max: 8, step: 1 } },
  ],
  tags: ['object detection', 'live', 'detect', 'yolo', 'yolos', 'detr', 'bounding box', 'vision', 'ai', 'annotate'],
  info: {
    overview:
      'Runs object detection continuously on a live texture or video feed and outputs an annotated texture with bounding boxes drawn over the source frame. Detection is throttled by Frame Interval while the overlay redraws every frame so the passthrough stays smooth. Also outputs the raw detection list, count, and the highest-confidence label.',
    tips: [
      'Wire a webcam or video texture into Source; raise Frame Interval if playback stutters.',
      'YOLOS Tiny is the fastest; D-FINE-S and RT-DETRv2 are newer NMS-free transformer detectors with higher accuracy; DETR ResNet-50 is the heaviest.',
      'The model downloads on first run — watch the Loading output until the first detections appear.',
    ],
    pairsWith: ['webcam', 'snapshot', 'object-detection', 'main-output', 'gate'],
  },
}
