import { mkdir, readdir } from "node:fs/promises";
import { relative, sep } from "node:path";

import { getStoragePaths } from "../../../../storage/paths.js";
import { toolSecurityManager } from "../security.js";
import type { ResolvedToolExecutionContext } from "../types.js";

export const MAX_SEARCH_RESULTS = 200;
export const MAX_SEARCH_FILE_SIZE_BYTES = 1024 * 1024;
export const MAX_WEB_CONTENT_LENGTH = 50_000;

export function resolveAllowedPath(
  filePath: string,
  context: ResolvedToolExecutionContext,
): string {
  const resolvedPath = toolSecurityManager.resolvePath(
    filePath,
    context.workingDirectory,
  );
  const validation = toolSecurityManager.validatePath(
    resolvedPath,
    context.workingDirectory,
    context.allowPathsOutsideWorkspace,
  );
  if (!validation.valid) {
    throw new Error(validation.error ?? "Path validation failed");
  }
  return resolvedPath;
}

export function assertWritablePath(path: string): void {
  if (toolSecurityManager.isReadOnlyPath(path)) {
    throw new Error(`Refusing to modify read-only system path: ${path}`);
  }
}

export async function walkFiles(
  rootPath: string,
  onFile: (filePath: string) => Promise<boolean | void>,
): Promise<boolean> {
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = `${rootPath}${rootPath.endsWith(sep) ? "" : sep}${entry.name}`;
    if (entry.isDirectory()) {
      const nestedShouldStop = await walkFiles(fullPath, onFile);
      if (nestedShouldStop) {
        return true;
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const shouldStop = await onFile(fullPath);
    if (shouldStop) {
      return true;
    }
  }

  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globPatternToRegExp(pattern: string): RegExp {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  let expression = "^";

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];

    if (character === "*") {
      const nextCharacter = normalizedPattern[index + 1];
      if (nextCharacter === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      expression += "[^/]";
      continue;
    }

    if (character === "{") {
      const closeIndex = normalizedPattern.indexOf("}", index);
      if (closeIndex !== -1) {
        const choices = normalizedPattern
          .slice(index + 1, closeIndex)
          .split(",")
          .map((choice) => escapeRegex(choice));
        expression += `(?:${choices.join("|")})`;
        index = closeIndex;
        continue;
      }
    }

    expression += escapeRegex(character);
  }

  expression += "$";
  return new RegExp(expression, "i");
}

export function toRelativeSearchPath(
  basePath: string,
  filePath: string,
): string {
  return relative(basePath, filePath).replace(/\\/g, "/");
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n... [truncated ${value.length - maxLength} more chars]`;
}

export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function getToolStateDirectory(name: string): string {
  return `${getStoragePaths().data}${sep}tool-state${sep}${name}`;
}

export async function ensureToolStateDirectory(name: string): Promise<string> {
  const directory = getToolStateDirectory(name);
  await mkdir(directory, { recursive: true });
  return directory;
}
