import { PlatformRepository } from "./repository.js";
import {
  CreatePlatformSchema,
  UpdatePlatformSchema,
  toPlatformResponse,
  type Platform,
  type PlatformResponse,
  type PlatformDetailResponse,
  type ConnectionTestResult,
  type SendMessageResult,
  type PlatformTypeMetadata,
  type PlatformType,
  type PlatformRuntimeStatus,
} from "./schema.js";
import { getPlatformAdapter, getPlatformPresets } from "./adapters/index.js";
import { BadRequestError, NotFoundError } from "../../server/errors/index.js";
import { getQQGatewayRuntimeManager } from "./runtime/qq-gateway-runtime.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLegacyOneBotPlatform(
  platform: Pick<Platform, "platformType" | "config">,
): boolean {
  if (platform.platformType !== "qq" || !isRecord(platform.config)) {
    return false;
  }

  const onebotHttp = platform.config.onebotHttp;
  if (!isRecord(onebotHttp) || onebotHttp.enabled !== true) {
    return false;
  }

  const qqOpenPlatform = platform.config.qqOpenPlatform;
  if (!isRecord(qqOpenPlatform)) {
    return true;
  }

  return qqOpenPlatform.enabled !== true;
}

function getEffectivePlatformType(
  platform: Pick<Platform, "platformType" | "config">,
): PlatformType {
  return isLegacyOneBotPlatform(platform) ? "onebot" : platform.platformType;
}

function normalizePlatform(platform: Platform): Platform {
  const platformType = getEffectivePlatformType(platform);
  if (platformType === platform.platformType) {
    return platform;
  }

  return {
    ...platform,
    platformType,
  };
}

function mergeSecretBackIntoConfig(
  existingConfig: Record<string, unknown>,
  nextConfig: Record<string, unknown>,
): Record<string, unknown> {
  const existingQQOpenPlatform = existingConfig.qqOpenPlatform;
  const nextQQOpenPlatform = nextConfig.qqOpenPlatform;

  if (!isRecord(existingQQOpenPlatform) || !isRecord(nextQQOpenPlatform)) {
    return nextConfig;
  }

  const nextHasAppSecret =
    typeof nextQQOpenPlatform.appSecret === "string" &&
    nextQQOpenPlatform.appSecret.trim().length > 0;

  if (nextHasAppSecret) {
    return nextConfig;
  }

  const existingAppSecret = existingQQOpenPlatform.appSecret;
  if (
    typeof existingAppSecret !== "string" ||
    existingAppSecret.trim().length === 0
  ) {
    return nextConfig;
  }

  return {
    ...nextConfig,
    qqOpenPlatform: {
      ...nextQQOpenPlatform,
      appSecret: existingAppSecret,
    },
  };
}

export class PlatformService {
  private repository: PlatformRepository;
  private readonly qqRuntimeManager = getQQGatewayRuntimeManager();

  constructor(repository?: PlatformRepository) {
    this.repository = repository ?? new PlatformRepository();
  }

  async list(): Promise<PlatformResponse[]> {
    const platforms = await this.repository.list();
    return platforms.map((platform) => {
      const normalizedPlatform = normalizePlatform(platform);
      return toPlatformResponse(
        normalizedPlatform,
        this.repository.maskCredentials(normalizedPlatform.credentials),
      );
    });
  }

  async get(id: string): Promise<PlatformDetailResponse | null> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) return null;

    const platform = normalizePlatform(storedPlatform);

    const response = toPlatformResponse(
      platform,
      this.repository.maskCredentials(platform.credentials),
    );
    const adapter = getPlatformAdapter(platform.platformType);

    if (adapter && adapter.capabilities.supportsConnectionTest) {
      try {
        const connectionStatus = await adapter.testConnection(
          platform.credentials ?? "",
          platform.config,
        );
        return {
          ...response,
          connectionStatus,
          runtimeStatus: await this.getRuntimeStatus(id),
        };
      } catch {
        return {
          ...response,
          connectionStatus: { success: false, error: "Connection test failed" },
          runtimeStatus: await this.getRuntimeStatus(id),
        };
      }
    }

    return { ...response, runtimeStatus: await this.getRuntimeStatus(id) };
  }

  async getMetadata(): Promise<{ platformTypes: PlatformTypeMetadata[] }> {
    return {
      platformTypes: getPlatformPresets(),
    };
  }

  async create(data: unknown): Promise<PlatformResponse> {
    const parsed = CreatePlatformSchema.parse(data);
    const platformType = getEffectivePlatformType({
      platformType: parsed.platformType,
      config: parsed.config,
    });
    const adapter = getPlatformAdapter(platformType);
    if (!adapter) {
      throw new BadRequestError(`Unsupported platform type: ${platformType}`);
    }

    const configValidation = adapter.validateConfig(parsed.config);
    if (configValidation.valid === false) {
      throw new BadRequestError(`Invalid config: ${configValidation.error}`);
    }

    if (parsed.credentials) {
      const credentialsValidation = adapter.validateCredentials(
        parsed.credentials,
      );
      if (credentialsValidation.valid === false) {
        throw new BadRequestError(
          `Invalid credentials: ${credentialsValidation.error}`,
        );
      }
    }

    const platform = await this.repository.create({
      name: parsed.name,
      platformType,
      config: configValidation.config,
      credentials: parsed.credentials,
      enabled: parsed.enabled,
    });

    return toPlatformResponse(
      platform,
      this.repository.maskCredentials(platform.credentials),
    );
  }

  async update(id: string, data: unknown): Promise<PlatformResponse | null> {
    const parsed = UpdatePlatformSchema.parse(data);
    const storedExisting = await this.repository.get(id);
    if (!storedExisting) return null;

    const existing = normalizePlatform(storedExisting);
    const nextConfigInput = parsed.config
          ? mergeSecretBackIntoConfig(existing.config, parsed.config)
          : existing.config;

    const platformType = getEffectivePlatformType({
      platformType: parsed.platformType ?? existing.platformType,
      config: nextConfigInput,
    });
    const adapter = getPlatformAdapter(platformType);
    if (!adapter) {
      throw new BadRequestError(`Unsupported platform type: ${platformType}`);
    }

    const configValidation = adapter.validateConfig(nextConfigInput);
    if (configValidation.valid === false) {
      throw new BadRequestError(`Invalid config: ${configValidation.error}`);
    }
    const config = configValidation.config;

    let credentials = existing.credentials;
    if (parsed.credentials !== undefined) {
      if (parsed.credentials === null) {
        credentials = undefined;
      } else {
        const credentialsValidation = adapter.validateCredentials(
          parsed.credentials,
        );
        if (credentialsValidation.valid === false) {
          throw new BadRequestError(
            `Invalid credentials: ${credentialsValidation.error}`,
          );
        }
        credentials = parsed.credentials;
      }
    }

    const updated = await this.repository.update(id, {
      name: parsed.name,
      platformType,
      config,
      credentials,
      enabled: parsed.enabled,
    });

    if (!updated) {
      return null;
    }

    const normalizedUpdated = normalizePlatform(updated);
    return toPlatformResponse(
      normalizedUpdated,
      this.repository.maskCredentials(normalizedUpdated.credentials),
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async testConnection(id: string): Promise<ConnectionTestResult> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) {
      throw new NotFoundError("Platform not found");
    }

    const platform = normalizePlatform(storedPlatform);

    const adapter = getPlatformAdapter(platform.platformType);
    if (!adapter) {
      throw new BadRequestError(
        `Unsupported platform type: ${platform.platformType}`,
      );
    }

    if (!adapter.capabilities.supportsConnectionTest) {
      return {
        success: false,
        error: "Connection testing is not supported for this platform",
      };
    }

    return adapter.testConnection(platform.credentials ?? "", platform.config);
  }

  async sendMessage(
    id: string,
    target: string,
    message: unknown,
  ): Promise<SendMessageResult | null> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) {
      throw new NotFoundError("Platform not found");
    }

    const platform = normalizePlatform(storedPlatform);

    const adapter = getPlatformAdapter(platform.platformType);
    if (!adapter) {
      throw new BadRequestError(
        `Unsupported platform type: ${platform.platformType}`,
      );
    }

    if (!adapter.capabilities.supportsMessaging) {
      throw new BadRequestError(
        `Messaging is not supported for platform type: ${platform.platformType}`,
      );
    }

    return adapter.sendMessage(
      platform.credentials ?? "",
      platform.config,
      target,
      message,
    );
  }

  async getPlatformMetadata(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) return null;

    const platform = normalizePlatform(storedPlatform);

    const adapter = getPlatformAdapter(platform.platformType);
    if (!adapter?.getMetadata) return null;

    return adapter.getMetadata();
  }

  async getRuntimeStatus(id: string): Promise<PlatformRuntimeStatus | null> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) {
      return null;
    }

    const platform = normalizePlatform(storedPlatform);
    if (platform.platformType !== "qq") {
      return null;
    }

    return this.qqRuntimeManager.getStatusSnapshot(id);
  }

  async startRuntime(id: string): Promise<PlatformRuntimeStatus> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) {
      throw new NotFoundError("Platform not found");
    }

    const platform = normalizePlatform(storedPlatform);
    if (platform.platformType !== "qq") {
      throw new BadRequestError(
        "Runtime startup is only supported for QQ platforms",
      );
    }

    return this.qqRuntimeManager.start(platform);
  }

  async stopRuntime(id: string): Promise<PlatformRuntimeStatus> {
    const storedPlatform = await this.repository.get(id);
    if (!storedPlatform) {
      throw new NotFoundError("Platform not found");
    }

    const platform = normalizePlatform(storedPlatform);
    if (platform.platformType !== "qq") {
      throw new BadRequestError(
        "Runtime shutdown is only supported for QQ platforms",
      );
    }

    return this.qqRuntimeManager.stop(id);
  }
}
