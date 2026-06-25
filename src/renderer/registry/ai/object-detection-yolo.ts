import type { NodeDefinition } from '../types'

export const objectDetectionYoloNode: NodeDefinition = {
  id: 'object-detection-yolo',
  name: 'Detect Objects (YOLO)',
  version: '1.0.0',
  category: 'ai',
  description: 'Live object detection with a raw YOLOv8/v9/v10 ONNX model via onnxruntime-web',
  icon: 'scan',
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
      id: 'modelUrl',
      type: 'select',
      label: 'Model',
      default: 'https://huggingface.co/onnx-community/yolov10s/resolve/main/onnx/model.onnx',
      props: {
        // Editable so users can point at a lighter local/hosted yolov8n.onnx.
        editable: true,
        options: [
          { value: 'https://huggingface.co/onnx-community/yolov10s/resolve/main/onnx/model.onnx', label: 'YOLOv10-S (COCO, ~29 MB, NMS-free)' },
          { value: 'https://huggingface.co/onnx-community/yolov10m/resolve/main/onnx/model.onnx', label: 'YOLOv10-M (COCO, ~62 MB, NMS-free)' },
          { value: 'https://huggingface.co/Xenova/yolov9-onnx/resolve/main/gelan-c.onnx', label: 'GELAN-C (COCO, ~102 MB)' },
          { value: 'https://huggingface.co/Xenova/yolov9-onnx/resolve/main/yolov9-c.onnx', label: 'YOLOv9-C (COCO, ~205 MB)' },
        ],
      },
    },
    { id: 'threshold', type: 'slider', label: 'Confidence', default: 0.25, props: { min: 0.05, max: 1, step: 0.05 } },
    { id: 'iou', type: 'slider', label: 'IoU (NMS)', default: 0.45, props: { min: 0.1, max: 0.9, step: 0.05 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
    { id: 'showBoxes', type: 'toggle', label: 'Show Boxes', default: true },
    { id: 'showLabels', type: 'toggle', label: 'Show Labels', default: true },
    { id: 'boxColor', type: 'color', label: 'Box Color', default: '#00ff00' },
    { id: 'lineWidth', type: 'slider', label: 'Line Width', default: 2, props: { min: 1, max: 8, step: 1 } },
  ],
  tags: ['object detection', 'yolo', 'yolov8', 'yolov9', 'onnx', 'onnxruntime', 'live', 'bounding box', 'vision', 'ai'],
  info: {
    overview:
      'Runs a raw YOLO ONNX detector on a live feed via onnxruntime-web, drawing COCO bounding boxes over the source frame. Defaults to YOLOv10-S — NMS-free (one-to-one head), small (~29 MB), and fast — with YOLOv10-M and the heavier YOLOv9 GELAN models also available. Higher control than the transformers.js path (custom letterbox decode). The model downloads once on first run and is cached; detection is throttled by Frame Interval while the overlay redraws every frame.',
    tips: [
      'YOLOv10-S downloads in ~29 MB and needs no NMS; the YOLOv9 models are larger but offered for parity.',
      'Confidence filters weak detections. IoU only applies to the YOLOv8/v9 models (YOLOv10 is NMS-free, so it ignores it).',
      'Paste your own yolov8n.onnx / yolov10n.onnx URL into Model for an even smaller/faster model.',
    ],
    pairsWith: ['webcam', 'snapshot', 'object-detection-live', 'main-output', 'gate'],
  },
}
