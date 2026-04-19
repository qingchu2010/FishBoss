import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { z } from "zod";

import { buildTool } from "../ToolBuilder.js";
import { toolsDomainConfig } from "../config.js";
import { toolSecurityManager } from "../security.js";

const BashInputSchema = z
  .object({
    command: z.string().min(1).describe("Shell command to execute"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory for command execution"),
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
  .transform((input) => ({
    command: input.command,
    workdir: input.workdir ?? input.cwd,
    timeout: input.timeout,
    env: input.env,
  }));

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
      const child = spawn(input.command, {
        cwd: resolvedCwd,
        env: {
          ...process.env,
          ...context.environment,
          ...input.env,
        },
        shell: toolsDomainConfig.shell,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          command: input.command,
          cwd: resolvedCwd,
          stdout: stdout.trim(),
          stderr: timedOut
            ? stderr.trim() || `Command timed out after ${timeout}ms`
            : stderr.trim(),
          exitCode: timedOut ? 124 : (code ?? 1),
          durationMs: Date.now() - startedAt,
          timedOut,
        });
      });
    });
  },
});
