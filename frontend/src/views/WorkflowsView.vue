<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Handle, Position, VueFlow, type Connection } from '@vue-flow/core'
import {
  Bot,
  CheckCircle2,
  ClipboardPaste,
  CircleDot,
  Copy,
  Database,
  GitBranch,
  History,
  MousePointer2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Split,
  Square,
  Trash2,
  Redo2,
  Undo2,
  Wrench,
  ZoomIn,
} from 'lucide-vue-next'
import { AppSelect } from '@/components'
import { useI18n } from '@/i18n'
import { agentsApi, type Agent } from '@/services/agents'
import { toolsApi, type ToolkitTool } from '@/services/tools'
import {
  buildWorkflowEdge,
  canvasToWorkflow,
  createWorkflowNode,
  workflowToCanvas,
  workflowsApi,
  type Workflow,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowRun,
  type WorkflowTrigger,
} from '@/services/workflows'
import { useAppStore } from '@/stores'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

type SidePanelTab = 'inspect' | 'runs'
type GraphIssueSeverity = 'error' | 'warning'
type WorkflowTemplateId = 'agentReply' | 'toolThenAgent' | 'conditionArchive'

interface GraphIssue {
  id: string
  severity: GraphIssueSeverity
  message: string
  nodeId?: string
  edgeId?: string
}

interface WorkflowTemplate {
  id: WorkflowTemplateId
  label: string
}

interface ConfirmDialogState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone: 'warning' | 'danger'
}

const appStore = useAppStore()
const { t } = useI18n()

const workflows = ref<Workflow[]>([])
const runs = ref<WorkflowRun[]>([])
const activeWorkflowId = ref<string | null>(null)
const selectedRunId = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const running = ref(false)
const refreshingRuns = ref(false)
const canvasNodes = ref<WorkflowCanvasNode[]>([])
const canvasEdges = ref<WorkflowCanvasEdge[]>([])
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const runPayloadText = ref('{}')
const edgeMetadataText = ref('{}')
const viewportKey = ref(0)
const activeSidePanel = ref<SidePanelTab>('inspect')
const agents = ref<Agent[]>([])
const toolkitTools = ref<ToolkitTool[]>([])
const savedSnapshot = ref('')
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const historyPaused = ref(false)
const copiedNode = ref<WorkflowNode | null>(null)
const confirmDialog = ref<ConfirmDialogState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  tone: 'warning',
})
let confirmDialogResolver: ((confirmed: boolean) => void) | null = null

const editForm = ref<Workflow>({
  id: '',
  name: '',
  description: '',
  version: 1,
  enabled: true,
  trigger: { type: 'manual', config: {} },
  nodes: [],
  edges: [],
  variables: {},
  createdAt: '',
  updatedAt: '',
})

const nodeTypeOptions = computed(() => [
  { value: 'start', label: t('page.workflows.nodeTypes.start') },
  { value: 'agent', label: t('page.workflows.nodeTypes.agent') },
  { value: 'tool', label: t('page.workflows.nodeTypes.tool') },
  { value: 'condition', label: t('page.workflows.nodeTypes.condition') },
  { value: 'databaseWrite', label: t('page.workflows.nodeTypes.databaseWrite') },
  { value: 'end', label: t('page.workflows.nodeTypes.end') },
])

const operatorOptions = computed(() => [
  { value: 'equals', label: t('page.workflows.operators.equals') },
  { value: 'notEquals', label: t('page.workflows.operators.notEquals') },
  { value: 'includes', label: t('page.workflows.operators.includes') },
])

const agentOptions = computed(() => agents.value.map((agent) => ({
  value: agent.id,
  label: agent.name || agent.id,
})))

const toolOptions = computed(() => toolkitTools.value
  .filter((tool) => tool.executable)
  .map((tool) => ({
    value: tool.name,
    label: tool.title || tool.name,
  })))

const workflowTemplates = computed<WorkflowTemplate[]>(() => [
  { id: 'agentReply', label: t('page.workflows.templates.agentReply') },
  { id: 'toolThenAgent', label: t('page.workflows.templates.toolThenAgent') },
  { id: 'conditionArchive', label: t('page.workflows.templates.conditionArchive') },
])

const activeWorkflow = computed(() => workflows.value.find((workflow) => workflow.id === activeWorkflowId.value) ?? null)
const selectedRun = computed(() => runs.value.find((run) => run.id === selectedRunId.value) ?? null)
const activeRunCount = computed(() => runs.value.filter((run) => ['queued', 'running', 'waiting'].includes(run.status)).length)
const selectedNode = computed(() => editForm.value.nodes.find((node) => node.id === selectedNodeId.value) ?? null)
const selectedEdge = computed(() => editForm.value.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null)
const selectedNodeState = computed(() => selectedNode.value ? selectedRun.value?.nodeStates[selectedNode.value.id] ?? null : null)
const hasSelection = computed(() => Boolean(selectedNode.value || selectedEdge.value))
const edgeCount = computed(() => editForm.value.edges.length)
const nodeCount = computed(() => editForm.value.nodes.length)
const isDraftWorkflow = computed(() => !activeWorkflowId.value)
const workflowTitle = computed(() => editForm.value.name.trim() || t('page.workflows.newWorkflow'))
const runPayloadError = computed(() => validateJsonObject(runPayloadText.value))
const edgeMetadataError = computed(() => selectedEdge.value ? validateJsonObject(edgeMetadataText.value) : '')
const draftSnapshot = computed(() => buildDraftSnapshot())
const hasUnsavedChanges = computed(() => Boolean(savedSnapshot.value && draftSnapshot.value !== savedSnapshot.value))
const graphIssues = computed(() => validateGraph())
const blockingGraphIssues = computed(() => graphIssues.value.filter((issue) => issue.severity === 'error'))
const warningGraphIssues = computed(() => graphIssues.value.filter((issue) => issue.severity === 'warning'))
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
const canCopyNode = computed(() => Boolean(selectedNode.value && selectedNode.value.type !== 'start' && selectedNode.value.type !== 'end'))
const canPasteNode = computed(() => Boolean(copiedNode.value))
const canRunWorkflow = computed(() => Boolean(activeWorkflow.value && !running.value && !runPayloadError.value && !hasUnsavedChanges.value && blockingGraphIssues.value.length === 0))

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleEditorKeydown)
  await Promise.all([loadWorkflows(), loadSupportingResources()])
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleEditorKeydown)
})

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) {
    return true
  }

  return confirmDiscardUnsaved()
})

watch(selectedRun, () => {
  captureCanvasGraph()
  syncCanvasFromWorkflow()
})

watch(selectedEdge, (edge) => {
  edgeMetadataText.value = edge?.metadata ? JSON.stringify(edge.metadata, null, 2) : '{}'
})

watch(draftSnapshot, (nextSnapshot, previousSnapshot) => {
  if (historyPaused.value || !previousSnapshot || nextSnapshot === previousSnapshot) {
    return
  }
  undoStack.value.push(previousSnapshot)
  if (undoStack.value.length > 80) {
    undoStack.value.shift()
  }
  redoStack.value = []
})

function createEmptyWorkflow(): Workflow {
  return {
    id: '',
    name: '',
    description: '',
    version: 1,
    enabled: true,
    trigger: { type: 'manual', config: {} },
    nodes: [
      createWorkflowNode('start', 0),
      createWorkflowNode('end', 1),
    ].map((node, index) => ({
      ...node,
      id: index === 0 ? 'start' : 'end',
      name: index === 0 ? t('page.workflows.nodeTypes.start') : t('page.workflows.nodeTypes.end'),
    })),
    edges: [],
    variables: {},
    createdAt: '',
    updatedAt: '',
  }
}

function cloneWorkflow(workflow: Workflow): Workflow {
  return JSON.parse(JSON.stringify(workflow)) as Workflow
}

function getDraftNodes(): WorkflowNode[] {
  const canvasPositionById = new Map<string, { x: number; y: number }>()
  for (const node of canvasNodes.value as unknown as WorkflowCanvasNode[]) {
    canvasPositionById.set(node.id, {
      x: node.position.x,
      y: node.position.y,
    })
  }
  return editForm.value.nodes.map((node, index) => {
    const canvasPosition = canvasPositionById.get(node.id)
    return {
      ...node,
      position: canvasPosition ?? node.position ?? {
        x: 120 + (index % 4) * 260,
        y: 120 + Math.floor(index / 4) * 180,
      },
    }
  })
}

function getDraftEdges(): WorkflowEdge[] {
  if (canvasEdges.value.length === 0) {
    return editForm.value.edges
  }

  const edgeById = new Map<string, WorkflowEdge>()
  for (const edge of editForm.value.edges) {
    if (edge.id) {
      edgeById.set(edge.id, edge)
    }
  }

  const edges: WorkflowEdge[] = []
  for (const edge of canvasEdges.value as unknown as WorkflowCanvasEdge[]) {
    const existing = edgeById.get(edge.id)
    edges.push({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      fromHandle: edge.sourceHandle ?? undefined,
      toHandle: edge.targetHandle ?? undefined,
      branch: edge.data?.branch ?? existing?.branch ?? (edge.sourceHandle === 'true' || edge.sourceHandle === 'false' ? edge.sourceHandle : undefined),
      label: typeof edge.label === 'string' ? edge.label : edge.data?.label ?? existing?.label,
      metadata: existing?.metadata,
    })
  }
  return edges
}

function buildDraftWorkflow(): Workflow {
  return {
    ...editForm.value,
    name: editForm.value.name,
    description: editForm.value.description,
    version: editForm.value.version,
    enabled: editForm.value.enabled,
    trigger: editForm.value.trigger,
    variables: editForm.value.variables,
    nodes: getDraftNodes(),
    edges: getDraftEdges(),
  }
}

function buildDraftSnapshot(): string {
  return JSON.stringify({
    activeWorkflowId: activeWorkflowId.value,
    workflow: buildDraftWorkflow(),
  })
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function pauseHistoryForNextTick() {
  historyPaused.value = true
  queueMicrotask(() => {
    historyPaused.value = false
  })
}

function clearHistory() {
  undoStack.value = []
  redoStack.value = []
}

function restoreDraftSnapshot(snapshot: string) {
  const parsed = JSON.parse(snapshot) as { activeWorkflowId: string | null; workflow: Workflow }
  historyPaused.value = true
  activeWorkflowId.value = parsed.activeWorkflowId
  editForm.value = cloneWorkflow(parsed.workflow)
  resetSelection()
  syncCanvasFromWorkflow()
  resetViewport()
  queueMicrotask(() => {
    historyPaused.value = false
  })
}

function undoEdit() {
  const snapshot = undoStack.value.pop()
  if (!snapshot) {
    return
  }
  redoStack.value.push(draftSnapshot.value)
  restoreDraftSnapshot(snapshot)
}

function redoEdit() {
  const snapshot = redoStack.value.pop()
  if (!snapshot) {
    return
  }
  undoStack.value.push(draftSnapshot.value)
  restoreDraftSnapshot(snapshot)
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
}

function handleEditorKeydown(event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier || isEditableTarget(event.target)) {
    return
  }

  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undoEdit()
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault()
    redoEdit()
  } else if (key === 'c') {
    event.preventDefault()
    copySelectedNode()
  } else if (key === 'v') {
    event.preventDefault()
    pasteCopiedNode()
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }

  throw new Error('JSON object expected')
}

function validateJsonObject(value: string): string {
  try {
    parseJsonObject(value.trim() || '{}')
    return ''
  } catch {
    return t('page.workflows.jsonInvalid')
  }
}

function nodeDisplayName(node: WorkflowNode): string {
  return node.name.trim() || node.id
}

function requiredConfigIssue(node: WorkflowNode, key: string): GraphIssue {
  return {
    id: `${node.id}:${key}:required`,
    severity: 'error',
    nodeId: node.id,
    message: t('page.workflows.validation.requiredConfig', {
      node: nodeDisplayName(node),
      field: key,
    }),
  }
}

function validateGraph(): GraphIssue[] {
  const nodes = getDraftNodes()
  const edges = getDraftEdges()
  const issues: GraphIssue[] = []
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, WorkflowEdge[]>()
  const incoming = new Map<string, WorkflowEdge[]>()

  if (!editForm.value.name.trim()) {
    issues.push({
      id: 'workflow-name',
      severity: 'error',
      message: t('page.workflows.nameRequired'),
    })
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      issues.push({
        id: `${edge.id ?? `${edge.from}:${edge.to}`}:dangling`,
        severity: 'error',
        edgeId: edge.id,
        message: t('page.workflows.validation.danglingEdge'),
      })
      continue
    }
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
  }

  const startNodes = nodes.filter((node) => node.type === 'start')
  const endNodes = nodes.filter((node) => node.type === 'end')
  if (startNodes.length !== 1) {
    issues.push({
      id: 'start-count',
      severity: 'error',
      message: t('page.workflows.validation.singleStart'),
    })
  }
  if (endNodes.length === 0) {
    issues.push({
      id: 'end-count',
      severity: 'error',
      message: t('page.workflows.validation.missingEnd'),
    })
  }

  for (const node of nodes) {
    const nodeOutgoing = outgoing.get(node.id) ?? []
    const nodeIncoming = incoming.get(node.id) ?? []
    if (node.type !== 'start' && nodeIncoming.length === 0) {
      issues.push({
        id: `${node.id}:incoming`,
        severity: 'warning',
        nodeId: node.id,
        message: t('page.workflows.validation.noIncoming', { node: nodeDisplayName(node) }),
      })
    }
    if (node.type !== 'end' && nodeOutgoing.length === 0) {
      issues.push({
        id: `${node.id}:outgoing`,
        severity: 'error',
        nodeId: node.id,
        message: t('page.workflows.validation.noOutgoing', { node: nodeDisplayName(node) }),
      })
    }
    if (node.type === 'condition') {
      const branches = new Set(nodeOutgoing.map((edge) => edge.branch ?? edge.fromHandle))
      if (!branches.has('true') || !branches.has('false')) {
        issues.push({
          id: `${node.id}:condition-branches`,
          severity: 'error',
          nodeId: node.id,
          message: t('page.workflows.validation.conditionBranches', { node: nodeDisplayName(node) }),
        })
      }
    }
    if (node.type === 'agent') {
      if (!configStringValue(node, 'agentId').trim()) {
        issues.push(requiredConfigIssue(node, 'agentId'))
      }
      if (!configStringValue(node, 'message').trim()) {
        issues.push(requiredConfigIssue(node, 'message'))
      }
    }
    if (node.type === 'tool' && !configStringValue(node, 'toolName').trim()) {
      issues.push(requiredConfigIssue(node, 'toolName'))
    }
    if (node.type === 'databaseWrite') {
      for (const key of ['id', 'namespace', 'ownerUserId', 'title']) {
        if (!configStringValue(node, key).trim()) {
          issues.push(requiredConfigIssue(node, key))
        }
      }
    }
  }

  const startNode = startNodes[0]
  if (startNode) {
    const visited = new Set<string>()
    const queue = [startNode.id]
    while (queue.length > 0) {
      const nodeId = queue.shift()
      if (!nodeId || visited.has(nodeId)) {
        continue
      }
      visited.add(nodeId)
      for (const edge of outgoing.get(nodeId) ?? []) {
        queue.push(edge.to)
      }
    }

    if (endNodes.length > 0 && !endNodes.some((node) => visited.has(node.id))) {
      issues.push({
        id: 'end-unreachable',
        severity: 'error',
        message: t('page.workflows.validation.endUnreachable'),
      })
    }

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        issues.push({
          id: `${node.id}:unreachable`,
          severity: 'warning',
          nodeId: node.id,
          message: t('page.workflows.validation.unreachable', { node: nodeDisplayName(node) }),
        })
      }
    }
  }

  return issues
}

function resetSelection() {
  selectedNodeId.value = null
  selectedEdgeId.value = null
  edgeMetadataText.value = '{}'
}

function resetViewport() {
  viewportKey.value += 1
}

function syncCanvasFromWorkflow() {
  const { nodes, edges } = workflowToCanvas(editForm.value, selectedRun.value)
  canvasNodes.value = nodes
  canvasEdges.value = edges
}

function captureCanvasGraph() {
  if (canvasNodes.value.length === 0 && editForm.value.nodes.length > 0) {
    return
  }

  const graph = canvasToWorkflow(
    editForm.value,
    canvasNodes.value as unknown as WorkflowCanvasNode[],
    canvasEdges.value as unknown as WorkflowCanvasEdge[],
  )
  editForm.value.nodes = graph.nodes
  editForm.value.edges = graph.edges
}

function resetEditor(workflow?: Workflow | null) {
  historyPaused.value = true
  editForm.value = workflow ? cloneWorkflow(workflow) : createEmptyWorkflow()
  resetSelection()
  activeSidePanel.value = 'inspect'
  syncCanvasFromWorkflow()
  resetViewport()
  savedSnapshot.value = buildDraftSnapshot()
  clearHistory()
  pauseHistoryForNextTick()
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function stringifyValue(value: unknown) {
  if (value === undefined) return '-'
  return JSON.stringify(value, null, 2)
}

function configStringValue(node: WorkflowNode, key: string): string {
  const value = node.config[key]
  return typeof value === 'string' ? value : ''
}

function setConfigStringValue(node: WorkflowNode, key: string, value: string) {
  node.config[key] = value
}

function configJsonValue(node: WorkflowNode, key: string): string {
  const value = node.config[key]
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return ''
}

function setConfigJsonValue(node: WorkflowNode, key: string, value: string) {
  try {
    node.config[key] = value.trim() ? JSON.parse(value) as Record<string, unknown> : {}
  } catch {
    node.config[key] = value
  }
}

function updateAgentSelection(node: WorkflowNode, value: string | number) {
  const agentId = String(value)
  node.config.agentId = agentId
  const agent = agents.value.find((item) => item.id === agentId)
  if (agent && node.name === nodeTypeLabel('agent')) {
    node.name = agent.name
    updateCanvasNodeLabel(node.id, node.name)
  }
}

function buildToolInputTemplate(tool: ToolkitTool): Record<string, unknown> {
  return Object.fromEntries(tool.parameters.map((parameter) => {
    if (parameter.defaultValue !== undefined) {
      return [parameter.name, parameter.defaultValue]
    }
    if (parameter.type === 'object') {
      return [parameter.name, {}]
    }
    if (parameter.type === 'array') {
      return [parameter.name, []]
    }
    if (parameter.type === 'boolean') {
      return [parameter.name, false]
    }
    if (parameter.type === 'number') {
      return [parameter.name, 0]
    }
    return [parameter.name, '']
  }))
}

function updateToolSelection(node: WorkflowNode, value: string | number) {
  const toolName = String(value)
  node.config.toolName = toolName
  const tool = toolkitTools.value.find((item) => item.name === toolName)
  if (!tool) {
    return
  }
  if (node.name === nodeTypeLabel('tool')) {
    node.name = tool.title || tool.name
    updateCanvasNodeLabel(node.id, node.name)
  }
  if (!node.config.input || typeof node.config.input !== 'object' || Array.isArray(node.config.input)) {
    node.config.input = buildToolInputTemplate(tool)
  }
}

function selectedToolkitTool(node: WorkflowNode): ToolkitTool | null {
  const toolName = configStringValue(node, 'toolName')
  return toolkitTools.value.find((tool) => tool.name === toolName) ?? null
}

function toolParameters(node: WorkflowNode): ToolkitTool['parameters'] {
  return selectedToolkitTool(node)?.parameters ?? []
}

function toolInputRecord(node: WorkflowNode): Record<string, unknown> {
  if (!node.config.input || typeof node.config.input !== 'object' || Array.isArray(node.config.input)) {
    node.config.input = {}
  }
  return node.config.input as Record<string, unknown>
}

function toolParameterOptions(parameter: ToolkitTool['parameters'][number]) {
  return (parameter.enumValues ?? []).map((value) => ({
    value,
    label: value,
  }))
}

function toolParameterStringValue(node: WorkflowNode, parameterName: string): string {
  const value = toolInputRecord(node)[parameterName]
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

function toolParameterNumberValue(node: WorkflowNode, parameterName: string): number {
  const value = toolInputRecord(node)[parameterName]
  return typeof value === 'number' ? value : Number(value || 0)
}

function toolParameterBooleanValue(node: WorkflowNode, parameterName: string): boolean {
  return Boolean(toolInputRecord(node)[parameterName])
}

function toolParameterJsonValue(node: WorkflowNode, parameterName: string): string {
  const value = toolInputRecord(node)[parameterName]
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined) {
    return ''
  }
  return JSON.stringify(value, null, 2)
}

function setToolParameterValue(node: WorkflowNode, parameterName: string, value: unknown) {
  toolInputRecord(node)[parameterName] = value
}

function setToolParameterJsonValue(node: WorkflowNode, parameter: ToolkitTool['parameters'][number], value: string) {
  try {
    const emptyValue = parameter.type === 'array' ? [] : {}
    setToolParameterValue(node, parameter.name, value.trim() ? JSON.parse(value) as unknown : emptyValue)
  } catch {
    setToolParameterValue(node, parameter.name, value)
  }
}

function nodeTypeLabel(type: WorkflowNodeType): string {
  return t(`page.workflows.nodeTypes.${type}` as const)
}

function statusLabel(status: string): string {
  return t(`page.workflows.statuses.${status}` as const)
}

function statusTone(status?: string): string {
  if (!status) return 'muted'
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'running' || status === 'waiting' || status === 'queued') return 'info'
  return 'muted'
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

function requestConfirm(options: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmDialogState['tone']
}): Promise<boolean> {
  if (confirmDialogResolver) {
    confirmDialogResolver(false)
  }
  confirmDialog.value = {
    open: true,
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? t('common.confirm'),
    cancelLabel: options.cancelLabel ?? t('common.cancel'),
    tone: options.tone ?? 'warning',
  }
  return new Promise((resolve) => {
    confirmDialogResolver = resolve
  })
}

function resolveConfirmDialog(confirmed: boolean) {
  confirmDialog.value.open = false
  confirmDialogResolver?.(confirmed)
  confirmDialogResolver = null
}

function confirmDiscardUnsaved(): Promise<boolean> {
  if (!hasUnsavedChanges.value) {
    return Promise.resolve(true)
  }
  return requestConfirm({
    title: t('page.workflows.unsavedTitle'),
    message: t('page.workflows.unsavedConfirm'),
    confirmLabel: t('page.workflows.discardChanges'),
    tone: 'warning',
  })
}

function focusIssue(issue: GraphIssue) {
  if (issue.nodeId) {
    handleNodeClick(issue.nodeId)
    return
  }
  if (issue.edgeId) {
    handleEdgeClick(issue.edgeId)
  }
}

async function loadSupportingResources() {
  try {
    const [nextAgents, nextTools] = await Promise.all([
      agentsApi.list(),
      toolsApi.list(),
    ])
    agents.value = nextAgents
    toolkitTools.value = nextTools
  } catch (error) {
    console.error('Failed to load workflow supporting resources', error)
  }
}

async function loadWorkflows() {
  loading.value = true
  try {
    workflows.value = await workflowsApi.list()
    const nextWorkflow = workflows.value.find((workflow) => workflow.id === activeWorkflowId.value) ?? workflows.value[0] ?? null
    activeWorkflowId.value = nextWorkflow?.id ?? null
    resetEditor(nextWorkflow)
    if (nextWorkflow) {
      await loadRuns(nextWorkflow.id)
    } else {
      runs.value = []
      selectedRunId.value = null
    }
  } catch (error) {
    console.error('Failed to load workflows', error)
    appStore.notify(t('page.workflows.loadFailed'), 'error')
  } finally {
    loading.value = false
  }
}

async function selectWorkflow(id: string) {
  if (id === activeWorkflowId.value || !(await confirmDiscardUnsaved())) {
    return
  }
  activeWorkflowId.value = id
  const workflow = workflows.value.find((item) => item.id === id) ?? null
  resetEditor(workflow)
  await loadRuns(id)
}

async function loadRuns(workflowId: string) {
  refreshingRuns.value = true
  try {
    runs.value = await workflowsApi.listRuns(workflowId)
    selectedRunId.value = runs.value[0]?.id ?? null
  } catch (error) {
    console.error('Failed to load runs', error)
    appStore.notify(t('page.workflows.runsLoadFailed'), 'error')
  } finally {
    refreshingRuns.value = false
  }
}

async function openCreateWorkflow() {
  if (!(await confirmDiscardUnsaved())) {
    return
  }
  activeWorkflowId.value = null
  selectedRunId.value = null
  runs.value = []
  resetEditor(null)
}

function addNode(type: WorkflowNodeType) {
  captureCanvasGraph()
  const node = createWorkflowNode(type, editForm.value.nodes.length)
  node.name = t(`page.workflows.nodeTypes.${type}` as const)
  editForm.value.nodes.push(node)
  syncCanvasFromWorkflow()
  selectedNodeId.value = node.id
  selectedEdgeId.value = null
  activeSidePanel.value = 'inspect'
}

function createNamedNode(type: WorkflowNodeType, index: number, nameKey: string, config: Record<string, unknown> = {}, position?: { x: number; y: number }, id?: string): WorkflowNode {
  const node = createWorkflowNode(type, index)
  return {
    ...node,
    id: id ?? (type === 'start' ? 'start' : type === 'end' ? 'end' : node.id),
    name: t(nameKey),
    config: {
      ...node.config,
      ...config,
    },
    position: position ?? node.position,
  }
}

function createTemplateWorkflow(templateId: WorkflowTemplateId): Pick<Workflow, 'nodes' | 'edges'> {
  const firstAgentId = agents.value[0]?.id ?? ''
  const firstToolName = toolkitTools.value.find((tool) => tool.executable)?.name ?? ''
  if (templateId === 'toolThenAgent') {
    const nodes = [
      createNamedNode('start', 0, 'page.workflows.nodeTypes.start', {}, { x: 80, y: 160 }),
      createNamedNode('tool', 1, 'page.workflows.nodeTypes.tool', { toolName: firstToolName, input: {} }, { x: 360, y: 160 }, 'tool'),
      createNamedNode('agent', 2, 'page.workflows.nodeTypes.agent', { agentId: firstAgentId, message: '{{outputs.tool.output}}' }, { x: 640, y: 160 }, 'agent'),
      createNamedNode('end', 3, 'page.workflows.nodeTypes.end', { output: '{{outputs.agent}}' }, { x: 920, y: 160 }),
    ]
    return {
      nodes,
      edges: [
        { id: 'start::output::default::tool', from: nodes[0].id, to: nodes[1].id, fromHandle: 'output' },
        { id: 'tool::output::default::agent', from: nodes[1].id, to: nodes[2].id, fromHandle: 'output' },
        { id: 'agent::output::default::end', from: nodes[2].id, to: nodes[3].id, fromHandle: 'output' },
      ],
    }
  }

  if (templateId === 'conditionArchive') {
    const nodes = [
      createNamedNode('start', 0, 'page.workflows.nodeTypes.start', {}, { x: 80, y: 220 }),
      createNamedNode('condition', 1, 'page.workflows.nodeTypes.condition', { left: '{{context.triggerPayload.archive}}', operator: 'equals', right: 'true' }, { x: 360, y: 220 }, 'condition'),
      createNamedNode('databaseWrite', 2, 'page.workflows.nodeTypes.databaseWrite', {
        target: 'reference',
        id: 'workflow-reference-{{context.runId}}',
        namespace: 'workflow-output',
        ownerUserId: '{{context.triggerPayload.ownerUserId}}',
        title: 'Workflow output {{context.runId}}',
        content: { payload: '{{context.triggerPayload}}' },
      }, { x: 640, y: 120 }, 'database'),
      createNamedNode('end', 3, 'page.workflows.nodeTypes.end', { output: '{{context.lastNodeOutput}}' }, { x: 920, y: 220 }),
    ]
    return {
      nodes,
      edges: [
        { id: 'start::output::default::condition', from: nodes[0].id, to: nodes[1].id, fromHandle: 'output' },
        { id: 'condition::true::default::database', from: nodes[1].id, to: nodes[2].id, fromHandle: 'true', branch: 'true', label: 'true' },
        { id: 'condition::false::default::end', from: nodes[1].id, to: nodes[3].id, fromHandle: 'false', branch: 'false', label: 'false' },
        { id: 'database::output::default::end', from: nodes[2].id, to: nodes[3].id, fromHandle: 'output' },
      ],
    }
  }

  const nodes = [
    createNamedNode('start', 0, 'page.workflows.nodeTypes.start', {}, { x: 80, y: 160 }),
    createNamedNode('agent', 1, 'page.workflows.nodeTypes.agent', { agentId: firstAgentId, message: '{{context.triggerPayload.message}}' }, { x: 360, y: 160 }, 'agent'),
    createNamedNode('end', 2, 'page.workflows.nodeTypes.end', { output: '{{outputs.agent}}' }, { x: 640, y: 160 }),
  ]
  return {
    nodes,
    edges: [
      { id: 'start::output::default::agent', from: nodes[0].id, to: nodes[1].id, fromHandle: 'output' },
      { id: 'agent::output::default::end', from: nodes[1].id, to: nodes[2].id, fromHandle: 'output' },
    ],
  }
}

async function applyTemplate(templateId: WorkflowTemplateId) {
  if (!(await confirmDiscardUnsaved())) {
    return
  }

  const previousSnapshot = buildDraftSnapshot()
  const template = workflowTemplates.value.find((item) => item.id === templateId)
  const graph = createTemplateWorkflow(templateId)
  activeWorkflowId.value = null
  selectedRunId.value = null
  runs.value = []
  editForm.value = {
    ...createEmptyWorkflow(),
    name: template?.label ?? '',
    nodes: graph.nodes,
    edges: graph.edges,
  }
  resetSelection()
  syncCanvasFromWorkflow()
  resetViewport()
  savedSnapshot.value = previousSnapshot
}

function autoLayoutWorkflow() {
  captureCanvasGraph()
  const nodes = editForm.value.nodes
  const edges = editForm.value.edges
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map<string, WorkflowEdge[]>()

  for (const edge of edges) {
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }

  const depth = new Map<string, number>()
  const queue = nodes
    .filter((node) => node.type === 'start' || (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
  for (const nodeId of queue) {
    depth.set(nodeId, 0)
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (!nodeId) {
      continue
    }
    const nextDepth = (depth.get(nodeId) ?? 0) + 1
    for (const edge of outgoing.get(nodeId) ?? []) {
      if ((depth.get(edge.to) ?? -1) < nextDepth) {
        depth.set(edge.to, nextDepth)
        queue.push(edge.to)
      }
    }
  }

  const columns = new Map<number, WorkflowNode[]>()
  for (const node of nodes) {
    const nodeDepth = depth.get(node.id) ?? columns.size
    columns.set(nodeDepth, [...(columns.get(nodeDepth) ?? []), node])
  }

  const positioned = nodes.map((node) => {
    const nodeDepth = depth.get(node.id) ?? 0
    const column = columns.get(nodeDepth) ?? []
    const row = Math.max(0, column.findIndex((item) => item.id === node.id))
    const rowOffset = (column.length - 1) * 84
    return {
      ...node,
      position: {
        x: 80 + nodeDepth * 280,
        y: 220 + row * 168 - rowOffset,
      },
    }
  })

  editForm.value.nodes = positioned
  syncCanvasFromWorkflow()
  resetViewport()
}

function copySelectedNode() {
  if (!selectedNode.value) {
    return
  }
  if (selectedNode.value.type === 'start' || selectedNode.value.type === 'end') {
    appStore.notify(t('page.workflows.cannotCopyBoundary'), 'error')
    return
  }

  const draftNode = getDraftNodes().find((node) => node.id === selectedNode.value?.id)
  if (!draftNode) {
    return
  }
  copiedNode.value = cloneValue(draftNode)
  appStore.notify(t('page.workflows.copiedNode'), 'success')
}

function pasteCopiedNode() {
  if (!copiedNode.value) {
    appStore.notify(t('page.workflows.noNodeToPaste'), 'error')
    return
  }

  captureCanvasGraph()
  const base = copiedNode.value
  const node = createWorkflowNode(base.type, editForm.value.nodes.length)
  node.name = `${base.name} ${t('page.workflows.copySuffix')}`
  node.config = cloneValue(base.config)
  node.position = {
    x: (base.position?.x ?? 120) + 48,
    y: (base.position?.y ?? 120) + 48,
  }
  editForm.value.nodes.push(node)
  syncCanvasFromWorkflow()
  selectedNodeId.value = node.id
  selectedEdgeId.value = null
  activeSidePanel.value = 'inspect'
}

function removeNode(nodeId: string) {
  const node = editForm.value.nodes.find((item) => item.id === nodeId)
  if (!node || node.type === 'start' || node.type === 'end') {
    return
  }
  editForm.value.nodes = editForm.value.nodes.filter((item) => item.id !== nodeId)
  editForm.value.edges = editForm.value.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId)
  resetSelection()
  syncCanvasFromWorkflow()
}

function removeEdge(edgeId: string) {
  editForm.value.edges = editForm.value.edges.filter((edge) => edge.id !== edgeId)
  selectedEdgeId.value = null
  syncCanvasFromWorkflow()
}

function deleteSelection() {
  if (selectedNodeId.value) {
    removeNode(selectedNodeId.value)
    return
  }
  if (selectedEdgeId.value) {
    removeEdge(selectedEdgeId.value)
  }
}

function updateNodeType(node: WorkflowNode, value: string | number) {
  const nextType = String(value) as WorkflowNodeType
  node.type = nextType
  if (nextType === 'condition') {
    node.config = { operator: 'equals' }
  } else if (nextType === 'tool') {
    node.config = { input: {} }
  } else if (nextType === 'databaseWrite') {
    node.config = { target: 'reference', content: {} }
  } else {
    node.config = {}
  }
  editForm.value.edges = editForm.value.edges.map((edge) => {
    if (edge.from !== node.id || nextType === 'condition') {
      return edge
    }
    return {
      ...edge,
      fromHandle: undefined,
      branch: undefined,
      label: undefined,
    }
  })
  syncCanvasFromWorkflow()
}

function updateCanvasNodeLabel(nodeId: string, name: string) {
  const index = canvasNodes.value.findIndex((node) => node.id === nodeId)
  if (index < 0) {
    return
  }

  const current = canvasNodes.value[index]
  canvasNodes.value[index] = {
    ...current,
    data: {
      label: name,
      nodeType: selectedNode.value?.type ?? current.data?.nodeType ?? 'tool',
      status: selectedRun.value?.nodeStates[nodeId]?.status,
    },
  }
}

function syncCanvasNodeType(nodeId: string, type: WorkflowNodeType, name: string) {
  const index = canvasNodes.value.findIndex((node) => node.id === nodeId)
  if (index < 0) {
    return
  }

  const current = canvasNodes.value[index]
  canvasNodes.value[index] = {
    ...current,
    data: {
      label: name,
      nodeType: type,
      status: selectedRun.value?.nodeStates[nodeId]?.status,
    },
  }
}

function handleConnect(connection: Connection) {
  if (!connection.source || !connection.target) {
    return
  }
  captureCanvasGraph()
  const edge = buildWorkflowEdge({
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
  })
  editForm.value.edges = editForm.value.edges.filter((item) => item.id !== edge.id)
  editForm.value.edges.push(edge)
  syncCanvasFromWorkflow()
  selectedEdgeId.value = edge.id ?? null
  selectedNodeId.value = null
  activeSidePanel.value = 'inspect'
}

function handleNodeClick(nodeId: string) {
  selectedNodeId.value = nodeId
  selectedEdgeId.value = null
  activeSidePanel.value = 'inspect'
}

function handleEdgeClick(edgeId: string) {
  selectedEdgeId.value = edgeId
  selectedNodeId.value = null
  activeSidePanel.value = 'inspect'
}

function clearSelection() {
  resetSelection()
}

function updateEdgeLabel(value: string) {
  if (!selectedEdge.value) {
    return
  }
  selectedEdge.value.label = value
  syncCanvasFromWorkflow()
}

function updateEdgeMetadata(value: string) {
  edgeMetadataText.value = value
  if (!selectedEdge.value) {
    return
  }
  try {
    selectedEdge.value.metadata = parseJsonObject(value.trim() || '{}')
  } catch {
    return
  }
  syncCanvasFromWorkflow()
}

async function saveWorkflow() {
  if (!editForm.value.name.trim()) {
    appStore.notify(t('page.workflows.nameRequired'), 'error')
    return
  }
  if (edgeMetadataError.value) {
    appStore.notify(edgeMetadataError.value, 'error')
    return
  }

  saving.value = true
  try {
    captureCanvasGraph()
    const basePayload: {
      name: string
      description: string
      version: number
      enabled: boolean
      trigger: WorkflowTrigger
      nodes: WorkflowNode[]
      edges: WorkflowEdge[]
      variables: Record<string, unknown>
    } = {
      name: editForm.value.name.trim(),
      description: editForm.value.description,
      version: editForm.value.version,
      enabled: editForm.value.enabled,
      trigger: editForm.value.trigger,
      nodes: editForm.value.nodes,
      edges: editForm.value.edges,
      variables: editForm.value.variables,
    }

    const isUpdating = Boolean(activeWorkflowId.value)
    const workflow = activeWorkflowId.value
      ? await workflowsApi.update(activeWorkflowId.value, basePayload)
      : await workflowsApi.create(editForm.value.id ? { ...basePayload, id: editForm.value.id } : basePayload)

    const existingIndex = workflows.value.findIndex((item) => item.id === workflow.id)
    if (existingIndex >= 0) {
      workflows.value[existingIndex] = workflow
    } else {
      workflows.value.unshift(workflow)
    }
    activeWorkflowId.value = workflow.id
    resetEditor(workflow)
    await loadRuns(workflow.id)
    appStore.notify(t(isUpdating ? 'page.workflows.updated' : 'page.workflows.created'), 'success')
  } catch (error) {
    console.error('Failed to save workflow', error)
    appStore.notify(t('page.workflows.saveFailed'), 'error')
  } finally {
    saving.value = false
  }
}

async function deleteWorkflow(id: string) {
  const confirmed = await requestConfirm({
    title: t('page.workflows.deleteTitle'),
    message: t('page.workflows.deleteConfirm'),
    confirmLabel: t('page.workflows.deleteConfirmAction'),
    tone: 'danger',
  })
  if (!confirmed) {
    return
  }

  try {
    await workflowsApi.remove(id)
    await loadWorkflows()
    appStore.notify(t('page.workflows.deleted'), 'success')
  } catch (error) {
    console.error('Failed to delete workflow', error)
    appStore.notify(t('page.workflows.deleteFailed'), 'error')
  }
}

async function runWorkflow() {
  if (!activeWorkflowId.value) return
  if (hasUnsavedChanges.value) {
    appStore.notify(t('page.workflows.saveBeforeRun'), 'error')
    activeSidePanel.value = 'inspect'
    return
  }
  const firstBlockingIssue = blockingGraphIssues.value[0]
  if (firstBlockingIssue) {
    focusIssue(firstBlockingIssue)
    appStore.notify(firstBlockingIssue.message, 'error')
    return
  }
  const error = validateJsonObject(runPayloadText.value)
  if (error) {
    appStore.notify(error, 'error')
    return
  }

  running.value = true
  try {
    const payload = parseJsonObject(runPayloadText.value.trim() || '{}')
    const run = await workflowsApi.run(activeWorkflowId.value, payload)
    await loadRuns(activeWorkflowId.value)
    selectedRunId.value = run.id
    activeSidePanel.value = 'runs'
    appStore.notify(t('page.workflows.runStarted'), 'success')
  } catch (error) {
    console.error('Failed to run workflow', error)
    appStore.notify(t('page.workflows.runFailed'), 'error')
  } finally {
    running.value = false
  }
}

async function cancelRun(runId: string) {
  try {
    await workflowsApi.cancelRun(runId)
    if (activeWorkflowId.value) {
      await loadRuns(activeWorkflowId.value)
    }
    appStore.notify(t('page.workflows.runCancelled'), 'success')
  } catch (error) {
    console.error('Failed to cancel run', error)
    appStore.notify(t('page.workflows.cancelFailed'), 'error')
  }
}
</script>

<template>
  <div class="workflows-view">
    <aside class="workflow-list-panel">
      <div class="workflow-list-header">
        <div>
          <h3>{{ t('page.workflows.listTitle') }}</h3>
          <p>{{ t('page.workflows.listHint') }}</p>
        </div>
        <button class="btn btn-secondary btn-icon" :title="t('page.workflows.create')" @click="openCreateWorkflow">
          <Plus :size="16" />
        </button>
      </div>

      <div class="workflow-list scrollbar">
        <button
          v-for="workflow in workflows"
          :key="workflow.id"
          :class="['workflow-item', { active: workflow.id === activeWorkflowId }]"
          @click="selectWorkflow(workflow.id)"
        >
          <span class="workflow-item-title">{{ workflow.name }}</span>
          <span class="workflow-item-meta">{{ workflow.nodes.length }} {{ t('page.workflows.nodes') }}</span>
          <span :class="['status-badge', workflow.enabled ? 'success' : 'muted']">
            {{ workflow.enabled ? t('common.enabled') : t('common.disabled') }}
          </span>
        </button>

        <div v-if="!loading && workflows.length === 0" class="empty-state">
          <GitBranch :size="32" />
          <p>{{ t('page.workflows.empty') }}</p>
        </div>
      </div>
    </aside>

    <main class="workflow-designer">
      <div class="workflow-topbar">
        <div class="workflow-title-block">
          <span :class="['status-dot', editForm.enabled ? 'enabled' : 'disabled']"></span>
          <div>
            <h2>{{ workflowTitle }}</h2>
            <p>
              {{ isDraftWorkflow ? t('page.workflows.create') : activeWorkflow?.id }}
              <span>{{ nodeCount }} {{ t('page.workflows.nodes') }}</span>
              <span>{{ edgeCount }} {{ t('page.workflows.edges') }}</span>
              <span v-if="hasUnsavedChanges" class="unsaved-pill">{{ t('page.workflows.unsaved') }}</span>
            </p>
          </div>
        </div>

        <div class="workflow-actions">
          <button class="btn btn-secondary btn-sm" @click="autoLayoutWorkflow">
            <GitBranch :size="16" />
            {{ t('page.workflows.autoLayout') }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="!canUndo" :title="t('page.workflows.undo')" @click="undoEdit">
            <Undo2 :size="16" />
            {{ t('page.workflows.undo') }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="!canRedo" :title="t('page.workflows.redo')" @click="redoEdit">
            <Redo2 :size="16" />
            {{ t('page.workflows.redo') }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="!canCopyNode" :title="t('page.workflows.copyNode')" @click="copySelectedNode">
            <Copy :size="16" />
            {{ t('page.workflows.copyNode') }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="!canPasteNode" :title="t('page.workflows.pasteNode')" @click="pasteCopiedNode">
            <ClipboardPaste :size="16" />
            {{ t('page.workflows.pasteNode') }}
          </button>
          <button class="btn btn-secondary btn-sm" @click="resetViewport">
            <ZoomIn :size="16" />
            {{ t('page.workflows.viewportReset') }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="!hasSelection" @click="deleteSelection">
            <Trash2 :size="16" />
            {{ t('page.workflows.deleteSelected') }}
          </button>
          <button v-if="activeWorkflow" class="btn btn-danger btn-sm" @click="deleteWorkflow(activeWorkflow.id)">
            <Trash2 :size="16" />
            {{ t('common.delete') }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveWorkflow">
            <Save :size="16" />
            {{ t('common.save') }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="!canRunWorkflow" @click="runWorkflow">
            <Play :size="16" />
            {{ t('page.workflows.runNow') }}
          </button>
        </div>
      </div>

      <div v-if="graphIssues.length > 0" class="workflow-quality-bar">
        <span :class="['status-badge', blockingGraphIssues.length > 0 ? 'danger' : 'success']">
          {{ blockingGraphIssues.length > 0 ? t('page.workflows.validation.blocked') : t('page.workflows.validation.ready') }}
        </span>
        <span v-if="warningGraphIssues.length > 0" class="quality-more">
          {{ t('page.workflows.validation.warnings', { count: String(warningGraphIssues.length) }) }}
        </span>
        <button
          v-for="issue in graphIssues.slice(0, 3)"
          :key="issue.id"
          :class="['quality-issue', issue.severity]"
          @click="focusIssue(issue)"
        >
          {{ issue.message }}
        </button>
        <span v-if="graphIssues.length > 3" class="quality-more">
          {{ t('page.workflows.validation.moreIssues', { count: String(graphIssues.length - 3) }) }}
        </span>
      </div>

      <div v-if="loading" class="loading-state">
        <RefreshCw :size="24" class="spin" />
      </div>

      <div v-else class="workflow-workspace">
        <nav class="node-palette" :aria-label="t('page.workflows.paletteTitle')">
          <button class="palette-button" :title="t('page.workflows.addAgentNode')" @click="addNode('agent')">
            <Bot :size="18" />
            <span>{{ t('page.workflows.nodeTypes.agent') }}</span>
          </button>
          <button class="palette-button" :title="t('page.workflows.addToolNode')" @click="addNode('tool')">
            <Wrench :size="18" />
            <span>{{ t('page.workflows.nodeTypes.tool') }}</span>
          </button>
          <button class="palette-button" :title="t('page.workflows.addConditionNode')" @click="addNode('condition')">
            <Split :size="18" />
            <span>{{ t('page.workflows.nodeTypes.condition') }}</span>
          </button>
          <button class="palette-button" :title="t('page.workflows.addDatabaseNode')" @click="addNode('databaseWrite')">
            <Database :size="18" />
            <span>{{ t('page.workflows.nodeTypes.databaseWrite') }}</span>
          </button>
          <div class="palette-divider"></div>
          <button
            v-for="template in workflowTemplates"
            :key="template.id"
            class="palette-button template"
            :title="template.label"
            @click="applyTemplate(template.id)"
          >
            <Plus :size="18" />
            <span>{{ template.label }}</span>
          </button>
        </nav>

        <section class="canvas-panel">
          <div class="canvas-header">
            <div>
              <h3>{{ t('page.workflows.canvasTitle') }}</h3>
              <p>{{ t('page.workflows.canvasHint') }}</p>
            </div>
            <span v-if="selectedRun" :class="['status-badge', statusTone(selectedRun.status)]">
              {{ statusLabel(selectedRun.status) }}
            </span>
          </div>

          <div class="canvas-shell">
            <VueFlow
              :key="viewportKey"
              v-model:nodes="canvasNodes"
              v-model:edges="canvasEdges"
              class="workflow-canvas"
              :fit-view-on-init="true"
              :min-zoom="0.2"
              :max-zoom="1.5"
              :default-viewport="{ zoom: 0.9, x: 0, y: 0 }"
              @connect="handleConnect"
              @pane-click="clearSelection"
              @node-click="({ node }) => handleNodeClick(node.id)"
              @edge-click="({ edge }) => handleEdgeClick(edge.id)"
            >
              <Background :gap="20" :size="1" pattern-color="var(--workflow-canvas-grid)" />
              <Controls position="bottom-left" />

              <template #node-workflowNode="nodeProps">
                <div
                  :class="[
                    'workflow-node',
                    `workflow-node--${nodeProps.data.nodeType}`,
                    nodeProps.data.status ? `workflow-node--status-${nodeProps.data.status}` : '',
                    { selected: nodeProps.id === selectedNodeId },
                  ]"
                >
                  <Handle
                    v-if="nodeProps.data.nodeType !== 'start'"
                    id="input"
                    type="target"
                    :position="Position.Left"
                    class="workflow-handle"
                  />
                  <div class="workflow-node-header">
                    <span class="workflow-node-type">{{ nodeTypeLabel(nodeProps.data.nodeType) }}</span>
                    <span v-if="nodeProps.data.status" :class="['node-status-pill', statusTone(nodeProps.data.status)]">
                      {{ statusLabel(nodeProps.data.status) }}
                    </span>
                  </div>
                  <div class="workflow-node-label">{{ nodeProps.data.label }}</div>
                  <div class="workflow-node-id">{{ nodeProps.id }}</div>
                  <template v-if="nodeProps.data.nodeType === 'condition'">
                    <Handle id="true" type="source" :position="Position.Right" class="workflow-handle workflow-handle-true" :style="{ top: '35%' }" />
                    <Handle id="false" type="source" :position="Position.Right" class="workflow-handle workflow-handle-false" :style="{ top: '68%' }" />
                    <span class="workflow-branch-label workflow-branch-label-true">{{ t('page.workflows.branchTrue') }}</span>
                    <span class="workflow-branch-label workflow-branch-label-false">{{ t('page.workflows.branchFalse') }}</span>
                  </template>
                  <Handle
                    v-else-if="nodeProps.data.nodeType !== 'end'"
                    id="output"
                    type="source"
                    :position="Position.Right"
                    class="workflow-handle"
                  />
                </div>
              </template>
            </VueFlow>

            <div v-if="canvasNodes.length === 0" class="canvas-empty">
              <MousePointer2 :size="28" />
              <p>{{ t('page.workflows.emptyCanvas') }}</p>
            </div>
          </div>
        </section>

        <aside class="workflow-side-panel">
          <div class="side-tabs">
            <button :class="{ active: activeSidePanel === 'inspect' }" @click="activeSidePanel = 'inspect'">
              <Settings2 :size="16" />
              {{ t('page.workflows.inspectTab') }}
            </button>
            <button :class="{ active: activeSidePanel === 'runs' }" @click="activeSidePanel = 'runs'">
              <History :size="16" />
              {{ t('page.workflows.runsTab') }}
            </button>
          </div>

          <div v-if="activeSidePanel === 'inspect'" class="side-panel-scroll scrollbar">
            <template v-if="selectedNode">
              <div class="side-section-header">
                <h3>{{ t('page.workflows.nodeProperties') }}</h3>
                <p>{{ selectedNode.id }}</p>
              </div>

              <div v-if="selectedNodeState" class="selection-status">
                <span :class="['status-badge', statusTone(selectedNodeState.status)]">{{ statusLabel(selectedNodeState.status) }}</span>
                <span>{{ t('page.workflows.attempt') }}: {{ selectedNodeState.attempt }}</span>
              </div>

              <label class="field">
                <span>{{ t('common.name') }}</span>
                <input
                  v-model="selectedNode.name"
                  class="input"
                  type="text"
                  @input="updateCanvasNodeLabel(selectedNode.id, selectedNode.name)"
                />
              </label>
              <label class="field">
                <span>{{ t('page.workflows.nodeType') }}</span>
                <AppSelect
                  :model-value="selectedNode.type"
                  :options="nodeTypeOptions"
                  @update:model-value="updateNodeType(selectedNode, $event); syncCanvasNodeType(selectedNode.id, selectedNode.type, selectedNode.name)"
                />
              </label>

              <template v-if="selectedNode.type === 'agent'">
                <label class="field">
                  <span>{{ t('page.workflows.agentId') }}</span>
                  <AppSelect
                    :model-value="configStringValue(selectedNode, 'agentId')"
                    :options="agentOptions"
                    :placeholder="t('page.workflows.agentIdPlaceholder')"
                    :disabled="agentOptions.length === 0"
                    @update:model-value="updateAgentSelection(selectedNode, $event)"
                  />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.messageTemplate') }}</span>
                  <textarea :value="configStringValue(selectedNode, 'message')" class="textarea" rows="5" :placeholder="t('page.workflows.messageTemplatePlaceholder')" @input="setConfigStringValue(selectedNode, 'message', ($event.target as HTMLTextAreaElement).value)"></textarea>
                </label>
              </template>

              <template v-else-if="selectedNode.type === 'tool'">
                <label class="field">
                  <span>{{ t('page.workflows.toolName') }}</span>
                  <AppSelect
                    :model-value="configStringValue(selectedNode, 'toolName')"
                    :options="toolOptions"
                    :placeholder="t('page.workflows.toolNamePlaceholder')"
                    :disabled="toolOptions.length === 0"
                    @update:model-value="updateToolSelection(selectedNode, $event)"
                  />
                </label>
                <div v-if="toolParameters(selectedNode).length > 0" class="tool-parameter-list">
                  <div class="tool-parameter-title">{{ t('page.workflows.toolParameters') }}</div>
                  <label
                    v-for="parameter in toolParameters(selectedNode)"
                    :key="parameter.name"
                    class="field tool-parameter-field"
                  >
                    <span class="tool-parameter-label">
                      {{ parameter.name }}
                      <b v-if="parameter.required">{{ t('page.workflows.required') }}</b>
                    </span>
                    <AppSelect
                      v-if="parameter.enumValues?.length"
                      :model-value="toolParameterStringValue(selectedNode, parameter.name)"
                      :options="toolParameterOptions(parameter)"
                      @update:model-value="setToolParameterValue(selectedNode, parameter.name, String($event))"
                    />
                    <label v-else-if="parameter.type === 'boolean'" class="toggle-row compact">
                      <input
                        :checked="toolParameterBooleanValue(selectedNode, parameter.name)"
                        type="checkbox"
                        @change="setToolParameterValue(selectedNode, parameter.name, ($event.target as HTMLInputElement).checked)"
                      />
                      <span>{{ t('common.enabled') }}</span>
                    </label>
                    <input
                      v-else-if="parameter.type === 'number'"
                      :value="toolParameterNumberValue(selectedNode, parameter.name)"
                      class="input"
                      type="number"
                      @input="setToolParameterValue(selectedNode, parameter.name, Number(($event.target as HTMLInputElement).value))"
                    />
                    <textarea
                      v-else-if="parameter.type === 'object' || parameter.type === 'array'"
                      :value="toolParameterJsonValue(selectedNode, parameter.name)"
                      class="textarea code-textarea"
                      rows="4"
                      @input="setToolParameterJsonValue(selectedNode, parameter, ($event.target as HTMLTextAreaElement).value)"
                    ></textarea>
                    <input
                      v-else
                      :value="toolParameterStringValue(selectedNode, parameter.name)"
                      class="input"
                      type="text"
                      @input="setToolParameterValue(selectedNode, parameter.name, ($event.target as HTMLInputElement).value)"
                    />
                    <small v-if="parameter.description" class="field-hint">{{ parameter.description }}</small>
                  </label>
                </div>
                <label class="field">
                  <span>{{ t('page.workflows.toolInput') }}</span>
                  <textarea :value="configJsonValue(selectedNode, 'input')" class="textarea code-textarea" rows="8" @input="setConfigJsonValue(selectedNode, 'input', ($event.target as HTMLTextAreaElement).value)"></textarea>
                </label>
              </template>

              <template v-else-if="selectedNode.type === 'condition'">
                <label class="field">
                  <span>{{ t('page.workflows.leftValue') }}</span>
                  <input :value="configStringValue(selectedNode, 'left')" class="input" type="text" :placeholder="t('page.workflows.expressionPlaceholder')" @input="setConfigStringValue(selectedNode, 'left', ($event.target as HTMLInputElement).value)" />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.operator') }}</span>
                  <AppSelect
                    :model-value="String(selectedNode.config.operator ?? 'equals')"
                    :options="operatorOptions"
                    @update:model-value="selectedNode.config.operator = String($event)"
                  />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.rightValue') }}</span>
                  <input :value="configStringValue(selectedNode, 'right')" class="input" type="text" :placeholder="t('page.workflows.expressionPlaceholder')" @input="setConfigStringValue(selectedNode, 'right', ($event.target as HTMLInputElement).value)" />
                </label>
              </template>

              <template v-else-if="selectedNode.type === 'databaseWrite'">
                <label class="field">
                  <span>{{ t('page.workflows.referenceId') }}</span>
                  <input :value="configStringValue(selectedNode, 'id')" class="input" type="text" :placeholder="t('page.workflows.referenceIdPlaceholder')" @input="setConfigStringValue(selectedNode, 'id', ($event.target as HTMLInputElement).value)" />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.namespace') }}</span>
                  <input :value="configStringValue(selectedNode, 'namespace')" class="input" type="text" :placeholder="t('page.workflows.namespacePlaceholder')" @input="setConfigStringValue(selectedNode, 'namespace', ($event.target as HTMLInputElement).value)" />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.ownerUserId') }}</span>
                  <input :value="configStringValue(selectedNode, 'ownerUserId')" class="input" type="text" :placeholder="t('page.workflows.ownerUserIdPlaceholder')" @input="setConfigStringValue(selectedNode, 'ownerUserId', ($event.target as HTMLInputElement).value)" />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.referenceTitle') }}</span>
                  <input :value="configStringValue(selectedNode, 'title')" class="input" type="text" :placeholder="t('page.workflows.referenceTitlePlaceholder')" @input="setConfigStringValue(selectedNode, 'title', ($event.target as HTMLInputElement).value)" />
                </label>
                <label class="field">
                  <span>{{ t('page.workflows.referenceContent') }}</span>
                  <textarea :value="configJsonValue(selectedNode, 'content')" class="textarea code-textarea" rows="8" @input="setConfigJsonValue(selectedNode, 'content', ($event.target as HTMLTextAreaElement).value)"></textarea>
                </label>
              </template>

              <template v-else-if="selectedNode.type === 'end'">
                <label class="field">
                  <span>{{ t('page.workflows.endOutput') }}</span>
                  <input :value="configStringValue(selectedNode, 'output')" class="input" type="text" :placeholder="t('page.workflows.endOutputPlaceholder')" @input="setConfigStringValue(selectedNode, 'output', ($event.target as HTMLInputElement).value)" />
                </label>
              </template>
            </template>

            <template v-else-if="selectedEdge">
              <div class="side-section-header">
                <h3>{{ t('page.workflows.edgeProperties') }}</h3>
                <p>{{ selectedEdge.id }}</p>
              </div>
              <label class="field">
                <span>{{ t('page.workflows.edgeLabel') }}</span>
                <input :value="selectedEdge.label ?? ''" class="input" type="text" @input="updateEdgeLabel(($event.target as HTMLInputElement).value)" />
              </label>
              <label class="field">
                <span>{{ t('page.workflows.branchField') }}</span>
                <input :value="selectedEdge.branch ?? t('common.none')" class="input" type="text" readonly />
              </label>
              <label class="field">
                <span>{{ t('page.workflows.edgeMetadata') }}</span>
                <textarea :value="edgeMetadataText" class="textarea code-textarea" rows="9" @input="updateEdgeMetadata(($event.target as HTMLTextAreaElement).value)"></textarea>
                <small v-if="edgeMetadataError" class="field-error">{{ edgeMetadataError }}</small>
              </label>
            </template>

            <template v-else>
              <div class="side-section-header">
                <h3>{{ t('page.workflows.workflowDetails') }}</h3>
                <p>{{ t('page.workflows.emptySelection') }}</p>
              </div>

              <label class="field">
                <span>{{ t('common.name') }}</span>
                <input v-model="editForm.name" class="input" type="text" :placeholder="t('page.workflows.namePlaceholder')" />
              </label>
              <label class="field">
                <span>{{ t('common.description') }}</span>
                <textarea v-model="editForm.description" class="textarea" rows="4" :placeholder="t('page.workflows.descriptionPlaceholder')"></textarea>
              </label>
              <div class="detail-form-grid">
                <label class="field">
                  <span>{{ t('page.workflows.version') }}</span>
                  <input v-model.number="editForm.version" class="input" type="number" min="1" />
                </label>
                <label class="toggle-row">
                  <input v-model="editForm.enabled" type="checkbox" />
                  <span>{{ t('page.workflows.enabled') }}</span>
                </label>
              </div>

              <div class="workflow-metrics">
                <div>
                  <CircleDot :size="16" />
                  <span>{{ nodeCount }} {{ t('page.workflows.nodes') }}</span>
                </div>
                <div>
                  <GitBranch :size="16" />
                  <span>{{ edgeCount }} {{ t('page.workflows.edges') }}</span>
                </div>
                <div>
                  <CheckCircle2 :size="16" />
                  <span>{{ activeRunCount }} {{ t('page.workflows.activeRuns') }}</span>
                </div>
              </div>
            </template>
          </div>

          <div v-else class="side-panel-scroll scrollbar">
            <div class="side-section-header">
              <h3>{{ t('page.workflows.runTitle') }}</h3>
              <p>{{ t('page.workflows.runHint') }}</p>
            </div>

            <div v-if="hasUnsavedChanges || blockingGraphIssues.length > 0" class="run-lock">
              <span v-if="hasUnsavedChanges">{{ t('page.workflows.saveBeforeRun') }}</span>
              <span v-else>{{ blockingGraphIssues[0]?.message }}</span>
            </div>

            <label class="field">
              <span>{{ t('page.workflows.triggerPayload') }}</span>
              <textarea v-model="runPayloadText" class="textarea code-textarea" rows="7"></textarea>
              <small v-if="runPayloadError" class="field-error">{{ runPayloadError }}</small>
            </label>

            <div class="run-actions">
              <button class="btn btn-primary btn-sm" :disabled="!canRunWorkflow" @click="runWorkflow">
                <Play :size="16" />
                {{ t('page.workflows.runNow') }}
              </button>
              <button class="btn btn-secondary btn-sm" :disabled="!activeWorkflow || refreshingRuns" @click="activeWorkflowId && loadRuns(activeWorkflowId)">
                <RefreshCw :size="16" />
                {{ t('page.workflows.refreshRuns') }}
              </button>
            </div>

            <div v-if="runs.length === 0" class="empty-state compact">
              <p>{{ t('page.workflows.noRuns') }}</p>
            </div>

            <div v-else class="run-stack">
              <button
                v-for="run in runs"
                :key="run.id"
                :class="['run-item', { active: run.id === selectedRunId }]"
                @click="selectedRunId = run.id"
              >
                <span :class="['status-badge', statusTone(run.status)]">{{ statusLabel(run.status) }}</span>
                <span class="run-time">{{ formatDate(run.startedAt ?? run.createdAt) }}</span>
                <button
                  v-if="['queued', 'running', 'waiting'].includes(run.status)"
                  class="icon-btn"
                  :title="t('page.workflows.cancelRun')"
                  @click.stop="cancelRun(run.id)"
                >
                  <Square :size="14" />
                </button>
              </button>
            </div>

            <div v-if="selectedRun" class="run-detail">
              <div class="detail-grid">
                <div>
                  <span>{{ t('page.workflows.status') }}</span>
                  <strong>{{ statusLabel(selectedRun.status) }}</strong>
                </div>
                <div>
                  <span>{{ t('page.workflows.triggerSource') }}</span>
                  <strong>{{ selectedRun.triggerSource }}</strong>
                </div>
                <div>
                  <span>{{ t('page.workflows.startedAt') }}</span>
                  <strong>{{ formatDate(selectedRun.startedAt) }}</strong>
                </div>
                <div>
                  <span>{{ t('page.workflows.finishedAt') }}</span>
                  <strong>{{ formatDate(selectedRun.finishedAt) }}</strong>
                </div>
              </div>

              <div class="payload-block">
                <h4>{{ t('page.workflows.triggerPayload') }}</h4>
                <pre>{{ stringifyValue(selectedRun.triggerPayload) }}</pre>
              </div>

              <div class="payload-block" v-if="selectedRun.error">
                <h4>{{ t('page.workflows.error') }}</h4>
                <pre>{{ selectedRun.error }}</pre>
              </div>

              <div class="node-states">
                <h4>{{ t('page.workflows.nodeStates') }}</h4>
                <button
                  v-for="nodeState in Object.values(selectedRun.nodeStates)"
                  :key="nodeState.nodeId"
                  :class="['node-state-row', { active: nodeState.nodeId === selectedNodeId }]"
                  @click="handleNodeClick(nodeState.nodeId)"
                >
                  <span>{{ nodeState.nodeId }}</span>
                  <span :class="['status-badge', statusTone(nodeState.status)]">{{ statusLabel(nodeState.status) }}</span>
                </button>
              </div>

              <div v-if="selectedNodeState" class="node-state-detail">
                <div class="payload-block">
                  <h4>{{ t('page.workflows.nodeInput') }}</h4>
                  <pre>{{ stringifyValue(selectedNodeState.input) }}</pre>
                </div>
                <div class="payload-block">
                  <h4>{{ t('page.workflows.nodeOutput') }}</h4>
                  <pre>{{ stringifyValue(selectedNodeState.output) }}</pre>
                </div>
                <div class="payload-block" v-if="selectedNodeState.error">
                  <h4>{{ t('page.workflows.error') }}</h4>
                  <pre>{{ selectedNodeState.error }}</pre>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>

    <Transition name="modal">
      <div v-if="confirmDialog.open" class="modal-overlay" @click.self="resolveConfirmDialog(false)">
        <div class="modal workflow-confirm-modal">
          <div class="modal-header">
            <h2 class="modal-title">{{ confirmDialog.title }}</h2>
          </div>
          <div class="modal-body">
            <p class="confirm-message">{{ confirmDialog.message }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" @click="resolveConfirmDialog(false)">
              {{ confirmDialog.cancelLabel }}
            </button>
            <button
              :class="['btn', confirmDialog.tone === 'danger' ? 'btn-danger' : 'btn-primary']"
              type="button"
              @click="resolveConfirmDialog(true)"
            >
              {{ confirmDialog.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workflows-view {
  --workflow-sidebar-width: 18rem;
  --workflow-side-panel-width: 23rem;
  --workflow-topbar-height: 5.25rem;
  --workflow-border-width: 0.0625rem;
  --workflow-canvas-min-height: 42rem;
  --workflow-node-width: 14rem;
  --workflow-canvas-grid: color-mix(in srgb, var(--text-secondary) 28%, transparent);
  display: grid;
  grid-template-columns: var(--workflow-sidebar-width) minmax(0, 1fr);
  gap: var(--spacing-5);
  min-height: calc(100vh - var(--header-height) - var(--spacing-8));
}

.workflow-list-panel,
.workflow-designer,
.canvas-panel,
.workflow-side-panel {
  min-width: 0;
}

.workflow-list-panel,
.workflow-topbar,
.canvas-panel,
.workflow-side-panel,
.node-palette {
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.workflow-list-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workflow-list-header,
.workflow-topbar,
.canvas-header,
.side-section-header,
.run-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-4);
}

.workflow-list-header {
  padding: var(--spacing-4);
  border-bottom: var(--workflow-border-width) solid var(--border-color);
}

.workflow-list-header h3,
.canvas-header h3,
.side-section-header h3,
.workflow-title-block h2,
.payload-block h4,
.node-states h4 {
  margin: 0;
}

.workflow-list-header p,
.canvas-header p,
.side-section-header p,
.workflow-title-block p {
  margin: var(--spacing-1) 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.workflow-title-block p {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3);
}

.unsaved-pill {
  color: var(--status-warning);
}

.workflow-quality-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 3rem;
  padding: var(--spacing-2) var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  overflow-x: auto;
}

.quality-issue {
  min-width: 0;
  overflow: hidden;
  padding: var(--spacing-2) var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-issue.error {
  border-color: color-mix(in srgb, var(--status-error) 42%, transparent);
}

.quality-issue.warning {
  border-color: color-mix(in srgb, var(--status-warning) 42%, transparent);
}

.quality-more {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.workflow-list,
.side-panel-scroll {
  min-height: 0;
  overflow: auto;
}

.workflow-item,
.run-item,
.node-state-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.workflow-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-2) var(--spacing-3);
  padding: var(--spacing-4);
  border-bottom: var(--workflow-border-width) solid var(--border-color);
}

.workflow-item:hover,
.workflow-item.active,
.run-item:hover,
.run-item.active,
.node-state-row:hover,
.node-state-row.active,
.side-tabs button:hover,
.side-tabs button.active,
.palette-button:hover {
  background: var(--bg-hover);
}

.workflow-item.active,
.run-item.active,
.node-state-row.active,
.side-tabs button.active {
  box-shadow: inset var(--spacing-1) 0 0 var(--accent-primary);
}

.workflow-item-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-item-meta {
  grid-column: 1;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.workflow-item .status-badge {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
}

.workflow-designer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5);
  min-height: 0;
}

.workflow-topbar {
  min-height: var(--workflow-topbar-height);
  padding: var(--spacing-4) var(--spacing-5);
}

.workflow-title-block {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--spacing-3);
}

.workflow-title-block h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: var(--spacing-3);
  height: var(--spacing-3);
  flex: 0 0 auto;
  border-radius: var(--radius-sm);
  background: var(--text-muted);
}

.status-dot.enabled {
  background: var(--status-success);
}

.status-dot.disabled {
  background: var(--status-disconnected);
}

.workflow-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--spacing-2);
}

.loading-state,
.empty-state,
.canvas-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.loading-state {
  flex: 1;
  min-height: var(--workflow-canvas-min-height);
}

.empty-state {
  flex-direction: column;
  gap: var(--spacing-2);
  min-height: 12rem;
  padding: var(--spacing-5);
  text-align: center;
}

.empty-state.compact {
  min-height: 5rem;
  padding: var(--spacing-3);
}

.workflow-workspace {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) var(--workflow-side-panel-width);
  gap: var(--spacing-4);
  min-height: var(--workflow-canvas-min-height);
}

.node-palette {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  align-self: start;
  padding: var(--spacing-2);
}

.palette-button,
.side-tabs button,
.icon-btn {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.palette-button {
  width: 5rem;
  min-height: 4rem;
  flex-direction: column;
  justify-content: center;
  gap: var(--spacing-2);
  border-radius: var(--radius-sm);
}

.palette-button span {
  font-size: var(--font-size-xs);
}

.palette-button.template {
  min-height: 4.5rem;
}

.palette-divider {
  width: 100%;
  height: var(--workflow-border-width);
  margin: var(--spacing-1) 0;
  background: var(--border-color);
}

.canvas-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.canvas-header {
  padding: var(--spacing-4);
  border-bottom: var(--workflow-border-width) solid var(--border-color);
}

.canvas-shell {
  position: relative;
  flex: 1;
  min-height: var(--workflow-canvas-min-height);
  overflow: hidden;
  background: var(--bg-secondary);
}

.workflow-canvas {
  width: 100%;
  height: 100%;
}

.canvas-empty {
  position: absolute;
  inset: 0;
  flex-direction: column;
  gap: var(--spacing-2);
  pointer-events: none;
}

.workflow-side-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.side-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: var(--workflow-border-width) solid var(--border-color);
}

.side-tabs button {
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
}

.side-panel-scroll {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding: var(--spacing-4);
}

.side-section-header {
  align-items: flex-start;
}

.side-section-header p {
  word-break: break-word;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.field span,
.toggle-row,
.detail-grid span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.input,
.textarea {
  width: 100%;
}

.code-textarea,
.payload-block pre {
  font-family: var(--font-mono);
}

.field-error {
  color: var(--status-error);
  font-size: var(--font-size-xs);
}

.field-hint {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 2.75rem;
}

.toggle-row.compact {
  min-height: 2.25rem;
}

.tool-parameter-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}

.tool-parameter-title {
  color: var(--text-primary);
  font-weight: 600;
}

.tool-parameter-field {
  padding-top: var(--spacing-3);
  border-top: var(--workflow-border-width) solid var(--border-color);
}

.tool-parameter-field:first-of-type {
  padding-top: 0;
  border-top: none;
}

.tool-parameter-label {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
}

.tool-parameter-label b {
  color: var(--status-warning);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.detail-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-3);
  align-items: end;
}

.workflow-metrics,
.selection-status,
.detail-grid,
.run-stack,
.run-detail,
.node-states,
.node-state-detail {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.workflow-metrics {
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}

.workflow-metrics div,
.selection-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.run-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.run-lock {
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid color-mix(in srgb, var(--status-warning) 40%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--status-warning) 12%, transparent);
  color: var(--status-warning);
  font-size: var(--font-size-sm);
}

.run-stack {
  gap: var(--spacing-2);
}

.run-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
}

.run-time {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-grid div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--spacing-1);
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
}

.detail-grid strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.payload-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.payload-block pre {
  max-height: 16rem;
  margin: 0;
  overflow: auto;
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.node-state-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
}

.node-state-row span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge,
.node-status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  line-height: 1;
}

.status-badge.success,
.node-status-pill.success {
  background: color-mix(in srgb, var(--status-success) 18%, transparent);
  color: var(--status-success);
}

.status-badge.danger,
.node-status-pill.danger {
  background: color-mix(in srgb, var(--status-error) 18%, transparent);
  color: var(--status-error);
}

.status-badge.info,
.node-status-pill.info {
  background: var(--accent-primary-bg);
  color: var(--accent-primary);
}

.status-badge.muted,
.node-status-pill.muted {
  background: var(--badge-muted-bg);
  color: var(--text-secondary);
}

.icon-btn {
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-sm);
}

.workflow-node {
  position: relative;
  width: var(--workflow-node-width);
  padding: var(--spacing-3);
  border: var(--workflow-border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.workflow-node.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 var(--workflow-border-width) var(--accent-border), var(--shadow-sm);
}

.workflow-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
}

.workflow-node-type,
.workflow-node-id,
.workflow-branch-label {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.workflow-node-label {
  margin-top: var(--spacing-2);
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-node-id {
  margin-top: var(--spacing-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-node--status-pending {
  border-color: var(--text-muted);
}

.workflow-node--status-running,
.workflow-node--status-waiting,
.workflow-node--status-queued {
  border-color: var(--accent-primary);
}

.workflow-node--status-succeeded {
  border-color: var(--status-success);
}

.workflow-node--status-failed,
.workflow-node--status-cancelled {
  border-color: var(--status-error);
}

.workflow-handle {
  width: 0.75rem;
  height: 0.75rem;
  border: var(--workflow-border-width) solid var(--bg-primary);
  background: var(--text-secondary);
}

.workflow-handle-true {
  background: var(--status-success);
}

.workflow-handle-false {
  background: var(--status-error);
}

.workflow-branch-label {
  position: absolute;
  right: var(--spacing-5);
}

.workflow-branch-label-true {
  top: 25%;
}

.workflow-branch-label-false {
  top: 58%;
}

.workflow-confirm-modal {
  max-width: 28rem;
}

.confirm-message {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
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

@media (max-width: 1400px) {
  .workflows-view {
    grid-template-columns: 1fr;
  }

  .workflow-list-panel {
    min-height: 18rem;
  }
}

@media (max-width: 1180px) {
  .workflow-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .node-palette {
    flex-direction: row;
    overflow-x: auto;
  }

  .palette-divider {
    width: var(--workflow-border-width);
    height: auto;
    margin: 0 var(--spacing-1);
  }

  .palette-button {
    min-width: 5rem;
  }

  .workflow-side-panel {
    min-height: 34rem;
  }
}

@media (max-width: 760px) {
  .workflow-topbar,
  .workflow-list-header,
  .canvas-header {
    align-items: stretch;
    flex-direction: column;
  }

  .workflow-actions,
  .run-actions {
    justify-content: stretch;
  }

  .workflow-actions .btn,
  .run-actions .btn {
    flex: 1;
  }

  .detail-grid,
  .detail-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
