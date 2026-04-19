import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { resolveAllowedPath, assertWritablePath } from "./shared.js";

const NotebookEditInputSchema = z.object({
  file_path: z.string().min(1).describe("Path to the notebook document"),
  cell_index: z.number().int().min(0).describe("Zero-based cell index"),
  content: z.string().describe("Replacement content for the selected cell"),
});

type NotebookEditInput = z.infer<typeof NotebookEditInputSchema>;

interface NotebookCell {
  cell_type?: string;
  source?: string[] | string;
}

interface NotebookDocument {
  cells?: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

interface NotebookEditOutput {
  path: string;
  cellIndex: number;
  cellType: string;
  bytesWritten: number;
}

function toNotebookSource(content: string): string[] {
  if (!content) {
    return [];
  }

  return content.split("\n").map((line, index, lines) => {
    if (index === lines.length - 1) {
      return line;
    }
    return `${line}\n`;
  });
}

export const NotebookEditTool = buildTool<
  NotebookEditInput,
  NotebookEditOutput
>({
  definition: {
    name: "notebook_edit",
    description: "Update a single cell inside a notebook-style document.",
    category: "filesystem",
    inputSchema: {
      file_path: { type: "string", description: "Path to the notebook document" },
      cell_index: { type: "number", description: "Zero-based cell index" },
      content: { type: "string", description: "Replacement cell content" },
    },
    outputSchema: {
      path: { type: "string" },
      cellIndex: { type: "number" },
      cellType: { type: "string" },
      bytesWritten: { type: "number" },
    },
  },
  inputValidator: NotebookEditInputSchema,
  async execute(input, context) {
    const resolvedPath = resolveAllowedPath(input.file_path, context);
    assertWritablePath(resolvedPath);

    if (!existsSync(resolvedPath)) {
      throw new Error(`Notebook not found: ${resolvedPath}`);
    }

    const raw = await readFile(resolvedPath, "utf8");
    const notebook = JSON.parse(raw) as NotebookDocument;

    if (!Array.isArray(notebook.cells)) {
      throw new Error("Notebook file does not contain a cells array");
    }

    const cell = notebook.cells[input.cell_index];
    if (!cell) {
      throw new Error(`Notebook cell ${input.cell_index} does not exist`);
    }

    cell.source = toNotebookSource(input.content);
    const serialized = JSON.stringify(notebook, null, 2);
    await writeFile(resolvedPath, serialized, "utf8");

    return {
      path: resolvedPath,
      cellIndex: input.cell_index,
      cellType: cell.cell_type ?? "unknown",
      bytesWritten: Buffer.byteLength(serialized, "utf8"),
    };
  },
});
