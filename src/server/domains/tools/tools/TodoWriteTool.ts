import { writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { ensureToolStateDirectory } from "./shared.js";

const TodoItemSchema = z.union([
  z.string(),
  z.object({
    title: z.string().min(1),
    status: z.enum(["pending", "in_progress", "completed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }),
]);

const TodoWriteInputSchema = z.object({
  todos: z.array(TodoItemSchema).min(1).describe("Ordered todo items"),
});

type TodoWriteInput = z.infer<typeof TodoWriteInputSchema>;

interface StoredTodoItem {
  title: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
}

interface TodoWriteOutput {
  path: string;
  conversationId?: string;
  count: number;
  todos: StoredTodoItem[];
}

function normalizeTodoItem(item: TodoWriteInput["todos"][number]): StoredTodoItem {
  if (typeof item === "string") {
    return {
      title: item,
      status: "pending",
      priority: "medium",
    };
  }

  return {
    title: item.title,
    status: item.status ?? "pending",
    priority: item.priority ?? "medium",
  };
}

export const TodoWriteTool = buildTool<TodoWriteInput, TodoWriteOutput>({
  definition: {
    name: "todo_write",
    description: "Create or update a persisted task list for the current conversation.",
    category: "workflow",
    modelVisible: false,
    inputSchema: {
      todos: { type: "array", description: "Ordered todo items" },
    },
    outputSchema: {
      path: { type: "string" },
      conversationId: { type: "string" },
      count: { type: "number" },
      todos: { type: "array" },
    },
  },
  inputValidator: TodoWriteInputSchema,
  async execute(input, context) {
    const todos = input.todos.map(normalizeTodoItem);
    const directory = await ensureToolStateDirectory("todos");
    const fileName = `${context.conversationId ?? context.messageId ?? "session"}.json`;
    const filePath = `${directory}${sep}${fileName}`;

    await writeFile(
      filePath,
      JSON.stringify(
        {
          conversationId: context.conversationId,
          messageId: context.messageId,
          updatedAt: new Date().toISOString(),
          todos,
        },
        null,
        2,
      ),
      "utf8",
    );

    return {
      path: filePath,
      conversationId: context.conversationId,
      count: todos.length,
      todos,
    };
  },
});
