import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { TextDecoder } from "node:util";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { toolsDomainConfig } from "../config.js";
import { toolSecurityManager } from "../security.js";
import type { ToolPlatform } from "../types.js";
import { getLogger } from "../../../logging/index.js";

const logger = getLogger();

const BashInputSchema = z
  .object({
    command: z.string().min(1).describe("Shell command to execute"),
    workdir: z
      .string()
      .optional()
      .describe("Working directory for command execution"),
    timeout: z
      .number()
      .int()
      .min(1_000)
      .max(600_000)
      .optional()
      .describe("Command timeout in milliseconds"),
    env: z
      .record(z.string())
      .optional()
      .describe("Additional environment variables"),
  })
  .strict();

type BashInput = z.infer<typeof BashInputSchema>;

interface BashOutput {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

interface ShellInvocation {
  command: string;
  args: string[];
  shell: boolean;
}

function createShellInvocation(command: string, platform: ToolPlatform): ShellInvocation {
  if (platform === "windows") {
    return {
      command: `chcp 65001 > nul & ${command}`,
      args: [],
      shell: true,
    };
  }

  return {
    command,
    args: [],
    shell: toolsDomainConfig.shell,
  };
}

function decodeOutput(chunks: Buffer[]): string {
  if (chunks.length === 0) {
    return "";
  }

  const buffer = Buffer.concat(chunks);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_error) {
    logger.warn("Falling back to GB18030 command output decoding", {
      error: String(_error),
    });
    return new TextDecoder("gb18030").decode(buffer);
  }
}

function normalizeOutput(value: string): string {
  return value.trim();
}

export const BashTool = buildTool<BashInput, BashOutput>({
  definition: {
    name: "bash",
    description:
      "Execute a shell command with timeout, cwd, and environment support.",
    category: "execution",
    inputSchema: {
      command: { type: "string", description: "Shell command to execute" },
      workdir: {
        type: "string",
        description: "Working directory for command execution",
        optional: true,
      },
      timeout: {
        type: "number",
        description: "Command timeout in milliseconds",
        optional: true,
      },
      env: {
        type: "object",
        description: "Additional environment variables",
        optional: true,
      },
    },
    outputSchema: {
      command: { type: "string" },
      cwd: { type: "string" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      exitCode: { type: "number" },
      durationMs: { type: "number" },
      timedOut: { type: "boolean" },
    },
  },
  inputValidator: BashInputSchema,
  async execute(input, context) {
    const requestedCwd = input.workdir ?? context.workingDirectory;
    const resolvedCwd = toolSecurityManager.resolvePath(
      requestedCwd,
      context.workingDirectory,
    );
    const pathValidation = toolSecurityManager.validatePath(
      resolvedCwd,
      context.workingDirectory,
      context.allowPathsOutsideWorkspace,
    );
    if (!pathValidation.valid) {
      throw new Error(
        pathValidation.error ?? "Working directory validation failed",
      );
    }

    if (!existsSync(resolvedCwd)) {
      throw new Error(`Working directory not found: ${resolvedCwd}`);
    }

    const commandValidation = toolSecurityManager.validateCommand(
      input.command,
    );
    if (!commandValidation.valid) {
      throw new Error(commandValidation.error ?? "Command validation failed");
    }

    const timeout = input.timeout ?? toolsDomainConfig.defaultTimeoutMs;
    const startedAt = Date.now();

    return await new Promise<BashOutput>((resolve, reject) => {
      const invocation = createShellInvocation(input.command, context.platform);
      const child = spawn(invocation.command, invocation.args, {
        cwd: resolvedCwd,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          LANG: process.env.LANG ?? "C.UTF-8",
          LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
          ...context.environment,
          ...input.env,
        },
        shell: invocation.shell,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const stdout = normalizeOutput(decodeOutput(stdoutChunks));
        const stderr = normalizeOutput(decodeOutput(stderrChunks));
        resolve({
          command: input.command,
          cwd: resolvedCwd,
          stdout,
          stderr: timedOut
            ? stderr || `Command timed out after ${timeout}ms`
            : stderr,
          exitCode: timedOut ? 124 : (code ?? 1),
          durationMs: Date.now() - startedAt,
          timedOut,
        });
      });
    });
  },
});
