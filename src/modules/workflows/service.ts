import { AgentRepository } from '../../server/domains/agents/repository.js';
import { BadRequestError, NotFoundError } from '../../server/errors/index.js';
import { getToolRegistry } from '../../server/domains/tools/index.js';
import { ToolCallSchema } from '../../server/domains/tools/types.js';
import { DatabaseService } from '../database/service.js';
import { createLLMClient, detectProtocol, type ProtocolType } from '../providers/protocols/index.js';
import { decryptProviderApiKey } from '../providers/schema.js';
import { ProviderRepository } from '../providers/repository.js';
import {
  CreateWorkflowDefinitionInputSchema,
  RunWorkflowInputSchema,
  UpdateWorkflowDefinitionInputSchema,
  WorkflowNodeStateSchema,
  WorkflowRunListQuerySchema,
  WorkflowRunSchema,
  type WorkflowDefinition,
  type WorkflowNodeDefinition,
  type WorkflowNodeState,
  type WorkflowRun,
} from './schema.js';
import {
  WorkflowDefinitionRepository,
  WorkflowRunRepository,
} from './repository.js';
import { generateId } from '../../utils/string.js';
import { getLogger } from '../../server/logging/index.js';

const logger = getLogger();

type WorkflowExecutionData = {
  context: Record<string, unknown>;
  nodeOutputs: Map<string, unknown>;
};

export class WorkflowService {
  private readonly definitionRepository: WorkflowDefinitionRepository;
  private readonly runRepository: WorkflowRunRepository;
  private readonly databaseService: DatabaseService;
  private readonly providerRepository: ProviderRepository;
  private readonly agentRepository: AgentRepository;
  private readonly activeRunTasks = new Map<string, Promise<void>>();

  constructor(
    definitionRepository?: WorkflowDefinitionRepository,
    runRepository?: WorkflowRunRepository,
    databaseService?: DatabaseService,
    providerRepository?: ProviderRepository,
    agentRepository?: AgentRepository,
  ) {
    this.definitionRepository = definitionRepository ?? new WorkflowDefinitionRepository();
    this.runRepository = runRepository ?? new WorkflowRunRepository();
    this.databaseService = databaseService ?? new DatabaseService();
    this.providerRepository = providerRepository ?? new ProviderRepository();
    this.agentRepository = agentRepository ?? new AgentRepository();
  }

  async list(): Promise<WorkflowDefinition[]> {
    return this.definitionRepository.listDefinitions();
  }

  async get(id: string): Promise<WorkflowDefinition | null> {
    return this.definitionRepository.getDefinition(id);
  }

  async create(data: unknown): Promise<WorkflowDefinition> {
    const parsed = CreateWorkflowDefinitionInputSchema.parse(data);
    return this.definitionRepository.createDefinition(parsed);
  }

  async update(id: string, data: unknown): Promise<WorkflowDefinition | null> {
    const parsed = UpdateWorkflowDefinitionInputSchema.parse(data);
    return this.definitionRepository.updateDefinition(id, parsed);
  }

  async delete(id: string): Promise<boolean> {
    return this.definitionRepository.deleteDefinition(id);
  }

  async run(id: string, input: unknown): Promise<WorkflowRun> {
    const parsed = RunWorkflowInputSchema.parse(input);
    const workflow = await this.definitionRepository.getDefinition(id);
    if (!workflow) {
      throw new NotFoundError('workflow');
    }
    if (!workflow.enabled) {
      throw new BadRequestError(`Workflow is disabled: ${id}`);
    }

    const now = new Date().toISOString();
    const run = WorkflowRunSchema.parse({
      id: generateId(),
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      status: 'queued',
      triggerSource: parsed.triggerSource,
      triggerPayload: parsed.triggerPayload,
      context: {
        variables: workflow.variables,
        triggerPayload: parsed.triggerPayload,
      },
      nodeStates: this.initializeRunState(workflow),
      createdAt: now,
      updatedAt: now,
    });

    const createdRun = await this.runRepository.createRun(run);
    this.startRunTask(workflow, createdRun);
    return createdRun;
  }

  async listRuns(query?: unknown): Promise<WorkflowRun[]> {
    const parsed = WorkflowRunListQuerySchema.parse(query ?? {});
    return this.runRepository.listRuns(parsed);
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    return this.runRepository.getRun(runId);
  }

  async cancelRun(runId: string): Promise<WorkflowRun | null> {
    const run = await this.runRepository.getRun(runId);
    if (!run) {
      return null;
    }
    if (!['queued', 'running', 'waiting'].includes(run.status)) {
      return run;
    }
    const cancelledRun = await this.markRunCancelled(runId);
    const task = this.activeRunTasks.get(runId);
    if (task) {
      await task;
    }
    return (await this.runRepository.getRun(runId)) ?? cancelledRun;
  }

  private startRunTask(workflow: WorkflowDefinition, run: WorkflowRun): void {
    const task = this.executeRun(workflow, run).catch((error: unknown) => {
      logger.error('Workflow run execution failed', error, {
        workflowId: workflow.id,
        runId: run.id,
      });
    });
    this.activeRunTasks.set(run.id, task);
    void task.finally(() => {
      if (this.activeRunTasks.get(run.id) === task) {
        this.activeRunTasks.delete(run.id);
      }
    });
  }

  async waitForRunIdle(runId: string): Promise<void> {
    const task = this.activeRunTasks.get(runId);
    if (task) {
      await task;
    }
  }

  async waitForAllRunsIdle(): Promise<void> {
    await Promise.all([...this.activeRunTasks.values()]);
  }

  private isTerminalRunStatus(status: WorkflowRun['status']): boolean {
    return ['succeeded', 'failed', 'cancelled'].includes(status);
  }

  private cancelRunningNodeStates(
    nodeStates: Record<string, WorkflowNodeState>,
    finishedAt: string,
  ): Record<string, WorkflowNodeState> {
    return Object.fromEntries(
      Object.entries(nodeStates).map(([nodeId, nodeState]) => {
        if (!['running', 'waiting'].includes(nodeState.status)) {
          return [nodeId, nodeState];
        }
        return [
          nodeId,
          WorkflowNodeStateSchema.parse({
            ...nodeState,
            nodeId,
            status: 'cancelled',
            error: undefined,
            finishedAt,
          }),
        ];
      }),
    );
  }

  private async markRunCancelled(runId: string): Promise<WorkflowRun | null> {
    return this.runRepository.updateRunIf(
      runId,
      (currentRun) => !this.isTerminalRunStatus(currentRun.status),
      (currentRun) => {
        const finishedAt = new Date().toISOString();
        return {
          status: 'cancelled',
          error: undefined,
          nodeStates: this.cancelRunningNodeStates(currentRun.nodeStates, finishedAt),
          finishedAt,
          updatedAt: finishedAt,
        };
      },
    );
  }

  private initializeRunState(workflow: WorkflowDefinition): Record<string, WorkflowNodeState> {
    return Object.fromEntries(
      workflow.nodes.map((node) => [
        node.id,
        WorkflowNodeStateSchema.parse({
          nodeId: node.id,
          status: 'pending',
          attempt: 0,
        }),
      ]),
    );
  }

  private async executeRun(workflow: WorkflowDefinition, initialRun: WorkflowRun): Promise<void> {
    let run = await this.markRunStatus(initialRun.id, 'running', {
      startedAt: new Date().toISOString(),
      error: undefined,
    });
    if (!run) {
      return;
    }

    const executionData: WorkflowExecutionData = {
      context: {
        ...run.context,
      },
      nodeOutputs: new Map<string, unknown>(),
    };

    try {
      const startNode = workflow.nodes.find((node) => node.type === 'start');
      if (!startNode) {
        throw new BadRequestError('Workflow must contain a start node');
      }

      let currentNodeId: string | null = startNode.id;
      while (currentNodeId) {
        run = await this.assertNotCancelled(initialRun.id);
        const node = workflow.nodes.find((item) => item.id === currentNodeId);
        if (!node) {
          throw new BadRequestError(`Node not found: ${currentNodeId}`);
        }

        executionData.context.currentNodeId = node.id;
        const nodeInput = this.buildNodeInput(node, run, executionData);
        run = await this.markNodeRunning(run.id, node.id, nodeInput);
        const nodeOutput = await this.executeNode(workflow, node, run, executionData);
        executionData.nodeOutputs.set(node.id, nodeOutput);
        executionData.context.lastNodeId = node.id;
        executionData.context.lastNodeOutput = nodeOutput;
        delete executionData.context.currentNodeId;
        run = await this.markNodeSucceeded(run.id, node.id, nodeOutput, executionData.context);

        if (node.type === 'end') {
          await this.markRunStatus(run.id, 'succeeded', {
            result: nodeOutput,
            context: executionData.context,
            finishedAt: new Date().toISOString(),
            error: undefined,
          });
          return;
        }

        currentNodeId = this.resolveNextNodeId(workflow, node, nodeOutput);
      }

      await this.markRunStatus(run.id, 'succeeded', {
        result: executionData.context.lastNodeOutput,
        context: executionData.context,
        finishedAt: new Date().toISOString(),
        error: undefined,
      });
    } catch (error) {
      const latestRun = await this.runRepository.getRun(initialRun.id);
      if (latestRun?.status === 'cancelled') {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const failedNodeId =
        typeof executionData.context.currentNodeId === 'string'
          ? executionData.context.currentNodeId
          : null;
      const nodeStates =
        failedNodeId && latestRun?.nodeStates?.[failedNodeId]?.status === 'running'
          ? {
              ...latestRun.nodeStates,
              [failedNodeId]: WorkflowNodeStateSchema.parse({
                ...latestRun.nodeStates[failedNodeId],
                nodeId: failedNodeId,
                status: 'failed',
                error: message,
                finishedAt: new Date().toISOString(),
              }),
            }
          : latestRun?.nodeStates;
      delete executionData.context.currentNodeId;
      await this.markRunStatus(initialRun.id, 'failed', {
        error: message,
        context: latestRun?.context ?? executionData.context,
        nodeStates,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  private async assertNotCancelled(runId: string): Promise<WorkflowRun> {
    const run = await this.runRepository.getRun(runId);
    if (!run) {
      throw new NotFoundError('workflow run');
    }
    if (run.status === 'cancelled') {
      throw new BadRequestError(`Workflow run cancelled: ${runId}`);
    }
    return run;
  }

  private buildNodeInput(
    node: WorkflowNodeDefinition,
    run: WorkflowRun,
    executionData: WorkflowExecutionData,
  ): Record<string, unknown> {
    return {
      nodeId: node.id,
      nodeType: node.type,
      workflowId: run.workflowId,
      runId: run.id,
      triggerPayload: run.triggerPayload,
      context: executionData.context,
      previousNodeOutput: executionData.context.lastNodeOutput,
      nodeOutputs: Object.fromEntries(executionData.nodeOutputs.entries()),
      config: node.config,
    };
  }

  private async markRunStatus(
    runId: string,
    status: WorkflowRun['status'],
    patch: Partial<WorkflowRun> = {},
  ): Promise<WorkflowRun | null> {
    return this.runRepository.updateRunIf(
      runId,
      (run) => !this.isTerminalRunStatus(run.status) || run.status === status,
      {
        ...patch,
        status,
        updatedAt: new Date().toISOString(),
      },
    );
  }

  private async markNodeRunning(
    runId: string,
    nodeId: string,
    input: unknown,
  ): Promise<WorkflowRun> {
    const updated = await this.runRepository.updateRunIf(
      runId,
      (run) => !this.isTerminalRunStatus(run.status),
      (run) => {
        const currentState = run.nodeStates[nodeId];
        const nextState = WorkflowNodeStateSchema.parse({
          ...currentState,
          nodeId,
          status: 'running',
          input,
          attempt: (currentState?.attempt ?? 0) + 1,
          startedAt: new Date().toISOString(),
          finishedAt: undefined,
          error: undefined,
        });
        return {
          nodeStates: {
            ...run.nodeStates,
            [nodeId]: nextState,
          },
        };
      },
    );
    return this.requireUpdatedActiveRun(runId, updated);
  }

  private async markNodeSucceeded(
    runId: string,
    nodeId: string,
    output: unknown,
    context: Record<string, unknown>,
  ): Promise<WorkflowRun> {
    const updated = await this.runRepository.updateRunIf(
      runId,
      (run) => !this.isTerminalRunStatus(run.status),
      (run) => {
        const currentState = run.nodeStates[nodeId];
        const nextState = WorkflowNodeStateSchema.parse({
          ...currentState,
          nodeId,
          status: 'succeeded',
          output,
          error: undefined,
          finishedAt: new Date().toISOString(),
        });
        return {
          context,
          nodeStates: {
            ...run.nodeStates,
            [nodeId]: nextState,
          },
        };
      },
    );
    return this.requireUpdatedActiveRun(runId, updated);
  }

  private async markNodeFailed(
    runId: string,
    nodeId: string,
    message: string,
    context: Record<string, unknown>,
  ): Promise<WorkflowRun> {
    const updated = await this.runRepository.updateRunIf(
      runId,
      (run) => !this.isTerminalRunStatus(run.status),
      (run) => {
        const currentState = run.nodeStates[nodeId];
        const nextState = WorkflowNodeStateSchema.parse({
          ...currentState,
          nodeId,
          status: 'failed',
          error: message,
          finishedAt: new Date().toISOString(),
        });
        return {
          context,
          error: message,
          nodeStates: {
            ...run.nodeStates,
            [nodeId]: nextState,
          },
        };
      },
    );
    return this.requireUpdatedActiveRun(runId, updated);
  }

  private async requireRun(runId: string): Promise<WorkflowRun> {
    const run = await this.runRepository.getRun(runId);
    if (!run) {
      throw new NotFoundError('workflow run');
    }
    return run;
  }

  private async requireUpdatedActiveRun(
    runId: string,
    run: WorkflowRun | null,
  ): Promise<WorkflowRun> {
    if (run) {
      return run;
    }
    const latestRun = await this.requireRun(runId);
    if (latestRun.status === 'cancelled') {
      throw new BadRequestError(`Workflow run cancelled: ${runId}`);
    }
    throw new BadRequestError(`Workflow run is not active: ${runId}`);
  }

  private resolveNextNodeId(
    workflow: WorkflowDefinition,
    node: WorkflowNodeDefinition,
    output: unknown,
  ): string | null {
    const outgoing = workflow.edges.filter((edge) => edge.from === node.id);
    if (outgoing.length === 0) {
      return null;
    }
    if (node.type !== 'condition') {
      return outgoing[0]?.to ?? null;
    }

    const branch =
      output && typeof output === 'object' && 'branch' in output && typeof output.branch === 'string'
        ? output.branch
        : 'false';
    return outgoing.find((edge) => (edge.branch ?? edge.fromHandle) === branch)?.to ?? outgoing[0]?.to ?? null;
  }

  private async executeNode(
    workflow: WorkflowDefinition,
    node: WorkflowNodeDefinition,
    run: WorkflowRun,
    executionData: WorkflowExecutionData,
  ): Promise<unknown> {
    try {
      switch (node.type) {
        case 'start':
          return this.executeStartNode(run, executionData);
        case 'agent':
          return this.executeAgentNode(node, executionData);
        case 'tool':
          return this.executeToolNode(run, node, executionData);
        case 'condition':
          return this.executeConditionNode(node, executionData);
        case 'databaseWrite':
          return this.executeDatabaseWriteNode(workflow, run, node, executionData);
        case 'end':
          return this.executeEndNode(node, executionData);
        default:
          throw new BadRequestError(`Unsupported workflow node type: ${node.type satisfies never}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markNodeFailed(run.id, node.id, message, executionData.context);
      throw error;
    }
  }

  private executeStartNode(
    run: WorkflowRun,
    executionData: WorkflowExecutionData,
  ): Record<string, unknown> {
    const context = {
      ...executionData.context,
      triggerPayload: run.triggerPayload,
      runId: run.id,
      workflowId: run.workflowId,
    };
    executionData.context = context;
    return { ...context };
  }

  private async executeAgentNode(
    node: WorkflowNodeDefinition,
    executionData: WorkflowExecutionData,
  ): Promise<Record<string, unknown>> {
    const agentId = this.readRequiredString(node.config.agentId, 'agentId');
    const message = this.interpolateTemplate(
      this.readRequiredString(node.config.message, 'message'),
      executionData,
    );
    const agent = await this.agentRepository.get(agentId);
    if (!agent) {
      throw new NotFoundError('agent');
    }
    if (!agent.provider) {
      throw new BadRequestError(`Agent provider is missing: ${agentId}`);
    }
    if (!agent.model) {
      throw new BadRequestError(`Agent model is missing: ${agentId}`);
    }

    const provider = await this.providerRepository.get(agent.provider);
    if (!provider) {
      throw new NotFoundError('provider');
    }
    if (!provider.enabled) {
      throw new BadRequestError(`Provider is disabled: ${provider.id}`);
    }
    if (!provider.baseUrl) {
      throw new BadRequestError(`Provider baseUrl is missing: ${provider.id}`);
    }

    const protocol = provider.protocol ?? detectProtocol(provider.type, provider.baseUrl);
    const client = createLLMClient(protocol as ProtocolType, {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKeyEncrypted ? decryptProviderApiKey(provider.apiKeyEncrypted) : undefined,
    });
    const response = await client.chat({
      model: agent.model,
      messages: [
        { role: 'system', content: agent.instructions },
        { role: 'user', content: message },
      ],
      temperature: agent.settings?.temperature,
      maxTokens: agent.settings?.maxTokens,
    });

    const output = {
      agentId: agent.id,
      providerId: provider.id,
      model: response.model,
      content: response.content,
      usage: response.usage,
    };
    executionData.context[node.id] = output;
    return output;
  }

  private async executeToolNode(
    run: WorkflowRun,
    node: WorkflowNodeDefinition,
    executionData: WorkflowExecutionData,
  ): Promise<Record<string, unknown>> {
    const toolName = this.readRequiredString(node.config.toolName, 'toolName');
    const rawInput = this.readRecord(node.config.input, 'input');
    const toolInput = this.interpolateValue(rawInput, executionData);
    const registry = getToolRegistry();
    const result = await registry.execute(
      ToolCallSchema.parse({
        id: generateId(),
        toolName,
        input: toolInput,
      }),
      {
        userId: 'workflow',
        conversationId: run.id,
      },
    );
    const output = {
      toolName,
      output: result.output,
      error: result.error,
    };
    executionData.context[node.id] = output;
    if (result.error) {
      throw new BadRequestError(result.error);
    }
    return output;
  }

  private executeConditionNode(
    node: WorkflowNodeDefinition,
    executionData: WorkflowExecutionData,
  ): Record<string, unknown> {
    const left = this.interpolateValue(node.config.left, executionData);
    const right = this.interpolateValue(node.config.right, executionData);
    const operator = this.readRequiredString(node.config.operator, 'operator');
    let matched = false;
    switch (operator) {
      case 'equals':
        matched = left === right;
        break;
      case 'notEquals':
        matched = left !== right;
        break;
      case 'includes':
        matched = Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
        break;
      default:
        throw new BadRequestError(`Unsupported condition operator: ${operator}`);
    }
    const output = {
      branch: matched ? 'true' : 'false',
      matched,
      left,
      right,
      operator,
    };
    executionData.context[node.id] = output;
    return output;
  }

  private async executeDatabaseWriteNode(
    workflow: WorkflowDefinition,
    run: WorkflowRun,
    node: WorkflowNodeDefinition,
    executionData: WorkflowExecutionData,
  ): Promise<Record<string, unknown>> {
    const target = this.readRequiredString(node.config.target, 'target');
    if (target !== 'reference') {
      throw new BadRequestError(`Unsupported databaseWrite target: ${target}`);
    }
    const referenceIdTemplate = this.readRequiredString(node.config.id, 'id');
    const ownerUserId = this.readRequiredString(node.config.ownerUserId, 'ownerUserId');
    const namespace = this.readRequiredString(node.config.namespace, 'namespace');
    const titleTemplate = this.readRequiredString(node.config.title, 'title');
    const contentTemplate = this.readRecord(node.config.content, 'content');

    const reference = await this.databaseService.upsertReference(
      this.interpolateTemplate(referenceIdTemplate, executionData),
      {
        namespace,
        ownerUserId: this.interpolateTemplate(ownerUserId, executionData),
        conversationId: run.id,
        title: this.interpolateTemplate(titleTemplate, executionData),
        content: this.interpolateValue(contentTemplate, executionData),
        tags: [
          'workflow',
          `workflow:${workflow.id}`,
          `run:${run.id}`,
        ],
      },
    );
    const output = {
      target,
      reference,
    };
    executionData.context[node.id] = output;
    return output;
  }

  private executeEndNode(
    node: WorkflowNodeDefinition,
    executionData: WorkflowExecutionData,
  ): unknown {
    if (node.config.output !== undefined) {
      return this.interpolateValue(node.config.output, executionData);
    }
    return executionData.context.lastNodeOutput;
  }

  private readRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestError(`Workflow node config.${field} must be a non-empty string`);
    }
    return value;
  }

  private readRecord(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestError(`Workflow node config.${field} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private interpolateTemplate(template: string, executionData: WorkflowExecutionData): string {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawPath) => {
      const resolved = this.resolvePath(rawPath.trim(), executionData);
      if (resolved === undefined || resolved === null) {
        return '';
      }
      if (typeof resolved === 'string') {
        return resolved;
      }
      return JSON.stringify(resolved);
    });
  }

  private interpolateValue(value: unknown, executionData: WorkflowExecutionData): unknown {
    if (typeof value === 'string') {
      const pathOnlyMatch = value.match(/^\{\{\s*([^}]+)\s*\}\}$/);
      if (pathOnlyMatch) {
        return this.resolvePath(pathOnlyMatch[1].trim(), executionData);
      }
      return this.interpolateTemplate(value, executionData);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.interpolateValue(item, executionData));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          this.interpolateValue(nestedValue, executionData),
        ]),
      );
    }
    return value;
  }

  private resolvePath(pathExpression: string, executionData: WorkflowExecutionData): unknown {
    const root = {
      context: executionData.context,
      outputs: Object.fromEntries(executionData.nodeOutputs.entries()),
    };
    return pathExpression.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      return (current as Record<string, unknown>)[segment];
    }, root);
  }
}
