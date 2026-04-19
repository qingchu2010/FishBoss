import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { stripHtml, truncateText } from "./shared.js";

const WebSearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  limit: z.number().int().min(1).max(10).optional().default(5),
});

type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchOutput {
  query: string;
  results: WebSearchResult[];
  count: number;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractSearchResults(html: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const pattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;

  let match: RegExpExecArray | null = pattern.exec(html);
  while (match && results.length < limit) {
    results.push({
      url: decodeHtmlEntities(match[1]),
      title: truncateText(decodeHtmlEntities(stripHtml(match[2])), 200),
      snippet: truncateText(decodeHtmlEntities(stripHtml(match[3])), 300),
    });
    match = pattern.exec(html);
  }

  return results;
}

export const WebSearchTool = buildTool<WebSearchInput, WebSearchOutput>({
  definition: {
    name: "web_search",
    description: "Search the public web and return a short result list.",
    category: "web",
    inputSchema: {
      query: { type: "string", description: "Search query" },
      limit: {
        type: "number",
        description: "Maximum number of results",
        optional: true,
        default: 5,
      },
    },
    outputSchema: {
      query: { type: "string" },
      results: { type: "array" },
      count: { type: "number" },
    },
  },
  inputValidator: WebSearchInputSchema,
  async execute(input) {
    const searchUrl = new URL("https://duckduckgo.com/html/");
    searchUrl.searchParams.set("q", input.query);

    const response = await fetch(searchUrl, {
      headers: {
        "user-agent": "FishBoss/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const html = await response.text();
    const results = extractSearchResults(html, input.limit);

    return {
      query: input.query,
      results,
      count: results.length,
    };
  },
});
