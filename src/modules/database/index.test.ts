import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseMessageRepository } from "./repository.js";

let tempRoot: string;
let repository: DatabaseMessageRepository;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fishboss-database-"));
  repository = new DatabaseMessageRepository({
    threadsPath: path.join(tempRoot, "threads.json"),
    messagesPath: path.join(tempRoot, "messages.json"),
  });
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("DatabaseMessageRepository", () => {
  it("deletes a message thread with its stored messages", async () => {
    const thread = await repository.upsertExternalThread({
      conversationClass: "qq",
      ownerUserId: "user-1",
      targetId: "target-1",
      platformId: "platform-1",
      platformType: "qq",
      title: "QQ user user-1 -> user target-1",
    });

    await repository.appendMessage({
      threadId: thread.id,
      conversationClass: "qq",
      direction: "inbound",
      senderType: "user",
      content: "hello",
      payload: {},
    });

    await expect(repository.deleteThread(thread.id)).resolves.toBe(true);
    await expect(repository.getThread(thread.id)).resolves.toBeNull();
    await expect(
      repository.listMessages({
        threadId: thread.id,
        limit: 10,
        offset: 0,
      }),
    ).resolves.toEqual([]);
    await expect(repository.deleteThread(thread.id)).resolves.toBe(false);
  });
});
