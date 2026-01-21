import type { NodeDefinition } from '../types'

export const httpRequestNode: NodeDefinition = {
  id: 'http-request',
  name: 'HTTP Request',
  version: '2.0.0',
  category: 'connectivity',
  description: 'Make HTTP/REST API requests with optional template support',
  icon: 'globe',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection' },
    { id: 'templateId', type: 'string', label: 'Template' },
    { id: 'params', type: 'data', label: 'Params' },
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'headers', type: 'data', label: 'Headers' },
    { id: 'body', type: 'data', label: 'Body' },
    { id: 'trigger', type: 'trigger', label: 'Fetch' },
  ],
  outputs: [
    { id: 'response', type: 'data', label: 'Response' },
    { id: 'status', type: 'number', label: 'Status' },
    { id: 'error', type: 'string', label: 'Error' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'connectionId',
      type: 'connection',
      label: 'Connection',
      default: '',
      props: { protocol: 'http', placeholder: 'Select HTTP connection...' },
    },
    {
      id: 'templateId',
      type: 'template-select',
      label: 'Template',
      default: '',
      props: { connectionControlId: 'connectionId', allowInline: true },
    },
    {
      id: 'url',
      type: 'text',
      label: 'URL',
      default: '',
      props: { placeholder: '/path or https://...', showWhen: { templateId: '' } },
    },
    {
      id: 'method',
      type: 'select',
      label: 'Method',
      default: 'GET',
      props: { options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], showWhen: { templateId: '' } },
    },
    {
      id: 'timeout',
      type: 'number',
      label: 'Timeout (ms)',
      default: 30000,
      props: { min: 1000, max: 120000, step: 1000 },
    },
  ],
}
