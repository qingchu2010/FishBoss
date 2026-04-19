export interface ToolsSecurityConfig {
  enabled: boolean;
  allowedRoots: string[];
  deniedCommandPatterns: string[];
  dangerousCommandExpressions: RegExp[];
  maxCommandLength: number;
  maxFileSizeBytes: number;
}

export interface ToolsDomainConfig {
  defaultTimeoutMs: number;
  maxReadLines: number;
  maxFileEditSuggestions: number;
  shell: boolean;
  security: ToolsSecurityConfig;
}

export const toolsDomainConfig: ToolsDomainConfig = {
  defaultTimeoutMs: 30_000,
  maxReadLines: 2_000,
  maxFileEditSuggestions: 3,
  shell: true,
  security: {
    enabled: true,
    allowedRoots: [],
    deniedCommandPatterns: [
      "rm -rf",
      "format",
      "del /s",
      "mkfs",
      "dd if=",
      "> /dev/sd",
      ":(){ :|:& };:",
      "chmod 777",
      "chown root",
    ],
    dangerousCommandExpressions: [
      /\|\s*sh\b/i,
      /\|\s*bash\b/i,
      />\s*\/dev\//i,
      /\$\(/,
      /`/,
      /&&\s*rm\b/i,
      /\|\|\s*rm\b/i,
    ],
    maxCommandLength: 10_000,
    maxFileSizeBytes: 10 * 1024 * 1024,
  },
};
