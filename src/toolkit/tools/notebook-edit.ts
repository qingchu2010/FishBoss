import type { ToolkitToolDefinition } from "../types.js";

export const notebookEditTool: ToolkitToolDefinition = {
  id: "notebook_edit",
  name: "notebook_edit",
  title: "Notebook Edit",
  category: "file",
  description: "Applies structured edits to notebook-style documents.",
  longDescription:
    "Use this tool for files made of ordered cells, such as notebooks. It describes edits in terms of notebook content instead of treating the document as a plain text blob.",
  parameters: [
    {
      name: "file_path",
      type: "string",
      required: true,
      description: "Path to the notebook document that should be modified.",
    },
    {
      name: "cell_index",
      type: "number",
      required: true,
      description: "Zero-based index of the cell to update.",
    },
    {
      name: "content",
      type: "string",
      required: true,
      description: "Replacement content for the selected cell.",
    },
  ],
  tags: ["notebook", "cells", "edit"],
  readOnly: false,
  concurrencySafe: false,
};
