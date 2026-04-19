import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  bootstrapRequestSchema,
  loginRequestSchema,
  changePasswordRequestSchema,
  type BootstrapRequest,
  type LoginRequest,
  type ChangePasswordRequest,
} from './schema.js';
import {
  getStatus,
  getStatusWithSession,
  bootstrap,
  login,
  logout,
  me,
  changePassword,
  AuthErrorCode,
  validateSession,
} from './service.js';
import { COOKIE_NAME, clearSessionCookie } from './session.js';

const AUTH_RATE_LIMIT_ERROR = {
  error: {
    code: AuthErrorCode.AUTH_RATE_LIMITED,
    message: 'Too many authentication attempts',
  },
};

function getClientIp(request: FastifyRequest): string | undefined {
  return request.ip;
}

function getUserAgent(request: FastifyRequest): string {
  return request.headers['user-agent'] ?? '';
}

function getSessionId(request: FastifyRequest): string | undefined {
  return request.cookies[COOKIE_NAME];
}

function sendError(reply: FastifyReply, code: string, message: string, statusCode: number): void {
  reply.status(statusCode).send({
    error: { code, message },
  });
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/status', async (request, reply) => {
    const sessionId = getSessionId(request);
    const userAgent = getUserAgent(request);
    let result;
    if (sessionId) {
      result = await getStatusWithSession(sessionId, userAgent);
    } else {
      result = await getStatus();
    }
    return reply.send(result);
  });

  fastify.post('/bootstrap', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: 10 * 60 * 1000,
        errorResponseBuilder: () => AUTH_RATE_LIMIT_ERROR,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as BootstrapRequest | undefined;
    const validation = bootstrapRequestSchema.safeParse(body);
    if (!validation.success) {
      const issues = validation.error.issues;
      const message = issues.map((i) => i.message).join('; ');
      return sendError(reply, 'BAD_REQUEST', message, 400);
    }
    const { username, displayName, password, bootstrapToken } = validation.data;
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);
    const result = await bootstrap(username, displayName, password, bootstrapToken, ip, userAgent, reply);
    if ('code' in result) {
      let statusCode = 400;
      if (result.code === AuthErrorCode.AUTH_ALREADY_INITIALIZED) statusCode = 409;
      if (result.code === AuthErrorCode.AUTH_BOOTSTRAP_FORBIDDEN) statusCode = 403;
      if (result.code === AuthErrorCode.AUTH_BOOTSTRAP_TOKEN_REQUIRED) statusCode = 401;
      if (result.code === AuthErrorCode.AUTH_BOOTSTRAP_TOKEN_INVALID) statusCode = 401;
      return sendError(reply, result.code, result.message, statusCode);
    }
    return reply.status(201).send({ user: result.user });
  });

  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 60 * 1000,
        errorResponseBuilder: () => AUTH_RATE_LIMIT_ERROR,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as LoginRequest | undefined;
    const validation = loginRequestSchema.safeParse(body);
    if (!validation.success) {
      const issues = validation.error.issues;
      const message = issues.map((i) => i.message).join('; ');
      return sendError(reply, 'BAD_REQUEST', message, 400);
    }
    const { username, password } = validation.data;
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);
    const result = await login(username, password, ip, userAgent, reply);
    if ('code' in result) {
      let statusCode = 401;
      if (result.code === AuthErrorCode.AUTH_ACCOUNT_DISABLED) statusCode = 423;
      return sendError(reply, result.code, result.message, statusCode);
    }
    return reply.send({ user: result.user });
  });

  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = getSessionId(request);
    if (sessionId) {
      const userAgent = getUserAgent(request);
      const validation = validateSession(sessionId, userAgent);
      if (!('code' in validation)) {
        logout(sessionId, reply);
      } else {
        clearSessionCookie(reply);
      }
    } else {
      clearSessionCookie(reply);
    }
    return reply.send({ success: true });
  });

  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.sessionId ?? getSessionId(request);
    if (!sessionId) {
      return sendError(reply, 'AUTH_SESSION_MISSING', 'Not authenticated', 401);
    }
    const userAgent = getUserAgent(request);
    const result = me(sessionId, userAgent);
    if ('code' in result) {
      return sendError(reply, result.code, result.message, 401);
    }
    return reply.send({ user: result.user });
  });

  fastify.post('/change-password', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 10 * 60 * 1000,
        errorResponseBuilder: () => AUTH_RATE_LIMIT_ERROR,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.sessionId ?? getSessionId(request);
    if (!sessionId) {
      return sendError(reply, 'AUTH_SESSION_MISSING', 'Not authenticated', 401);
    }
    const body = request.body as ChangePasswordRequest | undefined;
    const validation = changePasswordRequestSchema.safeParse(body);
    if (!validation.success) {
      const issues = validation.error.issues;
      const message = issues.map((i) => i.message).join('; ');
      return sendError(reply, 'BAD_REQUEST', message, 400);
    }
    const { currentPassword, newPassword } = validation.data;
    const userAgent = getUserAgent(request);
    const result = await changePassword(sessionId, currentPassword, newPassword, userAgent);
    if ('code' in result) {
      return sendError(reply, result.code, result.message, 401);
    }
    return reply.send({ success: true });
  });
}
