import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import {
  MAX_WEB_CONTENT_LENGTH,
  stripHtml,
  truncateText,
} from "./shared.js";

const WebFetchInputSchema = z.object({
  url: z.string().url().describe("Fully qualified URL to fetch"),
  format: z.enum(["markdown", "text", "html"]).optional().default("text"),
});

type WebFetchInput = z.infer<typeof WebFetchInputSchema>;

interface WebFetchOutput {
  url: string;
  finalUrl: string;
  status: number;
  format: "markdown" | "text" | "html";
  contentType: string;
  title?: string;
  content: string;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim();
}

export const WebFetchTool = buildTool<WebFetchInput, WebFetchOutput>({
  definition: {
    name: "web_fetch",
    description: "Fetch content from a remote URL for inspection.",
    category: "web",
    inputSchema: {
      url: { type: "string", description: "Fully qualified URL to fetch" },
      format: {
        type: "string",
        description: "Preferred response format",
        optional: true,
        enum: ["markdown", "text", "html"],
        default: "text",
      },
    },
    outputSchema: {
      url: { type: "string" },
      finalUrl: { type: "string" },
      status: { type: "number" },
      format: { type: "string" },
      contentType: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
    },
  },
  inputValidator: WebFetchInputSchema,
  async execute(input) {
    const response = await fetch(input.url, {
      headers: {
        "user-agent": "FishBoss/1.0",
        accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
    });

    const rawContent = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("text/html");
    const title = isHtml ? extractTitle(rawContent) : undefined;

    let content = rawContent;
    if (input.format !== "html" && isHtml) {
      content = stripHtml(rawContent);
    }

    return {
      url: input.url,
      finalUrl: response.url,
      status: response.status,
      format: input.format,
      contentType,
      title,
      content: truncateText(content, MAX_WEB_CONTENT_LENGTH),
    };
  },
});
