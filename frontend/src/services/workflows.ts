import type { Connection, Edge as FlowEdge, Node as FlowNode } from '@vue-flow/core'
import { del, get, post } from './http'

export type WorkflowNodeType = 'start' | 'agent' | 'tool' | 'condition' | 'databaseWrite' | 'end'
export type WorkflowRunStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
export type WorkflowNodeStatus = 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'platformMessage' | 'api'
  config?: Record<string, unknown>
}

export interface WorkflowNodePosition {
  x: number
  y: number
}

export interface WorkflowEdge {
  id?: string
  from: string
  to: string
  fromHandle?: string
  toHandle?: string
  branch?: string
  label?: string
  metadata?: Record<string, unknown>
}

export interface WorkflowNode {
  id: string
  name: string
  type: WorkflowNodeType
  config: Record<string, unknown>
  position?: WorkflowNodePosition
}

export interface Workflow {
  id: string
  name: string
  description: string
  version: number
  enabled: boolean
  trigger: WorkflowTrigger
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkflowNodeState {
  nodeId: string
  status: WorkflowNodeStatus
  input?: unknown
  output?: unknown
  error?: string
  attempt: number
  startedAt?: string
  finishedAt?: string
}

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowVersion: number
  status: WorkflowRunStatus
  triggerSource: 'manual' | 'schedule' | 'chat-console' | 'qq' | 'onebot' | 'api'
  triggerPayload: Record<string, unknown>
  context: Record<string, unknown>
  nodeStates: Record<string, WorkflowNodeState>
  result?: unknown
  error?: string
  startedAt?: string
  finishedAt?: string
  updatedAt: string
  createdAt: string
}

export interface WorkflowCanvasNodeData {
  label: string
  nodeType: WorkflowNodeType
  status?: WorkflowNodeStatus
}

export interface WorkflowCanvasEdgeData {
  label?: string
  branch?: string
}

export type WorkflowCanvasNode = FlowNode<WorkflowCanvasNodeData>
export type WorkflowCanvasEdge = FlowEdge<WorkflowCanvasEdgeData>

export interface WorkflowCanvasState {
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
}

function defaultNodePosition(index: number): WorkflowNodePosition {
  return {
    x: 120 + (index % 4) * 260,
    y: 120 + Math.floor(index / 4) * 180,
  }
}

export function createWorkflowNodeId(type: WorkflowNodeType): string {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createWorkflowEdgeId(edge: Pick<WorkflowEdge, 'from' | 'to' | 'fromHandle' | 'toHandle' | 'branch'>): string {
  return [
    edge.from,
    edge.fromHandle ?? edge.branch ?? 'default',
    edge.toHandle ?? 'default',
    edge.to,
  ].join('::')
}

export function normalizeWorkflowEdge(edge: WorkflowEdge): WorkflowEdge {
  const branch = edge.branch ?? (edge.fromHandle === 'true' || edge.fromHandle === 'false' ? edge.fromHandle : undefined)
  return {
    ...edge,
    branch,
    id: edge.id ?? createWorkflowEdgeId({
      from: edge.from,
      to: edge.to,
      fromHandle: edge.fromHandle,
      toHandle: edge.toHandle,
      branch,
    }),
  }
}

export function normalizeWorkflowNode(node: WorkflowNode, index: number): WorkflowNode {
  return {
    ...node,
    position: node.position ?? defaultNodePosition(index),
  }
}

export function normalizeWorkflowDefinition(workflow: Workflow): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node, index) => normalizeWorkflowNode(node, index)),
    edges: workflow.edges.map((edge) => normalizeWorkflowEdge(edge)),
  }
}

export function createWorkflowNode(type: WorkflowNodeType, index: number): WorkflowNode {
  const baseConfig =
    type === 'condition'
      ? { operator: 'equals' }
      : type === 'tool'
        ? { input: {} }
        : type === 'databaseWrite'
          ? { target: 'reference', content: {} }
          : {}

  return {
    id: createWorkflowNodeId(type),
    name: type,
    type,
    config: baseConfig,
    position: defaultNodePosition(index),
  }
}

export function buildWorkflowEdge(connection: Connection): WorkflowEdge {
  const fromHandle = connection.sourceHandle ?? undefined
  const toHandle = connection.targetHandle ?? undefined
  const branch = fromHandle === 'true' || fromHandle === 'false' ? fromHandle : undefined
  return normalizeWorkflowEdge({
    from: connection.source,
    to: connection.target,
    fromHandle,
    toHandle,
    branch,
    label: branch,
  })
}

export function workflowToCanvas(workflow: Workflow, run?: WorkflowRun | null): WorkflowCanvasState {
  const normalized = normalizeWorkflowDefinition(workflow)
  return {
    nodes: normalized.nodes.map((node) => ({
      id: node.id,
      type: 'workflowNode',
      position: node.position ?? { x: 0, y: 0 },
      data: {
        label: node.name,
        nodeType: node.type,
        status: run?.nodeStates[node.id]?.status,
      },
      draggable: true,
      selectable: true,
    })),
    edges: normalized.edges.map((edge) => ({
      id: edge.id ?? createWorkflowEdgeId(edge),
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.fromHandle,
      targetHandle: edge.toHandle,
      label: edge.label ?? edge.branch,
      data: {
        label: edge.label,
        branch: edge.branch,
      },
      selectable: true,
      deletable: true,
    })),
  }
}

export function canvasToWorkflow(
  workflow: Workflow,
  canvasNodes: WorkflowCanvasNode[],
  canvasEdges: WorkflowCanvasEdge[],
): Pick<Workflow, 'nodes' | 'edges'> {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]))
  const edgeById = new Map(workflow.edges.map((edge) => [edge.id ?? createWorkflowEdgeId(edge), edge]))

  const nodes = canvasNodes.map((node, index) => {
    const existing = nodeById.get(node.id)
    const data = node.data ?? {
      label: existing?.name ?? node.id,
      nodeType: existing?.type ?? 'tool',
    }
    return normalizeWorkflowNode(
      {
        id: node.id,
        name: existing?.name ?? data.label,
        type: existing?.type ?? data.nodeType,
        config: existing?.config ?? {},
        position: {
          x: node.position.x,
          y: node.position.y,
        },
      },
      index,
    )
  })

  const edges = canvasEdges.map((edge) => {
    const existing = edgeById.get(edge.id)
    return normalizeWorkflowEdge({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      fromHandle: edge.sourceHandle ?? undefined,
      toHandle: edge.targetHandle ?? undefined,
      branch: edge.data?.branch ?? (edge.sourceHandle === 'true' || edge.sourceHandle === 'false' ? edge.sourceHandle : undefined),
      label: typeof edge.label === 'string' ? edge.label : edge.data?.label,
      metadata: existing?.metadata,
    })
  })

  return { nodes, edges }
}

export const workflowsApi = {
  async list(): Promise<Workflow[]> {
    const response = await get<{ workflows: Workflow[] }>('/workflows')
    return response.workflows.map(normalizeWorkflowDefinition)
  },

  async get(id: string): Promise<Workflow> {
    const response = await get<{ workflow: Workflow }>(`/workflows/${id}`)
    return normalizeWorkflowDefinition(response.workflow)
  },

  async create(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Workflow> {
    const response = await post<{ workflow: Workflow }>('/workflows', data)
    return normalizeWorkflowDefinition(response.workflow)
  },

  async update(id: string, data: Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Workflow> {
    const response = await post<{ workflow: Workflow }>(`/workflows/${id}`, data, 'PATCH')
    return normalizeWorkflowDefinition(response.workflow)
  },

  async remove(id: string): Promise<void> {
    await del(`/workflows/${id}`)
  },

  async run(id: string, triggerPayload: Record<string, unknown>): Promise<WorkflowRun> {
    const response = await post<{ run: WorkflowRun }>(`/workflows/${id}/run`, { triggerPayload, triggerSource: 'manual' })
    return response.run
  },

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ''
    const response = await get<{ runs: WorkflowRun[] }>(`/workflows/runs${query}`)
    return response.runs
  },

  async getRun(runId: string): Promise<WorkflowRun> {
    const response = await get<{ run: WorkflowRun }>(`/workflows/runs/${runId}`)
    return response.run
  },

  async cancelRun(runId: string): Promise<WorkflowRun> {
    const response = await post<{ run: WorkflowRun }>(`/workflows/runs/${runId}/cancel`, {})
    return response.run
  }
}
