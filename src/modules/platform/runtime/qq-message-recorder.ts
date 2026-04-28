import { DatabaseMessageRepository } from "../../database/repository.js";
import type { DatabaseMessageThread } from "../../database/schema.js";
import { getLogger } from "../../../server/logging/index.js";
import type { Platform } from "../schema.js";

export type QQIncomingEventType =
  | "AT_MESSAGE_CREATE"
  | "GROUP_AT_MESSAGE_CREATE"
  | "C2C_MESSAGE_CREATE";

export interface QQIncomingMessageContext {
  eventType: QQIncomingEventType;
  sourceEventId: string;
  sourceMessageId: string;
  senderId: string;
  targetId: string;
  content: string;
  sendPayload: Record<string, unknown>;
}

export interface QQOutboundMessageRecordOptions {
  threadId?: string;
  externalMessageId?: string;
  payload?: Record<string, unknown>;
}

function formatThreadTitle(context: QQIncomingMessageContext): string {
  const targetType =
    context.eventType === "GROUP_AT_MESSAGE_CREATE"
      ? "group"
      : context.eventType === "AT_MESSAGE_CREATE"
        ? "guild"
        : "user";
  return `QQ user ${context.senderId} -> ${targetType} ${context.targetId}`;
}

export class QQMessageRecorder {
  private readonly logger = getLogger();
  private readonly databaseMessageRepository: DatabaseMessageRepository;

  constructor(
    private readonly platform: Platform,
    databaseMessageRepository?: DatabaseMessageRepository,
  ) {
    this.databaseMessageRepository =
      databaseMessageRepository ?? new DatabaseMessageRepository();
  }

  async resolveMessageThread(
    context: QQIncomingMessageContext,
  ): Promise<DatabaseMessageThread> {
    return this.databaseMessageRepository.upsertExternalThread({
      conversationClass: "qq",
      ownerUserId: context.senderId,
      targetId: context.targetId,
      platformId: this.platform.id,
      platformType: this.platform.platformType,
      title: formatThreadTitle(context),
      tags: [
        "platform:qq",
        `platform-id:${this.platform.id}`,
        `qq-event:${context.eventType}`,
        `qq-target:${context.targetId}`,
        `qq-sender:${context.senderId}`,
      ],
    });
  }

  async recordInboundMessage(
    context: QQIncomingMessageContext,
  ): Promise<DatabaseMessageThread | null> {
    try {
      const thread = await this.resolveMessageThread(context);
      await this.databaseMessageRepository.appendMessage({
        threadId: thread.id,
        conversationClass: "qq",
        direction: "inbound",
        senderType: "user",
        senderId: context.senderId,
        externalMessageId: context.sourceMessageId,
        content: context.content,
        payload: {
          eventType: context.eventType,
          sourceEventId: context.sourceEventId,
          targetId: context.targetId,
          sendPayload: context.sendPayload,
        },
      });
      return thread;
    } catch (error) {
      this.logger.error("Failed to store QQ inbound message", error, {
        platformId: this.platform.id,
        messageId: context.sourceMessageId,
      });
      return null;
    }
  }

  async recordOutboundMessage(
    context: QQIncomingMessageContext,
    content: string,
    options?: QQOutboundMessageRecordOptions,
  ): Promise<void> {
    try {
      const threadId =
        options?.threadId ?? (await this.resolveMessageThread(context)).id;
      await this.databaseMessageRepository.appendMessage({
        threadId,
        conversationClass: "qq",
        direction: "outbound",
        senderType: "assistant",
        senderId: this.platform.id,
        externalMessageId: options?.externalMessageId,
        content,
        payload: {
          eventType: context.eventType,
          targetId: context.targetId,
          ...(options?.payload ?? {}),
        },
      });
    } catch (error) {
      this.logger.error("Failed to store QQ outbound message", error, {
        platformId: this.platform.id,
        targetId: context.targetId,
      });
    }
  }
}
