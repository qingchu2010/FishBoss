import { resolve, isAbsolute, normalize } from "node:path";

import { toolsDomainConfig, type ToolsSecurityConfig } from "./config.js";

const WINDOWS_SYSTEM_PATHS = [
  "C:\\Windows\\System32",
  "C:\\Users\\Administrator",
];
const POSIX_SYSTEM_PATHS = ["/etc/passwd", "/etc/shadow", "/root"];
const READ_ONLY_PATH_PREFIXES = [
  "/etc/",
  "/usr/",
  "/bin/",
  "/sbin/",
  "C:\\Windows\\",
  "C:\\Program Files\\",
  "C:\\Program Files (x86)\\",
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class ToolSecurityManager {
  constructor(
    private readonly config: ToolsSecurityConfig = toolsDomainConfig.security,
  ) {}

  resolvePath(filePath: string, workingDirectory: string): string {
    return isAbsolute(filePath)
      ? normalize(filePath)
      : normalize(resolve(workingDirectory, filePath));
  }

  validatePath(
    filePath: string,
    workingDirectory: string,
    allowPathsOutsideWorkspace: boolean = false,
  ): ValidationResult {
    if (!this.config.enabled) {
      return { valid: true };
    }

    const resolvedPath = this.resolvePath(filePath, workingDirectory);
    const normalizedWorkingDirectory = normalize(workingDirectory);

    if (!allowPathsOutsideWorkspace) {
      const allowedRoots =
        this.config.allowedRoots.length > 0
          ? this.config.allowedRoots.map((root) =>
              this.resolvePath(root, normalizedWorkingDirectory),
            )
          : [normalizedWorkingDirectory];

      const withinAllowedRoot = allowedRoots.some(
        (allowedRoot) =>
          resolvedPath === allowedRoot ||
          resolvedPath.startsWith(
            `${allowedRoot}${resolvedPath.includes("\\") ? "\\" : "/"}`,
          ),
      );

      if (!withinAllowedRoot) {
        return {
          valid: false,
          error: `Path is outside allowed roots: ${filePath}`,
        };
      }
    }

    for (const dangerousPath of [
      ...WINDOWS_SYSTEM_PATHS,
      ...POSIX_SYSTEM_PATHS,
    ]) {
      if (resolvedPath.startsWith(normalize(dangerousPath))) {
        return {
          valid: false,
          error: `Access to system path denied: ${filePath}`,
        };
      }
    }

    return { valid: true };
  }

  validateCommand(command: string): ValidationResult {
    if (!this.config.enabled) {
      return { valid: true };
    }

    if (command.length > this.config.maxCommandLength) {
      return {
        valid: false,
        error: `Command too long: ${command.length} > ${this.config.maxCommandLength}`,
      };
    }

    const lowered = command.toLowerCase();
    for (const deniedPattern of this.config.deniedCommandPatterns) {
      if (lowered.includes(deniedPattern.toLowerCase())) {
        return {
          valid: false,
          error: `Command contains denied pattern: ${deniedPattern}`,
        };
      }
    }

    for (const expression of this.config.dangerousCommandExpressions) {
      if (expression.test(command)) {
        return {
          valid: false,
          error: "Command contains potentially dangerous shell syntax",
        };
      }
    }

    return { valid: true };
  }

  validateFileSize(size: number): ValidationResult {
    if (size > this.config.maxFileSizeBytes) {
      return {
        valid: false,
        error: `File too large: ${size} bytes (max ${this.config.maxFileSizeBytes} bytes)`,
      };
    }

    return { valid: true };
  }

  isReadOnlyPath(filePath: string): boolean {
    const normalizedPath = normalize(filePath);
    return READ_ONLY_PATH_PREFIXES.some((prefix) =>
      normalizedPath.startsWith(normalize(prefix)),
    );
  }
}

export const toolSecurityManager = new ToolSecurityManager();
