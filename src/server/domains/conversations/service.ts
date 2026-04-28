import { getConversationRepository } from "./repository.js";
import { getAgentRepository } from "../agents/repository.js";
import type {
  ConversationSchema,
  CreateConversationSchema,
  UpdateConversationSchema,
  MessageSchema,
  AppendMessageSchema,
} from "./schemas.js";
import { ProviderService } from "../../../modules/providers/service.js";
import type {
  ProviderUsage,
  StreamChunk,
} from "../../../types/provider.js";
import {
  getToolRegistry,
  type ToolDefinition,
  type ToolResult,
} from "../tools/index.js";
import { FrontendConfigRepository } from "../../../modules/frontend-config/repository.js";
import { getLogger } from "../../logging/index.js";
import {
  applyToolCallDeltas,
  finalizeNativeToolCalls,
  mergeToolCalls,
  parseAssistantTurn,
  parseChunk,
  type NativeToolCallAccumulator,
  type ParsedToolCall,
  type ThinkingState,
} from "./assistant-turn-parser.js";
import {
  MAX_TOOL_LOOP_ITERATIONS_LIMIT,
  buildEffectiveMessages,
  buildToolMessageContent,
  isAbortError,
  isChatConsoleConversation,
  isModelVisibleTool,
  mergeAssistantText,
  mergeUsage,
  normalizeToolNameList,
  resolveConversationToolProtocol,
  resolveMaxToolLoopIterations,
  toProviderToolDefinitions,
} from "./conversation-message-builder.js";

const logger = getLogger();

export interface StreamingEvent {
  type:
    | "chunk"
    | "tool_call"
    | "tool_result"
    | "complete"
    | "error"
    | "assistant_message_created";
  data: unknown;
  conversationId: string;
  messageId?: string;
}

export type StreamingEventHandler = (event: StreamingEvent) => void;

interface ExecutedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

interface ToolExecutionRecord {
  toolCall: ExecutedToolCall;
}

export class ConversationService {
  private repository = getConversationRepository();
  private agentRepository = getAgentRepository();
  private streamingHandlers: Map<string, StreamingEventHandler[]> = new Map();
  private providerService = new ProviderService();
  private toolRegistry = getToolRegistry();
  private frontendConfigRepository = new FrontendConfigRepository();

  async listConversations(options?: {
    limit?: number;
    offset?: number;
    agentId?: string;
  }): Promise<ConversationSchema[]> {
    const conversations = await this.repository.list(options);
    return conversations.filter(isChatConsoleConversation);
  }

  async getConversation(id: string): Promise<ConversationSchema | null> {
    return this.repository.get(id);
  }

  async createConversation(
    data: CreateConversationSchema,
  ): Promise<ConversationSchema> {
    return this.repository.create({
      ...data,
      metadata: {
        ...(data.metadata ?? {}),
        conversationClass: data.metadata?.conversationClass ?? "chat-console",
      },
    });
  }

  async createConversationForUser(
    userId: string,
    data: CreateConversationSchema,
  ): Promise<ConversationSchema> {
    return this.repository.create({
      ...data,
      metadata: {
        ...(data.metadata ?? {}),
        ownerUserId: userId,
        conversationClass: data.metadata?.conversationClass ?? "chat-console",
      },
    });
  }

  async updateConversation(
    id: string,
    data: UpdateConversationSchema,
  ): Promise<ConversationSchema | null> {
    return this.repository.update(id, data);
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async listMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number; role?: string },
  ): Promise<MessageSchema[] | null> {
    return this.repository.listMessages(conversationId, options);
  }

  async appendMessage(
    conversationId: string,
    data: AppendMessageSchema,
  ): Promise<MessageSchema | null> {
    const conversation = await this.repository.get(conversationId);
    if (!conversation) {
      return null;
    }

    const message: MessageSchema = {
      id: this.repository.generateMessageId(),
      role: data.role,
      content: data.content,
      createdAt: new Date().toISOString(),
      toolCalls: data.toolCalls,
      metadata: data.metadata,
    };

    const updated = await this.repository.addMessage(conversationId, message);
    return updated ? message : null;
  }

  async updateMessageContent(
    conversationId: string,
    messageId: string,
    delta: string,
  ): Promise<void> {
    const message = await this.repository.getMessageById(
      conversationId,
      messageId,
    );
    if (!message) return;

    message.content = (message.content ?? "") + delta;
    await this.repository.updateMessage(conversationId, messageId, message);
  }

  onStreamingEvent(
    conversationId: string,
    handler: StreamingEventHandler,
  ): () => void {
    const handlers = this.streamingHandlers.get(conversationId) ?? [];
    handlers.push(handler);
    this.streamingHandlers.set(conversationId, handlers);

    return () => {
      const h = this.streamingHandlers.get(conversationId);
      if (h) {
        const index = h.indexOf(handler);
        if (index >= 0) {
          h.splice(index, 1);
        }
      }
    };
  }

  emitStreamingEvent(conversationId: string, event: StreamingEvent): void {
    const handlers = this.streamingHandlers.get(conversationId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          logger.error("Failed to emit streaming event", error, {
            conversationId,
            messageId: event.messageId,
            eventType: event.type,
          });
        }
      }
    }
  }

  async executeStreaming(
    conversationId: string,
    _message: string,
    options?: {
      model?: string;
      provider?: string;
      tools?: string[];
      signal?: AbortSignal;
    },
  ): Promise<{ jobId: string; messageId: string }> {
    const conversation = await this.repository.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    let messageId = this.repository.generateMessageId();
    const jobId = `stream_${messageId}`;

    const providerId = options?.provider;
    const modelId = options?.model;
    const agent = conversation.metadata?.agentId
      ? await this.agentRepository.get(conversation.metadata.agentId)
      : null;
    const agentInstructions = agent?.instructions?.trim();
    const agentAllowedTools = agent
      ? normalizeToolNameList(
          agent.toolPermissions?.allowedTools ?? agent.tools,
        ).filter(
          (toolName) =>
            !(agent.toolPermissions?.deniedTools ?? []).includes(toolName),
        )
      : [];
    const resolvedToolNames =
      options?.tools !== undefined ? options.tools : agentAllowedTools;
    const allowedTools = normalizeToolNameList(resolvedToolNames);
    const allowedToolDefinitions = allowedTools
      .map((toolName) => this.toolRegistry.get(toolName)?.definition)
      .filter(
        (definition): definition is ToolDefinition => definition !== undefined,
      )
      .filter(isModelVisibleTool);
    const allowedCallableTools = allowedToolDefinitions.map(
      (definition) => definition.name,
    );
    const providerToolDefinitions = toProviderToolDefinitions(
      allowedToolDefinitions,
    );

    let assistantMessage: MessageSchema = {
      id: messageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    const updatedConversation = await this.repository.addMessage(
      conversationId,
      assistantMessage,
    );
    if (!updatedConversation) {
      throw new Error("Failed to create assistant message");
    }

    if (!providerId || !modelId) {
      const error = new Error("Provider and model are required");
      this.emitStreamingEvent(conversationId, {
        type: "error",
        data: { message: error.message },
        conversationId,
        messageId,
      });
      throw error;
    }

    const provider = await this.providerService.get(providerId);
    if (!provider) {
      const error = new Error("Provider not found");
      this.emitStreamingEvent(conversationId, {
        type: "error",
        data: { message: error.message },
        conversationId,
        messageId,
      });
      throw error;
    }
    const toolProtocol = resolveConversationToolProtocol(provider);
    let shouldEmitComplete = false;
    const frontendConfig = await this.frontendConfigRepository.get();
    const maxToolLoopIterations =
      frontendConfig.toolLoopLimitEnabled === false
        ? MAX_TOOL_LOOP_ITERATIONS_LIMIT
        : resolveMaxToolLoopIterations(
            frontendConfig.maxToolLoopIterations,
          );

    try {
      for (
        let iteration = 0;
        iteration < maxToolLoopIterations;
        iteration += 1
      ) {
        const currentMessages = (await this.listMessages(conversationId)) ?? [];
        const providerMessages = buildEffectiveMessages({
          messages: currentMessages.filter(
            (message) => message.id !== messageId,
          ),
          toolDefinitions: allowedToolDefinitions,
          toolProtocol,
          agentInstructions,
        });

        let streamedContent = "";
        let visibleContent = "";
        const baseVisibleContent = assistantMessage.content;
        const baseThinking =
          typeof assistantMessage.metadata?.thinking === "string"
            ? assistantMessage.metadata.thinking
            : undefined;
        let thinkingState: ThinkingState = {
          thinking: "",
          unclosed: false,
          toolCallUnclosed: false,
        };
        const nativeToolCallAccumulators = new Map<
          number,
          NativeToolCallAccumulator
        >();
        let latestUsage: ProviderUsage | undefined;
        let persistedAssistantMessage = assistantMessage;
        let persistChain = Promise.resolve();

        await this.providerService.stream(
          providerId,
          modelId,
          providerMessages,
          (chunk: StreamChunk) => {
            if (options?.signal?.aborted) {
              return;
            }
            if (chunk.toolCallDeltas && chunk.toolCallDeltas.length > 0) {
              applyToolCallDeltas(
                nativeToolCallAccumulators,
                chunk.toolCallDeltas,
              );
            }
            latestUsage = mergeUsage(latestUsage, chunk.usage);
            streamedContent += chunk.delta;
            const { content, state } = parseChunk(chunk.delta, thinkingState);
            thinkingState = state;
            visibleContent += content;
            const combinedVisibleContent = `${baseVisibleContent}${visibleContent}`;
            const combinedThinking = mergeAssistantText(
              baseThinking,
              thinkingState.thinking.trim().length > 0
                ? thinkingState.thinking
                : undefined,
            );
            const hasThinking = combinedThinking !== undefined;
            persistedAssistantMessage = {
              ...persistedAssistantMessage,
              content: combinedVisibleContent,
              metadata: {
                ...(persistedAssistantMessage.metadata ?? {}),
                ...(hasThinking ? { thinking: combinedThinking } : {}),
                ...(latestUsage
                  ? {
                      tokens: latestUsage.totalTokens,
                      usage: latestUsage,
                    }
                  : {}),
              },
            };
            if (!hasThinking && persistedAssistantMessage.metadata) {
              persistedAssistantMessage.metadata = {
                ...persistedAssistantMessage.metadata,
                thinking: undefined,
              };
            }
            persistChain = persistChain.then(async () => {
              await this.repository.updateMessage(
                conversationId,
                messageId,
                persistedAssistantMessage,
              );
            });
            this.emitStreamingEvent(conversationId, {
              type: "chunk",
              data: {
                chunk: chunk.delta,
                content: combinedVisibleContent,
                metadata: hasThinking
                  ? {
                      thinking: combinedThinking,
                      ...(latestUsage
                        ? {
                            tokens: latestUsage.totalTokens,
                            usage: latestUsage,
                          }
                        : {}),
                    }
                  : latestUsage
                    ? {
                        tokens: latestUsage.totalTokens,
                        usage: latestUsage,
                      }
                    : {},
              },
              conversationId,
              messageId,
            });
          },
          providerToolDefinitions,
          toolProtocol === "native" && allowedToolDefinitions.length > 0
            ? "auto"
            : undefined,
          options?.signal,
        );

        await persistChain;

        const parsedTurn = parseAssistantTurn(streamedContent, {
          parseTextToolCalls: toolProtocol === "text",
        });
        const nativeToolCalls = finalizeNativeToolCalls(
          nativeToolCallAccumulators,
        );
        const mergedToolCalls = mergeToolCalls(
          parsedTurn.toolCalls,
          nativeToolCalls,
        );
        const previousToolCalls = assistantMessage.toolCalls ?? [];
        const executedToolCalls = mergedToolCalls.map((toolCall) => {
          const existing = previousToolCalls.find((tc) => tc.id === toolCall.id);
          if (existing && (existing.output !== undefined || existing.error)) {
            return {
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
              output: existing.output,
              error: existing.error,
            };
          }
          return {
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          };
        });
        const completeThinking = mergeAssistantText(
          baseThinking,
          parsedTurn.thinking,
        );
        const hasThinking = completeThinking !== undefined;
        const completeContent = `${baseVisibleContent}${parsedTurn.content}`;

        const assistantMessageUpdate: MessageSchema = {
          ...assistantMessage,
          content: completeContent,
          toolCalls:
            executedToolCalls.length > 0
              ? executedToolCalls
              : assistantMessage.toolCalls,
          metadata: {
            ...(assistantMessage.metadata ?? {}),
            ...(hasThinking ? { thinking: completeThinking } : {}),
            ...(latestUsage
              ? {
                  tokens: latestUsage.totalTokens,
                  usage: latestUsage,
                }
              : {}),
          },
        };
        if (!hasThinking && assistantMessageUpdate.metadata) {
          assistantMessageUpdate.metadata = {
            ...assistantMessageUpdate.metadata,
            thinking: undefined,
          };
        }

        await this.repository.updateMessage(
          conversationId,
          messageId,
          assistantMessageUpdate,
        );
        assistantMessage = assistantMessageUpdate;

        if (mergedToolCalls.length === 0) {
          shouldEmitComplete = true;
          this.emitStreamingEvent(conversationId, {
            type: "complete",
            data: {
              content: completeContent,
              toolCalls: assistantMessageUpdate.toolCalls,
              metadata: {
                ...(hasThinking ? { thinking: completeThinking } : {}),
                ...(latestUsage
                  ? {
                      tokens: latestUsage.totalTokens,
                      usage: latestUsage,
                    }
                  : {}),
              },
            },
            conversationId,
            messageId,
          });
          break;
        }

        const toolExecutionRecords = await this.executeToolCalls(
          conversationId,
          messageId,
          mergedToolCalls,
          allowedCallableTools,
        );

        const updatedToolCalls = toolExecutionRecords.map(
          (record) => record.toolCall,
        );
        await this.repository.updateMessage(conversationId, messageId, {
          ...assistantMessageUpdate,
          toolCalls: updatedToolCalls,
        });

        const newAssistantMessage: MessageSchema = {
          id: this.repository.generateMessageId(),
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        };
        const updatedConv = await this.repository.addMessage(
          conversationId,
          newAssistantMessage,
        );
        if (!updatedConv) {
          throw new Error("Failed to create new assistant message");
        }
        const newMessageId = newAssistantMessage.id;
        this.emitStreamingEvent(conversationId, {
          type: "assistant_message_created",
          data: {
            messageId: newMessageId,
          },
          conversationId,
          messageId: newMessageId,
        });
        messageId = newMessageId;
        assistantMessage = newAssistantMessage;

        if (iteration === maxToolLoopIterations - 1) {
          const limitMessage =
            "Stopped after reaching the maximum tool loop limit.";
          await this.appendMessage(conversationId, {
            role: "tool",
            content: limitMessage,
          });
          this.emitStreamingEvent(conversationId, {
            type: "tool_result",
            data: {
              callId: "tool_loop_limit",
              toolName: "system",
              error: limitMessage,
            },
            conversationId,
            messageId,
          });
        }
      }
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        return { jobId, messageId };
      }
      this.emitStreamingEvent(conversationId, {
        type: "error",
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
        conversationId,
        messageId,
      });
      throw error;
    }

    if (!shouldEmitComplete && !options?.signal?.aborted) {
      this.emitStreamingEvent(conversationId, {
        type: "complete",
        data: {
          content: assistantMessage.content,
          toolCalls: assistantMessage.toolCalls,
          metadata: assistantMessage.metadata ?? {},
        },
        conversationId,
        messageId,
      });
    }

    return { jobId, messageId };
  }

  private async executeToolCalls(
    conversationId: string,
    messageId: string,
    toolCalls: ParsedToolCall[],
    allowedTools: string[],
  ): Promise<ToolExecutionRecord[]> {
    const records: ToolExecutionRecord[] = [];
    const frontendConfig = await this.frontendConfigRepository.get();
    const allowPathsOutsideWorkspace =
      frontendConfig.allowToolPathsOutsideWorkspace === true;

    for (const toolCall of toolCalls) {
      this.emitStreamingEvent(conversationId, {
        type: "tool_call",
        data: {
          callId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.input,
        },
        conversationId,
        messageId,
      });

      let result: ToolResult;
      if (!allowedTools.includes(toolCall.name)) {
        result = {
          callId: toolCall.id,
          error: `Tool '${toolCall.name}' is not allowed in this conversation`,
        };
      } else {
        result = await this.toolRegistry.execute(
          {
            id: toolCall.id,
            toolName: toolCall.name,
            input: toolCall.input,
          },
          {
            workingDirectory: process.cwd(),
            allowPathsOutsideWorkspace,
            conversationId,
            messageId,
          },
        );
      }

      const toolMessage = await this.appendMessage(conversationId, {
        role: "tool",
        content: buildToolMessageContent(toolCall, result),
      });

      if (!toolMessage) {
        throw new Error(`Failed to persist tool result for '${toolCall.name}'`);
      }

      const executedToolCall: ExecutedToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
        output: result.output,
        error: result.error,
      };

      this.emitStreamingEvent(conversationId, {
        type: "tool_result",
        data: {
          callId: toolCall.id,
          toolName: toolCall.name,
          output: result.output,
          error: result.error,
          toolMessageId: toolMessage.id,
        },
        conversationId,
        messageId,
      });

      records.push({
        toolCall: executedToolCall,
      });
    }

    return records;
  }
}

let serviceInstance: ConversationService | null = null;

export function getConversationService(): ConversationService {
  if (!serviceInstance) {
    serviceInstance = new ConversationService();
  }
  return serviceInstance;
}
