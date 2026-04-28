import type {
  PlatformAdapter,
  AccessToken,
  ConnectionTestResult,
  SendMessageResult,
} from '../schema.js';
import { z } from 'zod';
import { getLogger } from '../../../server/logging/index.js';

const logger = getLogger();

const QQBotTypeSchema = z.enum(['c2c', 'group', 'guild']);

const QQOpenPlatformModuleSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().default(''),
  appSecret: z.string().default(''),
  botType: QQBotTypeSchema.default('c2c'),
  replyAgentId: z.string().default(''),
  replyProviderId: z.string().default(''),
  replyModelId: z.string().default(''),
});

const QQConfigSchema = z.object({
  qqOpenPlatform: QQOpenPlatformModuleSchema.default({
    enabled: false,
    appId: '',
    appSecret: '',
    botType: 'c2c',
    replyAgentId: '',
    replyProviderId: '',
    replyModelId: '',
  }),
}).superRefine((value, ctx) => {
  if (value.qqOpenPlatform.enabled) {
    if (!value.qqOpenPlatform.appId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'QQ Open Platform appId is required',
        path: ['qqOpenPlatform', 'appId'],
      });
    }
    if (!value.qqOpenPlatform.appSecret.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'QQ Open Platform appSecret is required',
        path: ['qqOpenPlatform', 'appSecret'],
      });
    }
  }
});

const QQMessageSchema = z.object({
  content: z.string().optional(),
  msg_type: z.number().default(0),
  markdown: z.record(z.unknown()).optional(),
  ark: z.record(z.unknown()).optional(),
  media: z.record(z.unknown()).optional(),
  event_id: z.string().optional(),
  message_id: z.string().optional(),
  msg_id: z.string().optional(),
  msg_seq: z.number().optional(),
});

const QQ_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const QQ_API_BASE = 'https://api.sgroup.qq.com';
const QQ_GATEWAY_BOT_URL = `${QQ_API_BASE}/gateway/bot`;

interface QQTokenData {
  access_token: string;
  expires_in: number;
}

export const QQStreamInputMode = {
  REPLACE: 'replace',
} as const;

export const QQStreamInputState = {
  GENERATING: 1,
  DONE: 10,
} as const;

export const QQStreamContentType = {
  MARKDOWN: 'markdown',
} as const;

export interface QQStreamMessageRequest {
  input_mode: (typeof QQStreamInputMode)[keyof typeof QQStreamInputMode];
  input_state: (typeof QQStreamInputState)[keyof typeof QQStreamInputState];
  content_type: (typeof QQStreamContentType)[keyof typeof QQStreamContentType];
  content_raw: string;
  event_id: string;
  msg_id: string;
  msg_seq: number;
  index: number;
  stream_msg_id?: string;
}

export interface QQStreamMessageResponse {
  code?: number;
  message?: string;
  id?: string;
  timestamp?: string | number;
}

function parseQQConfig(config: Record<string, unknown>) {
  return QQConfigSchema.parse(config);
}

export async function sendQQC2CStreamMessage(
  config: Record<string, unknown>,
  openid: string,
  request: QQStreamMessageRequest,
): Promise<QQStreamMessageResponse> {
  const tokenData = await qqAdapter.getAccessToken('', config);
  if (!tokenData) {
    throw new Error('Failed to obtain QQ Open Platform access token');
  }

  const response = await fetch(`${QQ_API_BASE}/v2/users/${openid}/stream_messages`, {
    method: 'POST',
    headers: {
      Authorization: `QQBot ${tokenData.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_mode: request.input_mode,
      input_state: request.input_state,
      content_type: request.content_type,
      content_raw: request.content_raw,
      event_id: request.event_id,
      msg_id: request.msg_id,
      msg_seq: request.msg_seq,
      index: request.index,
      ...(request.stream_msg_id ? { stream_msg_id: request.stream_msg_id } : {}),
    }),
  });

  const data = await response.json() as QQStreamMessageResponse;
  if (!response.ok) {
    throw new Error(data.message ? `QQ stream message failed: ${response.status} (${data.message})` : `QQ stream message failed: ${response.status}`);
  }
  if (typeof data.code === 'number' && data.code !== 0) {
    throw new Error(data.message ? `QQ stream message API error ${data.code}: ${data.message}` : `QQ stream message API error ${data.code}`);
  }

  return data;
}

export const qqAdapter: PlatformAdapter = {
  platformType: 'qq',
  displayName: 'QQ',
  defaultConfig: {
    qqOpenPlatform: {
      enabled: false,
      appId: '',
      appSecret: '',
      botType: 'c2c',
      replyAgentId: '',
      replyProviderId: '',
      replyModelId: '',
    },
  },
  modules: [
    {
      id: 'qqOpenPlatform',
      title: 'QQ Open Platform',
      description: 'QQ 官方开放平台机器人接口',
      enabledByDefault: true,
      capabilities: {
        supportsConnectionTest: true,
        supportsMessaging: true,
      },
      fields: [
        { key: 'appId', label: 'App ID', type: 'text', required: true, placeholder: '1024xxxx' },
        { key: 'appSecret', label: 'App Secret', type: 'password', required: true, placeholder: 'Enter app secret' },
        {
          key: 'botType',
          label: 'Bot Type',
          type: 'select',
          required: true,
          options: [
            { value: 'c2c', label: 'Direct Message' },
            { value: 'group', label: 'Group' },
            { value: 'guild', label: 'Guild Channel' },
          ],
        },
        { key: 'replyAgentId', label: 'Reply Agent ID', type: 'text', placeholder: 'Optional agent ID' },
        { key: 'replyProviderId', label: 'Reply Provider ID', type: 'text', placeholder: 'Optional provider ID override' },
        { key: 'replyModelId', label: 'Reply Model ID', type: 'text', placeholder: 'Optional model ID override' },
      ],
    },
  ],
  capabilities: {
    supportsConnectionTest: true,
    supportsMessaging: true,
  },

  validateConfig(config: unknown): { valid: true; config: Record<string, unknown> } | { valid: false; error: string } {
    const result = QQConfigSchema.safeParse(config);
    if (!result.success) {
      return { valid: false, error: result.error.errors.map((error) => error.message).join(', ') };
    }

    return {
      valid: true,
      config: {
        qqOpenPlatform: {
          ...result.data.qqOpenPlatform,
          appId: result.data.qqOpenPlatform.appId.trim(),
          appSecret: result.data.qqOpenPlatform.appSecret.trim(),
          replyAgentId: result.data.qqOpenPlatform.replyAgentId.trim(),
          replyProviderId: result.data.qqOpenPlatform.replyProviderId.trim(),
          replyModelId: result.data.qqOpenPlatform.replyModelId.trim(),
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

  async getAccessToken(_credentials: string, config: Record<string, unknown>): Promise<AccessToken | null> {
    try {
      const parsed = parseQQConfig(config);
      if (!parsed.qqOpenPlatform.enabled) {
        return null;
      }

      const response = await fetch(QQ_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: parsed.qqOpenPlatform.appId,
          clientSecret: parsed.qqOpenPlatform.appSecret,
        }),
      });

      if (!response.ok) {
        logger.error('QQ access token request failed', undefined, {
          status: response.status,
        });
        return null;
      }

      const data = await response.json() as QQTokenData & { code?: number };
      if (data.code !== 0 && data.code !== undefined) {
        logger.error('QQ access token error', undefined, { code: data.code });
        return null;
      }

      return {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
    } catch (error) {
      logger.error('Failed to fetch QQ access token', error);
      return null;
    }
  },

  async testConnection(credentials: string, config: Record<string, unknown>): Promise<ConnectionTestResult> {
    const parsed = parseQQConfig(config);

    if (parsed.qqOpenPlatform.enabled) {
      const tokenData = await this.getAccessToken(credentials, config);
      if (!tokenData) {
        return { success: false, error: 'Failed to obtain QQ Open Platform access token' };
      }

      try {
        const response = await fetch(QQ_GATEWAY_BOT_URL, {
          method: 'GET',
          headers: { Authorization: `QQBot ${tokenData.token}` },
        });

        if (!response.ok) {
          const responseText = await response.text();
          const details = responseText.trim();
          return {
            success: false,
            error: details
              ? `QQ Open Platform request failed: ${response.status} (${details.slice(0, 200)})`
              : `QQ Open Platform request failed: ${response.status}`,
          };
        }

        const data = await response.json() as {
          url?: string;
          shards?: number;
          session_start_limit?: Record<string, unknown>;
        };
        return {
          success: true,
          info: {
            activeModule: 'qqOpenPlatform',
            gatewayUrl: data.url,
            shards: data.shards,
            sessionStartLimit: data.session_start_limit,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    return { success: false, error: 'No enabled module available' };
  },

  async sendMessage(
    credentials: string,
    config: Record<string, unknown>,
    target: string,
    message: unknown
  ): Promise<SendMessageResult | null> {
    const parsed = parseQQConfig(config);

    if (parsed.qqOpenPlatform.enabled) {
      const tokenData = await this.getAccessToken(credentials, config);
      if (!tokenData) {
        return null;
      }

      const parsedMessage = QQMessageSchema.parse(message);

      let url: string;
      switch (parsed.qqOpenPlatform.botType) {
        case 'group':
          url = `${QQ_API_BASE}/v2/groups/${target}/messages`;
          break;
        case 'guild':
          url = `${QQ_API_BASE}/channels/${target}/messages`;
          break;
        case 'c2c':
        default:
          url = `${QQ_API_BASE}/v2/users/${target}/messages`;
          break;
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `QQBot ${tokenData.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: parsedMessage.content,
            msg_type: parsedMessage.msg_type,
            markdown: parsedMessage.markdown,
            ark: parsedMessage.ark,
            media: parsedMessage.media,
            event_id: parsedMessage.event_id,
            message_reference: parsedMessage.message_id ? { message_id: parsedMessage.message_id } : undefined,
            msg_id: parsedMessage.msg_id,
            msg_seq: parsedMessage.msg_seq,
          }),
        });

        if (!response.ok) {
          const responseText = await response.text();
          logger.error('QQ send message failed', undefined, {
            status: response.status,
            response: responseText.slice(0, 500),
          });
          return null;
        }

        const data = await response.json() as { id?: string; timestamp?: number };
        return {
          messageId: data.id ?? '',
          timestamp: data.timestamp ?? Date.now(),
        };
      } catch (error) {
        logger.error('Failed to send QQ message', error);
        return null;
      }
    }

    return null;
  },

  async getMetadata(): Promise<Record<string, unknown>> {
    return {
      supportedMessageTypes: [
        { type: 0, name: 'Text' },
        { type: 2, name: 'Markdown' },
        { type: 3, name: 'Ark' },
        { type: 7, name: 'Media' },
      ],
      apiBase: QQ_API_BASE,
      availableModules: this.modules,
    };
  },
};
