import type {
  PlatformAdapter,
  AccessToken,
  ConnectionTestResult,
  SendMessageResult,
} from '../schema.js';
import { z } from 'zod';
import { getLogger } from '../../../server/logging/index.js';

const logger = getLogger();

const OneBotTargetTypeSchema = z.enum(['private', 'group']);

const OneBotHttpModuleSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().default('http://127.0.0.1:3000'),
  accessToken: z.string().default(''),
  targetType: OneBotTargetTypeSchema.default('private'),
});

const OneBotConfigSchema = z.object({
  onebotHttp: OneBotHttpModuleSchema.default({
    enabled: true,
    baseUrl: 'http://127.0.0.1:3000',
    accessToken: '',
    targetType: 'private',
  }),
}).superRefine((value, ctx) => {
  if (!value.onebotHttp.enabled) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'OneBot HTTP must be enabled',
      path: ['onebotHttp', 'enabled'],
    });
  }

  if (!value.onebotHttp.baseUrl.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'OneBot baseUrl is required',
      path: ['onebotHttp', 'baseUrl'],
    });
    return;
  }

  try {
    new URL(value.onebotHttp.baseUrl);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'OneBot baseUrl must be a valid URL',
      path: ['onebotHttp', 'baseUrl'],
    });
  }
});

const OneBotMessageSchema = z.object({
  content: z.string().optional(),
});

function normalizeOneBotBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildOneBotHeaders(accessToken: string): Record<string, string> {
  if (!accessToken.trim()) {
    return {
      'Content-Type': 'application/json',
    };
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken.trim()}`,
  };
}

function parseOneBotConfig(config: Record<string, unknown>) {
  return OneBotConfigSchema.parse(config);
}

export const onebotAdapter: PlatformAdapter = {
  platformType: 'onebot',
  displayName: 'OneBot',
  defaultConfig: {
    onebotHttp: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:3000',
      accessToken: '',
      targetType: 'private',
    },
  },
  modules: [
    {
      id: 'onebotHttp',
      title: 'OneBot HTTP',
      description: '连接到 OneBot 11 HTTP API',
      enabledByDefault: true,
      capabilities: {
        supportsConnectionTest: true,
        supportsMessaging: true,
      },
      fields: [
        { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'http://127.0.0.1:3000' },
        { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Optional' },
        {
          key: 'targetType',
          label: 'Default Target Type',
          type: 'select',
          required: true,
          options: [
            { value: 'private', label: 'Private' },
            { value: 'group', label: 'Group' },
          ],
        },
      ],
    },
  ],
  capabilities: {
    supportsConnectionTest: true,
    supportsMessaging: true,
  },

  validateConfig(config: unknown): { valid: true; config: Record<string, unknown> } | { valid: false; error: string } {
    const result = OneBotConfigSchema.safeParse(config);
    if (!result.success) {
      return { valid: false, error: result.error.errors.map((error) => error.message).join(', ') };
    }

    return {
      valid: true,
      config: {
        onebotHttp: {
          ...result.data.onebotHttp,
          baseUrl: normalizeOneBotBaseUrl(result.data.onebotHttp.baseUrl.trim()),
          accessToken: result.data.onebotHttp.accessToken.trim(),
        },
      },
    };
  },

  validateCredentials(credentials: unknown): { valid: true; credentials: string } | { valid: false; error: string } {
    if (credentials === undefined || credentials === null || credentials === '') {
      return { valid: true, credentials: '' };
    }
    if (typeof credentials !== 'string') {
      return { valid: false, error: 'Credentials must be a string' };
    }
    return { valid: true, credentials };
  },

  async getAccessToken(): Promise<AccessToken | null> {
    return null;
  },

  async testConnection(_credentials: string, config: Record<string, unknown>): Promise<ConnectionTestResult> {
    const parsed = parseOneBotConfig(config);

    try {
      const response = await fetch(`${normalizeOneBotBaseUrl(parsed.onebotHttp.baseUrl)}/get_status`, {
        method: 'GET',
        headers: buildOneBotHeaders(parsed.onebotHttp.accessToken),
      });

      if (!response.ok) {
        return { success: false, error: `OneBot request failed: ${response.status}` };
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        success: true,
        info: {
          activeModule: 'onebotHttp',
          response: data,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async sendMessage(
    _credentials: string,
    config: Record<string, unknown>,
    target: string,
    message: unknown
  ): Promise<SendMessageResult | null> {
    const parsed = parseOneBotConfig(config);
    const parsedMessage = OneBotMessageSchema.parse(message);
    const endpoint = parsed.onebotHttp.targetType === 'group' ? 'send_group_msg' : 'send_private_msg';
    const targetKey = parsed.onebotHttp.targetType === 'group' ? 'group_id' : 'user_id';
    const normalizedTarget = /^\d+$/.test(target) ? Number(target) : target;

    try {
      const response = await fetch(`${normalizeOneBotBaseUrl(parsed.onebotHttp.baseUrl)}/${endpoint}`, {
        method: 'POST',
        headers: buildOneBotHeaders(parsed.onebotHttp.accessToken),
        body: JSON.stringify({
          [targetKey]: normalizedTarget,
          message: parsedMessage.content ?? '',
        }),
      });

      if (!response.ok) {
        logger.error('OneBot send message failed', undefined, {
          status: response.status,
        });
        return null;
      }

      const data = await response.json() as { data?: { message_id?: number | string } };
      return {
        messageId: String(data.data?.message_id ?? ''),
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to send OneBot message', error);
      return null;
    }
  },

  async getMetadata(): Promise<Record<string, unknown>> {
    return {
      apiBase: 'OneBot HTTP',
      availableModules: this.modules,
    };
  },
};
