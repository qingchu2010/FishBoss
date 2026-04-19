import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreateConversationSchema,
  UpdateConversationSchema,
  AppendMessageSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  StreamConversationSchema,
} from "./schemas.js";
import { getConversationService } from "./service.js";
import { NotFoundError, BadRequestError } from "../../errors/index.js";
import { createSSEController } from "../../sse/index.js";
import { getJobRegistry } from "../../jobs/index.js";
import { getCurrentUser } from "../../middleware/index.js";
import { z } from "zod";

const conversationParamsSchema = z.object({
  id: z.string(),
});

const backgroundJobParamsSchema = z.object({
  id: z.string(),
  jobId: z.string(),
});

export async function conversationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const service = getConversationService();

  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = ListConversationsQuerySchema.parse(request.query);
    const conversations = await service.listConversations({
      limit: query.limit,
      offset: query.offset,
      agentId: query.agentId,
    });
    return reply.send({ conversations });
  });

  fastify.get<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const conversation = await service.getConversation(id);
      if (!conversation) {
        throw new NotFoundError("Conversation");
      }
      return reply.send({ conversation });
    },
  );

  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = CreateConversationSchema.parse(request.body);
    const user = getCurrentUser(request);
    const conversation = user
      ? await service.createConversationForUser(user.id, data)
      : await service.createConversation(data);
    return reply.status(201).send({ conversation });
  });

  fastify.patch<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const data = UpdateConversationSchema.parse(request.body);
      const conversation = await service.updateConversation(id, data);
      if (!conversation) {
        throw new NotFoundError("Conversation");
      }
      return reply.send({ conversation });
    },
  );

  fastify.delete<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const deleted = await service.deleteConversation(id);
      if (!deleted) {
        throw new NotFoundError("Conversation");
      }
      return reply.status(204).send();
    },
  );

  fastify.get<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id/messages",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const query = ListMessagesQuerySchema.parse(request.query);

      const conversation = await service.getConversation(id);
      if (!conversation) {
        throw new NotFoundError("Conversation");
      }

      const messages = await service.listMessages(id, {
        limit: query.limit,
        offset: query.offset,
        role: query.role,
      });

      if (messages === null) {
        throw new NotFoundError("Conversation");
      }

      return reply.send({ messages });
    },
  );

  fastify.post<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id/messages",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const data = AppendMessageSchema.parse(request.body);

      const message = await service.appendMessage(id, data);
      if (!message) {
        throw new NotFoundError("Conversation");
      }

      return reply.status(201).send({ message });
    },
  );

  fastify.post<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id/stream",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const body = StreamConversationSchema.parse(request.body);

      if (body.conversationId !== id) {
        throw new BadRequestError("Conversation ID mismatch");
      }

      const conversation = await service.getConversation(id);
      if (!conversation) {
        throw new NotFoundError("Conversation");
      }

      const sseController = createSSEController(reply, request);
      await sseController.stream.start(30000);
      const abortController = new AbortController();

      request.raw.on("close", () => {
        abortController.abort();
      });

      sseController.stream.sendEvent("stream_start", {
        conversationId: id,
        status: "starting",
      });

      let streamErrorSent = false;
      const unsubscribe = service.onStreamingEvent(id, (event) => {
        if (event.type === "chunk") {
          sseController.stream.sendEvent("stream_chunk", {
            conversationId: id,
            messageId: event.messageId,
            ...(event.data as Record<string, unknown>),
          });
        }
        if (event.type === "tool_call" || event.type === "tool_result") {
          sseController.stream.sendEvent("stream_tool_calls", {
            conversationId: id,
            messageId: event.messageId,
            ...(event.data as Record<string, unknown>),
          });
        }
        if (event.type === "complete") {
          sseController.stream.sendEvent("stream_complete", {
            conversationId: id,
            messageId: event.messageId,
            ...(event.data as Record<string, unknown>),
          });
        }
        if (event.type === "assistant_message_created") {
          sseController.stream.sendEvent("stream_assistant_message_created", {
            conversationId: id,
            messageId: event.messageId,
            ...(event.data as Record<string, unknown>),
          });
        }
        if (event.type === "error") {
          streamErrorSent = true;
          sseController.stream.sendEvent("stream_error", {
            conversationId: id,
            messageId: event.messageId,
            ...(event.data as Record<string, unknown>),
          });
        }
      });

      try {
        await service.appendMessage(id, {
          role: "user",
          content: body.message,
        });

        await service.executeStreaming(id, body.message, {
          model: body.model,
          provider: body.provider,
          tools: body.tools,
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return reply;
        }
        if (!streamErrorSent) {
          sseController.stream.sendEvent("stream_error", {
            conversationId: id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        unsubscribe();
        sseController.stream.close();
      }

      return reply;
    },
  );

  fastify.post<{ Params: z.infer<typeof conversationParamsSchema> }>(
    "/:id/background",
    async (request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const body = StreamConversationSchema.parse(request.body);

      if (body.conversationId !== id) {
        throw new BadRequestError("Conversation ID mismatch");
      }

      const conversation = await service.getConversation(id);
      if (!conversation) {
        throw new NotFoundError("Conversation");
      }

      const jobRegistry = getJobRegistry();

      const job = await jobRegistry.enqueue({
        name: "conversation-execute",
        data: {
          conversationId: id,
          message: body.message,
          model: body.model,
          provider: body.provider,
          tools: body.tools,
        },
        handler: async (job, ctx) => {
          ctx.updateProgress(10);

          const placeholderContent = `[BACKGROUND PLACEHOLDER] Executing message: "${body.message}"`;

          ctx.updateProgress(50);

          const assistantMessage = await service.appendMessage(id, {
            role: "assistant",
            content: placeholderContent,
            metadata: {
              finishReason: "stop",
              tokens: placeholderContent.length,
            },
          });

          ctx.updateProgress(100);

          return {
            jobId: job.id,
            conversationId: id,
            messageId: assistantMessage?.id,
          };
        },
      });

      return reply.status(202).send({
        job: {
          id: job.id,
          status: job.status,
          createdAt: job.createdAt,
        },
      });
    },
  );

  fastify.get<{ Params: z.infer<typeof backgroundJobParamsSchema> }>(
    "/:id/background/:jobId",
    async (request, reply) => {
      const { id, jobId } = backgroundJobParamsSchema.parse(request.params);
      const jobRegistry = getJobRegistry();
      const job = jobRegistry.get(jobId);

      if (
        !job ||
        (job.data as Record<string, unknown>)["conversationId"] !== id
      ) {
        throw new NotFoundError("Job");
      }

      return reply.send({
        job: {
          id: job.id,
          name: job.name,
          status: job.status,
          progress: job.progress,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          error: job.error,
        },
      });
    },
  );
}
