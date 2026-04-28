interface QQWebSocketLike {
  readonly readyState: number;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (raw: string | Buffer) => void): this;
  on(event: "close", listener: (code: number, reason: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  send(data: string): void;
  close(): void;
  terminate(): void;
  removeAllListeners(): void;
}

interface QQWebSocketConstructor {
  new (url: string): QQWebSocketLike;
  readonly OPEN: number;
}

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QQWebSocket = require("ws") as QQWebSocketConstructor;
import type { Platform, PlatformRuntimeStatus } from "../schema.js";
import {
  qqAdapter,
  sendQQC2CStreamMessage,
  QQStreamContentType,
  QQStreamInputMode,
  QQStreamInputState,
} from "../adapters/qq.js";
import { getLogger } from "../../../server/logging/index.js";
import { PlatformRepository } from "../repository.js";
import { getAgentRepository } from "../../../server/domains/agents/repository.js";
import { getConversationRepository } from "../../../server/domains/conversations/repository.js";
import { getConversationService } from "../../../server/domains/conversations/service.js";
import type { AgentSchema } from "../../../server/domains/agents/schemas.js";
import type { ConversationSchema } from "../../../server/domains/conversations/schemas.js";
import type { DatabaseMessageThread } from "../../database/schema.js";
import {
  QQMessageRecorder,
  type QQIncomingEventType,
  type QQIncomingMessageContext,
} from "./qq-message-recorder.js";

interface GatewayBotResponse {
  url: string;
  shards?: number;
  session_start_limit?: Record<string, unknown>;
}

interface GatewayPayload {
  op: number;
  d: Record<string, unknown> | number | null;
  s?: number | null;
  t?: string;
}

interface QQReplyProfile {
  agentId?: string;
  providerId: string;
  modelId: string;
}

const QQ_GATEWAY_BOT_URL = "https://api.sgroup.qq.com/gateway/bot";
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const QQ_GROUP_AND_C2C_EVENT_INTENT = 1 << 25;
const QQ_PUBLIC_GUILD_MESSAGES_INTENT = 1 << 30;
const QQ_STREAM_THROTTLE_MS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeInboundContent(content: string): string {
  return content.replace(/<@!\w+>/g, "").replace(/<@!\d+>/g, "").trim();
}

function isSupportedIncomingEventType(
  eventType: string | undefined,
): eventType is QQIncomingEventType {
  return (
    eventType === "AT_MESSAGE_CREATE" ||
    eventType === "GROUP_AT_MESSAGE_CREATE" ||
    eventType === "C2C_MESSAGE_CREATE"
  );
}

function getQQBotType(config: Record<string, unknown>): "c2c" | "group" | "guild" {
  const qqOpenPlatform = config.qqOpenPlatform;
  if (!isRecord(qqOpenPlatform)) {
    return "c2c";
  }
  const botType = qqOpenPlatform.botType;
  if (botType === "group" || botType === "guild" || botType === "c2c") {
    return botType;
  }
  return "c2c";
}

function getQQGatewayIntents(config: Record<string, unknown>): number {
  const botType = getQQBotType(config);
  if (botType === "guild") {
    return QQ_PUBLIC_GUILD_MESSAGES_INTENT;
  }
  return QQ_GROUP_AND_C2C_EVENT_INTENT;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseIncomingMessageContext(
  eventType: QQIncomingEventType,
  payload: Record<string, unknown>,
): QQIncomingMessageContext | null {
  const sourceEventId = toStringValue(payload.id);
  const sourceMessageId = toStringValue(payload.msg_id) ?? sourceEventId;
  const content = normalizeInboundContent(toStringValue(payload.content) ?? "");
  const author = isRecord(payload.author) ? payload.author : {};
  const senderId =
    toStringValue(author.user_openid) ??
    toStringValue(author.member_openid) ??
    toStringValue(author.id);

  if (!sourceEventId || !sourceMessageId || !senderId || !content) {
    return null;
  }

  if (eventType === "GROUP_AT_MESSAGE_CREATE") {
    const groupOpenId = toStringValue(payload.group_openid);
    if (!groupOpenId) {
      return null;
    }
    return {
      eventType,
      sourceEventId,
      sourceMessageId,
      senderId,
      targetId: groupOpenId,
      content,
      sendPayload: {
        msg_type: 0,
        event_id: sourceEventId,
        msg_id: sourceMessageId,
        msg_seq: 1,
      },
    };
  }

  if (eventType === "C2C_MESSAGE_CREATE") {
    const userOpenId =
      toStringValue(author.user_openid) ??
      toStringValue(payload.user_openid);
    if (!userOpenId) {
      return null;
    }
    return {
      eventType,
      sourceEventId,
      sourceMessageId,
      senderId,
      targetId: userOpenId,
      content,
      sendPayload: {
        msg_type: 0,
        event_id: sourceEventId,
        msg_id: sourceMessageId,
        msg_seq: 1,
      },
    };
  }

  const channelId = toStringValue(payload.channel_id);
  if (!channelId) {
    return null;
  }

  return {
    eventType,
    sourceEventId,
    sourceMessageId,
    senderId,
    targetId: channelId,
    content,
    sendPayload: {
      msg_type: 0,
      message_id: sourceMessageId,
    },
  };
}

class QQC2CStreamingController {
  private latestText = "";
  private lastSentText = "";
  private lastSentAt = 0;
  private streamMessageId: string | undefined;
  private index = 0;
  private messageSequence: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private chain = Promise.resolve();
  private fallbackToStatic = false;
  private sentChunk = false;
  private completedSuccessfully = false;

  constructor(
    private readonly platform: Platform,
    private readonly context: QQIncomingMessageContext,
    private readonly logger: ReturnType<typeof getLogger>,
  ) {
    this.messageSequence =
      typeof context.sendPayload.msg_seq === "number"
        ? context.sendPayload.msg_seq
        : 1;
  }

  get shouldFallbackToStatic(): boolean {
    return this.fallbackToStatic && !this.sentChunk;
  }

  get hasSentChunk(): boolean {
    return this.sentChunk;
  }

  get isCompletedSuccessfully(): boolean {
    return this.completedSuccessfully;
  }

  get currentMessageSequence(): number {
    return this.messageSequence;
  }

  async push(content: string): Promise<void> {
    this.latestText = content.trim();
    if (!this.latestText || this.fallbackToStatic) {
      return;
    }

    if (!this.streamMessageId) {
      await this.enqueue(async () => {
        if (!this.streamMessageId && !this.fallbackToStatic && this.latestText) {
          await this.send(this.latestText, QQStreamInputState.GENERATING);
        }
      });
      return;
    }

    this.scheduleFlush();
  }

  async finalize(): Promise<void> {
    await this.enqueue(async () => {
      this.clearFlushTimer();
      if (!this.streamMessageId || !this.latestText) {
        return;
      }
      await this.send(this.latestText, QQStreamInputState.DONE);
      this.clearSession();
    });
  }

  async beginNextAssistantMessage(): Promise<void> {
    await this.enqueue(async () => {
      this.clearFlushTimer();
      if (this.streamMessageId && this.latestText && !this.fallbackToStatic) {
        await this.send(this.latestText, QQStreamInputState.DONE);
      }
      this.clearSession();
      this.messageSequence += 1;
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.fallbackToStatic || !this.streamMessageId) {
      return;
    }

    const elapsed = Date.now() - this.lastSentAt;
    if (elapsed >= QQ_STREAM_THROTTLE_MS) {
      void this.enqueue(async () => {
        await this.flush();
      });
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.enqueue(async () => {
        await this.flush();
      });
    }, QQ_STREAM_THROTTLE_MS - elapsed);
  }

  private async flush(): Promise<void> {
    if (
      !this.streamMessageId ||
      this.fallbackToStatic ||
      !this.latestText ||
      this.latestText === this.lastSentText
    ) {
      return;
    }
    await this.send(this.latestText, QQStreamInputState.GENERATING);
  }

  private async send(content: string, state: 1 | 10): Promise<void> {
    try {
      const response = await sendQQC2CStreamMessage(
        this.platform.config,
        this.context.targetId,
        {
          input_mode: QQStreamInputMode.REPLACE,
          input_state: state,
          content_type: QQStreamContentType.MARKDOWN,
          content_raw: content,
          event_id: this.context.sourceEventId,
          msg_id: this.context.sourceMessageId,
          msg_seq: this.messageSequence,
          index: this.index,
          ...(this.streamMessageId ? { stream_msg_id: this.streamMessageId } : {}),
        },
      );

      if (!this.streamMessageId && typeof response.id === "string") {
        this.streamMessageId = response.id;
      }
      this.index += 1;
      this.sentChunk = true;
      this.lastSentAt = Date.now();
      this.lastSentText = content;
      this.completedSuccessfully = state === QQStreamInputState.DONE;
    } catch (error) {
      this.fallbackToStatic = true;
      this.clearFlushTimer();
      this.logger.warn("QQ C2C stream send failed, falling back to static", {
        platformId: this.platform.id,
        targetId: this.context.targetId,
        error: String(error),
      });
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(task, async () => {
      await task();
    });
    return this.chain;
  }

  private clearFlushTimer(): void {
    if (!this.flushTimer) {
      return;
    }
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private clearSession(): void {
    this.streamMessageId = undefined;
    this.index = 0;
    this.lastSentText = "";
    this.latestText = "";
    this.lastSentAt = 0;
    this.clearFlushTimer();
  }
}

class QQGatewayRuntime {
  private readonly logger = getLogger();
  private readonly agentRepository = getAgentRepository();
  private readonly conversationRepository = getConversationRepository();
  private readonly conversationService = getConversationService();
  private readonly messageRecorder: QQMessageRecorder;
  private readonly state: PlatformRuntimeStatus = {
    connected: false,
    phase: "idle",
    reconnectAttempts: 0,
  };
  private socket: QQWebSocketLike | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private resumeGatewayUrl: string | null = null;
  private readonly startedAt = new Date().toISOString();
  private token: string | null = null;
  private readonly handledEventIds = new Set<string>();

  constructor(private readonly platform: Platform) {
    this.state.startedAt = this.startedAt;
    this.messageRecorder = new QQMessageRecorder(platform);
  }

  getStatusSnapshot(): PlatformRuntimeStatus {
    return { ...this.state };
  }

  async start(): Promise<PlatformRuntimeStatus> {
    this.stopped = false;
    this.state.phase = "discovering";
    this.state.lastError = undefined;
    await this.connect(true);
    return this.getStatusSnapshot();
  }

  async stop(): Promise<PlatformRuntimeStatus> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
    this.state.connected = false;
    this.state.phase = "stopped";
    return this.getStatusSnapshot();
  }

  private async connect(initialStart: boolean): Promise<void> {
    const gateway = await this.discoverGateway();
    const gatewayUrl = this.resumeGatewayUrl ?? gateway.url;
    this.state.gatewayUrl = gatewayUrl;
    this.state.phase = this.resumeGatewayUrl
      ? "resuming"
      : initialStart
        ? "connecting"
        : "reconnecting";

    await new Promise<void>((resolve, reject) => {
      const socket = new QQWebSocket(gatewayUrl);
      this.socket = socket;

      socket.on("open", () => {
        this.logger.info("QQ gateway socket opened", {
          platformId: this.platform.id,
          gatewayUrl,
        });
        resolve();
      });

      socket.on("message", (raw: string | Buffer) => {
        void this.handleMessage(raw.toString(), gatewayUrl);
      });

      socket.on("close", (code: number, reason: Buffer) => {
        this.logger.warn("QQ gateway socket closed", {
          platformId: this.platform.id,
          code,
          reason: reason.toString(),
        });
        this.state.connected = false;
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      });

      socket.on("error", (error: Error) => {
        this.logger.error("QQ gateway socket error", error, {
          platformId: this.platform.id,
        });
        this.state.lastError = error.message;
        if (!this.stopped) {
          reject(error);
        }
      });
    }).catch(async (error) => {
      this.state.phase = "error";
      this.state.lastError =
        error instanceof Error ? error.message : String(error);
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });
  }

  private async discoverGateway(): Promise<GatewayBotResponse> {
    this.state.phase = "discovering";
    const token = await qqAdapter.getAccessToken(
      this.platform.credentials ?? "",
      this.platform.config,
    );
    if (!token) {
      throw new Error("Unable to acquire QQ access token for runtime startup");
    }
    this.token = token.token;

    const response = await fetch(QQ_GATEWAY_BOT_URL, {
      headers: {
        Authorization: `QQBot ${token.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `QQ gateway discovery failed with status ${response.status}`,
      );
    }

    return (await response.json()) as GatewayBotResponse;
  }

  private async handleMessage(raw: string, gatewayUrl: string): Promise<void> {
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(raw) as GatewayPayload;
    } catch (error) {
      this.logger.warn("Failed to parse QQ gateway payload", {
        platformId: this.platform.id,
        raw,
        error: String(error),
      });
      return;
    }

    if (typeof payload.s === "number") {
      this.state.sequence = payload.s;
    }

    switch (payload.op) {
      case 10:
        this.state.heartbeatIntervalMs =
          isRecord(payload.d) && typeof payload.d.heartbeat_interval === "number"
            ? payload.d.heartbeat_interval
            : typeof payload.d === "number"
              ? payload.d
              : undefined;
        await this.identifyOrResume();
        this.startHeartbeat();
        break;
      case 11:
        this.state.lastHeartbeatAt = new Date().toISOString();
        break;
      case 0:
        this.state.connected = true;
        this.state.phase = payload.t === "READY" ? "ready" : this.state.phase;
        this.state.lastEventAt = new Date().toISOString();
        if (payload.t === "READY" && isRecord(payload.d)) {
          this.state.sessionId =
            typeof payload.d.session_id === "string"
              ? payload.d.session_id
              : this.state.sessionId;
          this.resumeGatewayUrl = gatewayUrl;
          this.state.reconnectAttempts = 0;
        }
        if (payload.t === "RESUMED") {
          this.state.phase = "ready";
          this.state.reconnectAttempts = 0;
        }
        this.logger.info("QQ gateway event received", {
          platformId: this.platform.id,
          event: payload.t,
          sequence: payload.s ?? undefined,
        });
        if (isSupportedIncomingEventType(payload.t) && isRecord(payload.d)) {
          void this.handleIncomingMessage(payload.t, payload.d);
        }
        break;
      case 7:
        this.logger.warn("QQ gateway requested reconnect", {
          platformId: this.platform.id,
        });
        this.scheduleReconnect();
        break;
      case 9:
        this.logger.warn("QQ gateway invalid session", {
          platformId: this.platform.id,
        });
        this.state.sessionId = undefined;
        this.resumeGatewayUrl = null;
        await delay(1_000);
        this.scheduleReconnect();
        break;
      default:
        this.logger.debug("QQ gateway payload received", {
          platformId: this.platform.id,
          op: payload.op,
          event: payload.t,
        });
    }
  }

  private async identifyOrResume(): Promise<void> {
    if (!this.socket || !this.token) {
      return;
    }

    if (this.state.sessionId && this.state.sequence !== undefined) {
      this.state.phase = "resuming";
      this.socket.send(
        JSON.stringify({
          op: 6,
          d: {
            token: `QQBot ${this.token}`,
            session_id: this.state.sessionId,
            seq: this.state.sequence,
          },
        }),
      );
      return;
    }

    this.state.phase = "identifying";
    this.socket.send(
        JSON.stringify({
          op: 2,
          d: {
            token: `QQBot ${this.token}`,
            intents: getQQGatewayIntents(this.platform.config),
            shard: [0, 1],
            properties: {
              $os: process.platform,
              $sdk: "fishboss",
              $device: "fishboss",
          },
        },
      }),
    );
  }

  private startHeartbeat(): void {
    this.clearHeartbeatTimer();
    if (!this.state.heartbeatIntervalMs || !this.socket) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== QQWebSocket.OPEN) {
        return;
      }
      this.socket.send(
        JSON.stringify({
          op: 1,
          d: this.state.sequence ?? null,
        }),
      );
      this.state.lastHeartbeatAt = new Date().toISOString();
    }, this.state.heartbeatIntervalMs);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.clearHeartbeatTimer();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.terminate();
      this.socket = null;
    }

    this.state.connected = false;
    this.state.phase = "reconnecting";
    this.state.reconnectAttempts += 1;
    const delayMs = Math.min(
      RECONNECT_BASE_DELAY_MS * this.state.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(false);
    }, delayMs);
  }

  private async handleIncomingMessage(
    eventType: QQIncomingEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const context = parseIncomingMessageContext(eventType, payload);
    if (!context) {
      this.logger.warn("Ignoring unsupported QQ incoming message payload", {
        platformId: this.platform.id,
        eventType,
      });
      return;
    }

    if (this.handledEventIds.has(context.sourceMessageId)) {
      this.logger.debug("Skipping duplicate QQ incoming message", {
        platformId: this.platform.id,
        eventType,
        messageId: context.sourceMessageId,
      });
      return;
    }

    this.handledEventIds.add(context.sourceMessageId);
    if (this.handledEventIds.size > 500) {
      const firstId = this.handledEventIds.values().next().value;
      if (typeof firstId === "string") {
        this.handledEventIds.delete(firstId);
      }
    }

    this.logger.info("QQ inbound message received", {
      platformId: this.platform.id,
      eventType: context.eventType,
      targetId: context.targetId,
      senderId: context.senderId,
      messageId: context.sourceMessageId,
      contentPreview: context.content.slice(0, 120),
    });

    try {
      const messageThread = await this.messageRecorder.recordInboundMessage(context);
      const replyProfile = await this.resolveReplyProfile();
      if (!replyProfile) {
        await this.sendFallbackMessage(
          context,
          "FishBoss 未找到可用的回复 Agent 或模型配置。",
          messageThread,
        );
        return;
      }

      const conversation = await this.resolveConversation(
        context,
        replyProfile,
        messageThread?.id,
      );
      const userMessage = await this.conversationService.appendMessage(
        conversation.id,
        {
          role: "user",
          content: context.content,
        },
      );

      if (!userMessage) {
        throw new Error("Failed to append QQ inbound message");
      }

      const streamingController =
        context.eventType === "C2C_MESSAGE_CREATE"
          ? new QQC2CStreamingController(this.platform, context, this.logger)
          : null;
      const unsubscribeStreamingEvent = streamingController
        ? this.conversationService.onStreamingEvent(conversation.id, (event) => {
            if (event.type === "assistant_message_created") {
              void streamingController.beginNextAssistantMessage();
              return;
            }

            if (event.type !== "chunk" || !isRecord(event.data)) {
              return;
            }

            const content = toStringValue(event.data.content);
            if (!content) {
              return;
            }

            void streamingController.push(content);
          })
        : null;

      try {
        await this.conversationService.executeStreaming(
          conversation.id,
          context.content,
          {
            provider: replyProfile.providerId,
            model: replyProfile.modelId,
          },
        );

        if (streamingController) {
          await streamingController.finalize();
        }
      } finally {
        unsubscribeStreamingEvent?.();
      }

      const messages =
        (await this.conversationService.listMessages(conversation.id)) ?? [];
      const replyMessage = [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" &&
            typeof message.content === "string" &&
            message.content.trim().length > 0,
        );

      if (!replyMessage) {
        throw new Error("Assistant reply message not found");
      }

      if (
        streamingController?.isCompletedSuccessfully
      ) {
        await this.messageRecorder.recordOutboundMessage(context, replyMessage.content, {
          threadId: messageThread?.id,
          payload: {
            streamed: true,
            conversationId: conversation.id,
          },
        });
        this.logger.info("QQ reply streamed", {
          platformId: this.platform.id,
          targetId: context.targetId,
          conversationId: conversation.id,
        });
        return;
      }

      const sendResult = await qqAdapter.sendMessage(
        this.platform.credentials ?? "",
        this.platform.config,
        context.targetId,
        context.eventType === "C2C_MESSAGE_CREATE"
          ? {
              ...context.sendPayload,
              msg_type: 2,
              markdown: {
                content: replyMessage.content,
              },
              msg_seq: streamingController?.currentMessageSequence ?? context.sendPayload.msg_seq,
            }
          : {
              content: replyMessage.content,
              ...context.sendPayload,
              msg_seq:
                streamingController?.currentMessageSequence ?? context.sendPayload.msg_seq,
            },
      );

      if (!sendResult) {
        throw new Error("QQ reply send returned null");
      }

      await this.messageRecorder.recordOutboundMessage(context, replyMessage.content, {
        threadId: messageThread?.id,
        externalMessageId: sendResult.messageId,
        payload: {
          conversationId: conversation.id,
          sendResult,
        },
      });
      this.logger.info("QQ reply sent", {
        platformId: this.platform.id,
        targetId: context.targetId,
        replyMessageId: sendResult.messageId,
        conversationId: conversation.id,
      });
    } catch (error) {
      this.logger.error("Failed to handle QQ inbound message", error, {
        platformId: this.platform.id,
        eventType: context.eventType,
        messageId: context.sourceMessageId,
      });
      await this.sendFallbackMessage(
        context,
        "FishBoss 暂时无法回复，请检查 Agent、Provider 和模型配置。",
        undefined,
      );
    }
  }

  private async resolveReplyProfile(): Promise<QQReplyProfile | null> {
    const qqOpenPlatform = isRecord(this.platform.config.qqOpenPlatform)
      ? this.platform.config.qqOpenPlatform
      : {};
    const configuredAgentId = toStringValue(qqOpenPlatform.replyAgentId);
    const configuredProviderId = toStringValue(qqOpenPlatform.replyProviderId);
    const configuredModelId = toStringValue(qqOpenPlatform.replyModelId);

    let agent: AgentSchema | null = null;

    if (configuredAgentId) {
      agent = await this.agentRepository.get(configuredAgentId);
    }

    if (!agent) {
      const agents = await this.agentRepository.list({ limit: 20, offset: 0 });
      agent =
        agents.find(
          (item) =>
            typeof item.provider === "string" &&
            item.provider.trim().length > 0 &&
            typeof item.model === "string" &&
            item.model.trim().length > 0,
        ) ?? null;
    }

    const providerId = configuredProviderId ?? agent?.provider;
    const modelId = configuredModelId ?? agent?.model;

    if (!providerId || !modelId) {
      return null;
    }

    return {
      agentId: agent?.id,
      providerId,
      modelId,
    };
  }

  private async resolveConversation(
    context: QQIncomingMessageContext,
    profile: QQReplyProfile,
    externalThreadId?: string,
  ): Promise<ConversationSchema> {
    const tags = [
      "platform:qq",
      `platform-id:${this.platform.id}`,
      `qq-session:${getQQBotType(this.platform.config)}:${context.targetId}`,
    ];

    const existingConversations = await this.conversationRepository.list({
      limit: 100,
      offset: 0,
    });

    const existingConversation = existingConversations.find((conversation) =>
      tags.every((tag) => conversation.metadata?.tags?.includes(tag)),
    );

    if (existingConversation) {
      const updatedConversation = await this.conversationService.updateConversation(
        existingConversation.id,
        {
          metadata: {
            ...(existingConversation.metadata ?? {}),
            agentId: profile.agentId,
            providerId: profile.providerId,
            modelId: profile.modelId,
            conversationClass: "qq",
            platformId: this.platform.id,
            platformType: this.platform.platformType,
            externalThreadId,
            tags,
          },
        },
      );

      if (updatedConversation) {
        return updatedConversation;
      }
    }

    const title = context.content.slice(0, 80) || `QQ ${context.targetId}`;
    return this.conversationService.createConversation({
      title,
      metadata: {
        agentId: profile.agentId,
        providerId: profile.providerId,
        modelId: profile.modelId,
        conversationClass: "qq",
        platformId: this.platform.id,
        platformType: this.platform.platformType,
        externalThreadId,
        tags,
      },
    });
  }

  private async sendFallbackMessage(
    context: QQIncomingMessageContext,
    content: string,
    messageThread?: DatabaseMessageThread | null,
  ): Promise<void> {
    try {
      const result = await qqAdapter.sendMessage(
        this.platform.credentials ?? "",
        this.platform.config,
        context.targetId,
        {
          content,
          ...context.sendPayload,
        },
      );
      await this.messageRecorder.recordOutboundMessage(context, content, {
        threadId: messageThread?.id,
        externalMessageId: result?.messageId,
        payload: {
          fallback: true,
        },
      });
    } catch (error) {
      this.logger.error("Failed to send QQ fallback message", error, {
        platformId: this.platform.id,
        targetId: context.targetId,
      });
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export class QQGatewayRuntimeManager {
  private readonly runtimes = new Map<string, QQGatewayRuntime>();
  private readonly repository = new PlatformRepository();

  async startEnabledPlatforms(): Promise<void> {
    const platforms = await this.repository.list();
    for (const platform of platforms) {
      if (platform.enabled && platform.platformType === "qq") {
        await this.start(platform);
      }
    }
  }

  async start(platform: Platform): Promise<PlatformRuntimeStatus> {
    const existing = this.runtimes.get(platform.id);
    if (existing) {
      await existing.stop();
    }

    const runtime = new QQGatewayRuntime(platform);
    this.runtimes.set(platform.id, runtime);
    return runtime.start();
  }

  async stop(platformId: string): Promise<PlatformRuntimeStatus> {
    const runtime = this.runtimes.get(platformId);
    if (!runtime) {
      return {
        connected: false,
        phase: "stopped",
        reconnectAttempts: 0,
      };
    }

    const status = await runtime.stop();
    this.runtimes.delete(platformId);
    return status;
  }

  async stopAll(): Promise<void> {
    const platformIds = Array.from(this.runtimes.keys());
    for (const platformId of platformIds) {
      await this.stop(platformId);
    }
  }

  getStatusSnapshot(platformId: string): PlatformRuntimeStatus | null {
    return this.runtimes.get(platformId)?.getStatusSnapshot() ?? null;
  }
}

let managerInstance: QQGatewayRuntimeManager | null = null;

export function getQQGatewayRuntimeManager(): QQGatewayRuntimeManager {
  if (!managerInstance) {
    managerInstance = new QQGatewayRuntimeManager();
  }
  return managerInstance;
}
