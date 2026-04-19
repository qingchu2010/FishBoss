import { del, get, post } from './http'

export interface WorkflowStep {
  id: string
  name: string
  type: 'agent' | 'tool' | 'condition' | 'loop'
  config: Record<string, unknown>
  next?: string[]
}

export interface Workflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export const workflowsApi = {
  async list(): Promise<Workflow[]> {
    const response = await get<{ workflows: Workflow[] }>('/workflows')
    return response.workflows
  },

  async create(data: Pick<Workflow, 'name' | 'description' | 'steps' | 'enabled'>): Promise<Workflow> {
    const response = await post<{ workflow: Workflow }>('/workflows', data)
    return response.workflow
  },

  async update(id: string, data: Partial<Pick<Workflow, 'name' | 'description' | 'steps' | 'enabled'>>): Promise<Workflow> {
    const response = await post<{ workflow: Workflow }>(`/workflows/${id}`, data, 'PATCH')
    return response.workflow
  },

  async remove(id: string): Promise<void> {
    await del(`/workflows/${id}`)
  },

  async execute(id: string, input: Record<string, unknown>) {
    const response = await post<{ execution: Record<string, unknown> }>(`/workflows/${id}/execute`, { input })
    return response.execution
  }
}
