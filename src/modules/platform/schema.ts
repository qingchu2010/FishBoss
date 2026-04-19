import { z } from "zod";

export const PlatformTypeSchema = z.enum([
  "qq",
  "onebot",
  "wechat",
  "telegram",
  "discord",
  "slack",
  "custom",
]);
export type PlatformType = z.infer<typeof PlatformTypeSchema>;

export const PlatformSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platformType: PlatformTypeSchema,
  config: z.record(z.unknown()),
  credentials: z.string().optional(),
  enabled: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Platform = z.infer<typeof PlatformSchema>;

export const CreatePlatformSchema = z.object({
  name: z.string().min(1, "Name is required"),
  platformType: PlatformTypeSchema,
  config: z.record(z.unknown()),
  credentials: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type CreatePlatformInput = z.infer<typeof CreatePlatformSchema>;

export const UpdatePlatformSchema = z.object({
  name: z.string().min(1).optional(),
  platformType: PlatformTypeSchema.optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export type UpdatePlatformInput = z.infer<typeof UpdatePlatformSchema>;

export interface AccessToken {
  token: string;
  expiresAt: number;
}

export interface SendMessageResult {
  messageId: string;
  timestamp: number;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  info?: Record<string, unknown>;
}

export interface PlatformRuntimeStatus {
  connected: boolean;
  phase:
    | "idle"
    | "discovering"
    | "connecting"
    | "identifying"
    | "ready"
    | "resuming"
    | "reconnecting"
    | "stopped"
    | "error";
  sessionId?: string;
  sequence?: number;
  heartbeatIntervalMs?: number;
  gatewayUrl?: string;
  startedAt?: string;
  lastHeartbeatAt?: string;
  lastEventAt?: string;
  reconnectAttempts: number;
  lastError?: string;
}

export interface PlatformCapabilities {
  supportsConnectionTest: boolean;
  supportsMessaging: boolean;
}

export interface PlatformModuleFieldOption {
  label: string;
  value: string;
}

export interface PlatformModuleFieldDefinition {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  required?: boolean;
  placeholder?: string;
  options?: PlatformModuleFieldOption[];
}

export interface PlatformModuleDefinition {
  id: string;
  title: string;
  description: string;
  enabledByDefault?: boolean;
  capabilities: PlatformCapabilities;
  fields: PlatformModuleFieldDefinition[];
}

export interface PlatformTypeMetadata {
  type: PlatformType;
  displayName: string;
  defaultConfig: Record<string, unknown>;
  modules: PlatformModuleDefinition[];
  capabilities: PlatformCapabilities;
}

export interface PlatformAdapter {
  readonly platformType: PlatformType;
  readonly displayName: string;
  readonly defaultConfig: Record<string, unknown>;
  readonly capabilities: PlatformCapabilities;
  readonly modules: PlatformModuleDefinition[];

  validateConfig(
    config: unknown,
  ):
    | { valid: true; config: Record<string, unknown> }
    | { valid: false; error: string };
  validateCredentials(
    credentials: unknown,
  ): { valid: true; credentials: string } | { valid: false; error: string };

  getAccessToken(
    credentials: string,
    config: Record<string, unknown>,
  ): Promise<AccessToken | null>;
  refreshAccessToken?(
    credentials: string,
    config: Record<string, unknown>,
  ): Promise<AccessToken | null>;

  testConnection(
    credentials: string,
    config: Record<string, unknown>,
  ): Promise<ConnectionTestResult>;
  sendMessage(
    credentials: string,
    config: Record<string, unknown>,
    target: string,
    message: unknown,
  ): Promise<SendMessageResult | null>;

  getMetadata?(): Promise<Record<string, unknown>>;
}

export interface PlatformResponse {
  id: string;
  name: string;
  platformType: PlatformType;
  config: Record<string, unknown>;
  enabled: boolean;
  credentialsMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformDetailResponse extends PlatformResponse {
  connectionStatus?: ConnectionTestResult;
  runtimeStatus?: PlatformRuntimeStatus | null;
}

function sanitizePlatformConfig(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const qqOpenPlatform = sanitized.qqOpenPlatform;
  if (
    typeof qqOpenPlatform === "object" &&
    qqOpenPlatform !== null &&
    !Array.isArray(qqOpenPlatform)
  ) {
    const qqOpenPlatformConfig = qqOpenPlatform as Record<string, unknown>;
        const appSecret = qqOpenPlatformConfig.appSecret;
        qqOpenPlatformConfig.appSecretConfigured =
          typeof appSecret === "string" && appSecret.trim().length > 0;
        delete qqOpenPlatformConfig.appSecret;
  }
  return sanitized;
}

export const toPlatformResponse = (
  platform: Platform,
  credentialsMasked: string,
): PlatformResponse => ({
  id: platform.id,
  name: platform.name,
  platformType: platform.platformType,
  config: sanitizePlatformConfig(platform.config),
  enabled: platform.enabled,
  credentialsMasked,
  createdAt: (platform.createdAt ?? new Date()).toISOString(),
  updatedAt: (platform.updatedAt ?? new Date()).toISOString(),
});
