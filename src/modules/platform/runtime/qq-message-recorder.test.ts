import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseMessageRepository } from "../../database/repository.js";
import type { Platform } from "../schema.js";
import {
  QQMessageRecorder,
  type QQIncomingMessageContext,
} from "./qq-message-recorder.js";

let tempRoot: string;
let repository: DatabaseMessageRepository;

const platform: Platform = {
  id: "platform-qq",
  name: "QQ",
  platformType: "qq",
  config: {},
  credentials: "secret",
  enabled: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const context: QQIncomingMessageContext = {
  eventType: "C2C_MESSAGE_CREATE",
  sourceEventId: "event-1",
  sourceMessageId: "message-1",
  senderId: "user-1",
  targetId: "target-1",
  content: "hello",
  sendPayload: {
    msg_id: "message-1",
  },
};

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fishboss-qq-recorder-"));
  repository = new DatabaseMessageRepository({
    threadsPath: path.join(tempRoot, "threads.json"),
    messagesPath: path.join(tempRoot, "messages.json"),
  });
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("QQMessageRecorder", () => {
  it("records inbound and outbound messages in the same external thread", async () => {
    const recorder = new QQMessageRecorder(platform, repository);

    const thread = await recorder.recordInboundMessage(context);
    expect(thread).not.toBeNull();

    await recorder.recordOutboundMessage(context, "hi", {
      threadId: thread?.id,
      externalMessageId: "reply-1",
      payload: {
        streamed: true,
      },
    });

    const threads = await repository.listThreads({
      conversationClass: "qq",
      platformId: platform.id,
      limit: 10,
      offset: 0,
    });
    const messages = await repository.listMessages({
      threadId: thread?.id,
      limit: 10,
      offset: 0,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0].tags).toContain("qq-event:C2C_MESSAGE_CREATE");
    expect(messages).toMatchObject([
      {
        direction: "inbound",
        senderType: "user",
        senderId: "user-1",
        externalMessageId: "message-1",
        content: "hello",
      },
      {
        direction: "outbound",
        senderType: "assistant",
        senderId: "platform-qq",
        externalMessageId: "reply-1",
        content: "hi",
        payload: {
          eventType: "C2C_MESSAGE_CREATE",
          targetId: "target-1",
          streamed: true,
        },
      },
    ]);
  });
});
