import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempRoot: string;
let previousRoot: string | undefined;
let previousSecret: string | undefined;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fishboss-conversation-"));
  previousRoot = process.env.FISHBOSS_ROOT;
  previousSecret = process.env.SERVER_SECRET;
  process.env.FISHBOSS_ROOT = tempRoot;
  process.env.SERVER_SECRET = "conversation-test-secret";
  vi.resetModules();
});

afterEach(async () => {
  vi.resetModules();
  if (previousRoot === undefined) {
    delete process.env.FISHBOSS_ROOT;
  } else {
    process.env.FISHBOSS_ROOT = previousRoot;
  }
  if (previousSecret === undefined) {
    delete process.env.SERVER_SECRET;
  } else {
    process.env.SERVER_SECRET = previousSecret;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function createConversationService(): Promise<
  import("./service.js").ConversationService
> {
  const { ConversationService } = await import("./service.js");
  return new ConversationService();
}

describe("ConversationService integration", () => {
  it("persists chat-console messages and filters platform conversations", async () => {
    const service = await createConversationService();

    const chat = await service.createConversationForUser("user-1", {
      title: "Console Chat",
      metadata: {
        providerId: "provider-1",
        modelId: "model-1",
      },
    });
    const external = await service.createConversation({
      title: "QQ Thread",
      metadata: {
        conversationClass: "qq",
        platformId: "platform-qq",
        platformType: "qq",
        externalThreadId: "target-1/user-1",
      },
    });

    await service.appendMessage(chat.id, {
      role: "user",
      content: "hello",
    });
    await service.appendMessage(chat.id, {
      role: "assistant",
      content: "hi",
      metadata: {
        usage: {
          totalTokens: 2,
        },
      },
    });

    const messages = await service.listMessages(chat.id);
    const listed = await service.listConversations({ limit: 10, offset: 0 });
    const reloaded = await service.getConversation(chat.id);

    expect(messages?.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages?.[1].metadata?.usage?.totalTokens).toBe(2);
    expect(listed.map((conversation) => conversation.id)).toContain(chat.id);
    expect(listed.map((conversation) => conversation.id)).not.toContain(
      external.id,
    );
    expect(reloaded?.metadata?.ownerUserId).toBe("user-1");
    await expect(
      service.appendMessage("missing-conversation", {
        role: "user",
        content: "ignored",
      }),
    ).resolves.toBeNull();
  }, 10_000);
});
