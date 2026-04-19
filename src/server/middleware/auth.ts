import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { UnauthorizedError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';
import { validateSession, refreshSession, AuthErrorCode } from '../../modules/auth/service.js';
import { COOKIE_NAME } from '../../modules/auth/session.js';
import { loadAdmin } from '../../modules/auth/repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: {
      id: string;
      username: string;
      displayName: string;
    };
    sessionId?: string;
  }
}

export interface AuthOptions {
  excludePaths?: string[];
}

function getSessionId(request: FastifyRequest): string | undefined {
  return request.cookies[COOKIE_NAME];
}

function getUserAgent(request: FastifyRequest): string {
  return request.headers['user-agent'] ?? '';
}

export function createAuthMiddleware(options: AuthOptions = {}) {
  const { excludePaths = [] } = options;
  const logger = getLogger();

  function sendAuthError(reply: FastifyReply, code: string, message: string): void {
    reply.status(401).send({
      error: { code, message },
    });
  }

  return function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    const urlParts = request.url.split('?');
    const fullPath = urlParts[0] ?? '/';

    if (excludePaths.some((path) => fullPath === path || fullPath.startsWith(path + '/'))) {
      return done();
    }

    const sessionId = getSessionId(request);
    if (!sessionId) {
      logger.warn('Missing session cookie', { path: fullPath });
      sendAuthError(reply, AuthErrorCode.AUTH_SESSION_MISSING, 'Authentication required');
      return done();
    }

    const userAgent = getUserAgent(request);
    const result = validateSession(sessionId, userAgent);

    if ('code' in result) {
      logger.warn('Session validation failed', { path: fullPath, code: result.code });
      sendAuthError(reply, result.code, result.message);
      return done();
    }

    request.sessionUser = {
      id: result.userId,
      username: result.username,
      displayName: loadAdmin()?.displayName ?? result.username,
    };
    request.sessionId = sessionId;

    refreshSession(sessionId);

    return done();
  };
}

export function verifyAuth(request: FastifyRequest): void {
  if (!request.sessionUser) {
    throw new UnauthorizedError('Authentication required');
  }
}

export function getCurrentUser(request: FastifyRequest): { id: string; username: string; displayName: string } | null {
  return request.sessionUser ?? null;
}
