<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Plus, Trash2, Play, Loader2 } from 'lucide-vue-next'
import type { HttpEndpointTemplate, HttpTemplateParameter, HttpConnectionConfig } from '@/services/connections/types'
import { useConnectionsStore } from '@/stores/connections'
import { HttpAdapterImpl } from '@/services/connections/adapters/HttpAdapter'

const props = defineProps<{
  connectionId: string
  templateId?: string | null
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', template: HttpEndpointTemplate): void
  (e: 'delete', templateId: string): void
}>()

const connectionsStore = useConnectionsStore()

// Form state
const form = ref<{
  id: string
  name: string
  method: HttpEndpointTemplate['method']
  path: string
  headers: Array<{ key: string; value: string }>
  bodyTemplate: string
  parameters: HttpTemplateParameter[]
  description: string
}>({
  id: '',
  name: '',
  method: 'GET',
  path: '',
  headers: [],
  bodyTemplate: '',
  parameters: [],
  description: '',
})

// Test state
const testParams = ref<Record<string, string>>({})
const testResult = ref<{ status: number; body: unknown; error?: string } | null>(null)
const testing = ref(false)

// Load template data when editing
watch(
  [() => props.visible, () => props.templateId],
  ([visible, templateId]) => {
    if (visible && templateId) {
      const connection = connectionsStore.connections.find(
        (c) => c.id === props.connectionId
      ) as HttpConnectionConfig | undefined

      const template = connection?.templates?.find((t) => t.id === templateId)
      if (template) {
        form.value = {
          id: template.id,
          name: template.name,
          method: template.method,
          path: template.path,
          headers: template.headers
            ? Object.entries(template.headers).map(([key, value]) => ({ key, value }))
            : [],
          bodyTemplate: template.bodyTemplate ?? '',
          parameters: template.parameters ?? [],
          description: template.description ?? '',
        }

        // Initialize test params
        testParams.value = {}
        for (const param of template.parameters ?? []) {
          testParams.value[param.name] = String(param.default ?? '')
        }
      }
    } else if (visible) {
      // Reset for new template
      form.value = {
        id: `template_${Date.now()}`,
        name: '',
        method: 'GET',
        path: '',
        headers: [],
        bodyTemplate: '',
        parameters: [],
        description: '',
      }
      testParams.value = {}
      testResult.value = null
    }
  },
  { immediate: true }
)

const isEditing = computed(() => !!props.templateId)

const methods: HttpEndpointTemplate['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const paramTypes: HttpTemplateParameter['type'][] = ['string', 'number', 'boolean', 'json']

function addHeader() {
  form.value.headers.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  form.value.headers.splice(index, 1)
}

function addParameter() {
  const param: HttpTemplateParameter = {
    name: '',
    type: 'string',
    required: false,
  }
  form.value.parameters.push(param)
}

function removeParameter(index: number) {
  const removed = form.value.parameters[index]
  form.value.parameters.splice(index, 1)

  // Remove from test params
  if (removed?.name) {
    delete testParams.value[removed.name]
  }
}

function updateParameterName(index: number, newName: string) {
  const oldName = form.value.parameters[index].name
  form.value.parameters[index].name = newName

  // Update test params key
  if (oldName && testParams.value[oldName] !== undefined) {
    testParams.value[newName] = testParams.value[oldName]
    delete testParams.value[oldName]
  } else if (newName) {
    testParams.value[newName] = ''
  }
}

function handleSave() {
  // Convert headers array to object
  const headers: Record<string, string> = {}
  for (const h of form.value.headers) {
    if (h.key.trim()) {
      headers[h.key.trim()] = h.value
    }
  }

  const template: HttpEndpointTemplate = {
    id: form.value.id,
    name: form.value.name.trim() || 'Untitled Template',
    method: form.value.method,
    path: form.value.path,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    bodyTemplate: form.value.bodyTemplate.trim() || undefined,
    parameters: form.value.parameters.length > 0 ? form.value.parameters : undefined,
    description: form.value.description.trim() || undefined,
  }

  emit('save', template)
}

function handleDelete() {
  if (props.templateId && confirm('Are you sure you want to delete this template?')) {
    emit('delete', props.templateId)
  }
}

async function handleTest() {
  testing.value = true
  testResult.value = null

  let adapter: HttpAdapterImpl | null = null
  let connection: HttpConnectionConfig | undefined
  let originalTemplates: HttpEndpointTemplate[] | undefined
  let templatesSwapped = false

  try {
    connection = connectionsStore.connections.find(
      (c) => c.id === props.connectionId
    ) as HttpConnectionConfig | undefined

    if (!connection) {
      throw new Error('Connection not found')
    }

    // Create a temporary adapter and connect
    adapter = new HttpAdapterImpl(connection)
    await adapter.connect()

    // Convert headers array to object
    const headers: Record<string, string> = {}
    for (const h of form.value.headers) {
      if (h.key.trim()) {
        headers[h.key.trim()] = h.value
      }
    }

    // Create a temp template
    const tempTemplate: HttpEndpointTemplate = {
      id: 'temp',
      name: 'Test',
      method: form.value.method,
      path: form.value.path,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      bodyTemplate: form.value.bodyTemplate.trim() || undefined,
      parameters: form.value.parameters,
    }

    // Temporarily swap in the test template (restored in finally).
    originalTemplates = connection.templates
    connection.templates = [tempTemplate]
    templatesSwapped = true

    // Convert test params to proper types
    const params: Record<string, unknown> = {}
    for (const p of form.value.parameters) {
      const value = testParams.value[p.name]
      switch (p.type) {
        case 'number':
          params[p.name] = parseFloat(value) || 0
          break
        case 'boolean':
          params[p.name] = value === 'true'
          break
        case 'json':
          try {
            params[p.name] = JSON.parse(value)
          } catch {
            params[p.name] = value
          }
          break
        default:
          params[p.name] = value
      }
    }

    const result = await adapter.executeTemplate('temp', params)
    testResult.value = {
      status: 200,
      body: result,
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    testResult.value = {
      status: 0,
      body: null,
      error,
    }
  } finally {
    // Always restore the connection's real templates + release the temp adapter,
    // even if connect/execute threw — otherwise a failed test (common) leaves the
    // connection's saved templates clobbered with the temp "Test" template.
    if (templatesSwapped && connection) {
      connection.templates = originalTemplates
    }
    adapter?.dispose()
    testing.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-overlay"
      @click.self="emit('close')"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ isEditing ? 'Edit Template' : 'New Template' }}</h2>
          <button
            class="close-btn"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Basic Info -->
          <div class="form-section">
            <div class="form-row">
              <div class="form-group flex-1">
                <label>Name</label>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="Get User, Create Order..."
                >
              </div>
              <div class="form-group method-group">
                <label>Method</label>
                <select v-model="form.method">
                  <option
                    v-for="m in methods"
                    :key="m"
                    :value="m"
                  >
                    {{ m }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Path</label>
              <input
                v-model="form.path"
                type="text"
                placeholder="/users/{{userId}}"
                class="mono"
              >
              <span
                v-pre
                class="hint"
              >Use {{paramName}} for dynamic values</span>
            </div>

            <div class="form-group">
              <label>Description</label>
              <input
                v-model="form.description"
                type="text"
                placeholder="Optional description..."
              >
            </div>
          </div>

          <!-- Headers -->
          <div class="form-section">
            <div class="section-header">
              <h3>Headers</h3>
              <button
                class="add-btn"
                @click="addHeader"
              >
                <Plus :size="14" />
                Add
              </button>
            </div>

            <div
              v-for="(header, index) in form.headers"
              :key="index"
              class="kv-row"
            >
              <input
                v-model="header.key"
                type="text"
                placeholder="Header name"
              >
              <input
                v-model="header.value"
                type="text"
                placeholder="Value"
                class="flex-1"
              >
              <button
                class="remove-btn"
                @click="removeHeader(index)"
              >
                <Trash2 :size="14" />
              </button>
            </div>

            <div
              v-if="form.headers.length === 0"
              class="empty-hint"
            >
              No custom headers
            </div>
          </div>

          <!-- Body Template -->
          <div
            v-if="form.method !== 'GET'"
            class="form-section"
          >
            <h3>Body Template</h3>
            <textarea
              v-model="form.bodyTemplate"
              class="mono"
              rows="5"
              placeholder="{&quot;key&quot;: &quot;{{value}}&quot;}"
            />
          </div>

          <!-- Parameters -->
          <div class="form-section">
            <div class="section-header">
              <h3>Parameters</h3>
              <button
                class="add-btn"
                @click="addParameter"
              >
                <Plus :size="14" />
                Add
              </button>
            </div>

            <div
              v-for="(param, index) in form.parameters"
              :key="index"
              class="param-row"
            >
              <input
                :value="param.name"
                type="text"
                placeholder="name"
                @input="updateParameterName(index, ($event.target as HTMLInputElement).value)"
              >
              <select v-model="param.type">
                <option
                  v-for="t in paramTypes"
                  :key="t"
                  :value="t"
                >
                  {{ t }}
                </option>
              </select>
              <input
                v-model="param.default"
                type="text"
                placeholder="default"
              >
              <label class="checkbox-label">
                <input
                  v-model="param.required"
                  type="checkbox"
                >
                Required
              </label>
              <button
                class="remove-btn"
                @click="removeParameter(index)"
              >
                <Trash2 :size="14" />
              </button>
            </div>

            <div
              v-if="form.parameters.length === 0"
              class="empty-hint"
            >
              No parameters defined
            </div>
          </div>

          <!-- Test Section -->
          <div class="form-section test-section">
            <div class="section-header">
              <h3>Test</h3>
              <button
                class="test-btn"
                :disabled="testing"
                @click="handleTest"
              >
                <Loader2
                  v-if="testing"
                  :size="14"
                  class="spin"
                />
                <Play
                  v-else
                  :size="14"
                />
                {{ testing ? 'Testing...' : 'Run Test' }}
              </button>
            </div>

            <!-- Test parameters -->
            <div
              v-if="form.parameters.length > 0"
              class="test-params"
            >
              <div
                v-for="param in form.parameters"
                :key="param.name"
                class="test-param-row"
              >
                <label>{{ param.name }}</label>
                <input
                  v-model="testParams[param.name]"
                  type="text"
                  :placeholder="String(param.default ?? '')"
                >
              </div>
            </div>

            <!-- Test result -->
            <div
              v-if="testResult"
              class="test-result"
              :class="{ error: testResult.error }"
            >
              <div
                v-if="testResult.error"
                class="result-error"
              >
                {{ testResult.error }}
              </div>
              <div
                v-else
                class="result-body"
              >
                <pre>{{ JSON.stringify(testResult.body, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            v-if="isEditing"
            class="delete-btn"
            @click="handleDelete"
          >
            <Trash2 :size="14" />
            Delete
          </button>
          <div class="spacer" />
          <button
            class="cancel-btn"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            class="save-btn"
            @click="handleSave"
          >
            {{ isEditing ? 'Save Changes' : 'Create Template' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--color-neutral-0);
  border-radius: var(--radius-lg);
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-100);
}

.modal-header h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-600);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.form-section {
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-100);
}

.form-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.section-header h3,
.form-section > h3 {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
}

.section-header h3 {
  margin-bottom: 0;
}

.form-row {
  display: flex;
  gap: var(--space-3);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group.flex-1 {
  flex: 1;
}

.form-group.method-group {
  width: 120px;
}

.form-group label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
}

.form-group input,
.form-group select,
.form-group textarea {
  padding: var(--space-2);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  background: var(--color-neutral-50);
  transition: border-color var(--transition-fast);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.mono {
  font-family: var(--font-mono);
}

.hint {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-100);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.add-btn:hover {
  background: var(--color-neutral-200);
}

.kv-row,
.param-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.kv-row input,
.param-row input,
.param-row select {
  padding: var(--space-2);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  background: var(--color-neutral-50);
}

.kv-row input:first-child {
  width: 150px;
}

.param-row input:first-child {
  width: 120px;
}

.param-row select {
  width: 100px;
}

.param-row input:nth-child(3) {
  width: 100px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  white-space: nowrap;
}

.checkbox-label input {
  width: auto;
  margin: 0;
}

.remove-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.remove-btn:hover {
  background: var(--color-error-50);
  color: var(--color-error);
}

.empty-hint {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-400);
  font-style: italic;
}

.test-section {
  background: var(--color-neutral-50);
  margin: 0 calc(var(--space-4) * -1);
  padding: var(--space-4);
  border-bottom: none;
}

.test-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-500);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: white;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.test-btn:hover:not(:disabled) {
  background: var(--color-primary-600);
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-params {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.test-param-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.test-param-row label {
  width: 100px;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
}

.test-param-row input {
  flex: 1;
  padding: var(--space-2);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  background: var(--color-neutral-0);
}

.test-result {
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  max-height: 200px;
  overflow: auto;
}

.test-result.error {
  border-color: var(--color-error-200);
  background: var(--color-error-50);
}

.result-error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.result-body pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-top: 1px solid var(--color-neutral-100);
}

.spacer {
  flex: 1;
}

.delete-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: none;
  border: 1px solid var(--color-error-200);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-error);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.delete-btn:hover {
  background: var(--color-error-50);
}

.cancel-btn {
  padding: var(--space-2) var(--space-3);
  background: none;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--color-neutral-50);
}

.save-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-500);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: white;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.save-btn:hover {
  background: var(--color-primary-600);
}
</style>
