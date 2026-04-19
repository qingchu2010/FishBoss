import { createHash, randomBytes } from 'crypto';
import type { FastifyReply } from 'fastify';

export const SESSION_ID_SIZE = 32;
export const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'fishboss_session';

export interface SessionData {
  sessionIdHash: string;
  userId: string;
  username: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  userAgentHash: string;
  lastIp: string;
}

export function generateSessionId(): string {
  return randomBytes(SESSION_ID_SIZE).toString('hex');
}

export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

export function hashUserAgent(userAgent: string): string {
  return createHash('sha256').update(userAgent).digest('hex');
}

export function getIdleTimeoutMs(): number {
  const days = parseInt(process.env.AUTH_IDLE_TIMEOUT_DAYS ?? '7', 10);
  return days * 24 * 60 * 60 * 1000;
}

export function getAbsoluteTimeoutMs(): number {
  const days = parseInt(process.env.AUTH_ABSOLUTE_TIMEOUT_DAYS ?? '30', 10);
  return days * 24 * 60 * 60 * 1000;
}

export function calculateExpiryDates(): { idleExpiresAt: string; absoluteExpiresAt: string } {
  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + getIdleTimeoutMs());
  const absoluteExpiresAt = new Date(now.getTime() + getAbsoluteTimeoutMs());
  return {
    idleExpiresAt: idleExpiresAt.toISOString(),
    absoluteExpiresAt: absoluteExpiresAt.toISOString(),
  };
}

export function refreshSessionExpiry(): { idleExpiresAt: string } {
  const idleExpiresAt = new Date(Date.now() + getIdleTimeoutMs());
  return {
    idleExpiresAt: idleExpiresAt.toISOString(),
  };
}

export function isSessionExpired(session: SessionData): boolean {
  const now = Date.now();
  const idleExpires = new Date(session.idleExpiresAt).getTime();
  const absoluteExpires = new Date(session.absoluteExpiresAt).getTime();
  return now > idleExpires || now > absoluteExpires;
}

export function isIdleExpired(session: SessionData): boolean {
  return Date.now() > new Date(session.idleExpiresAt).getTime();
}

export function isAbsoluteExpired(session: SessionData): boolean {
  return Date.now() > new Date(session.absoluteExpiresAt).getTime();
}

export function isUserAgentMatch(session: SessionData, userAgentHash: string): boolean {
  return session.userAgentHash === userAgentHash;
}

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  secure: boolean;
  maxAge: number;
}

export function getCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(getAbsoluteTimeoutMs() / 1000),
  };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  const options = getCookieOptions();
  reply.setCookie(COOKIE_NAME, sessionId, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    path: options.path,
    secure: options.secure,
    maxAge: options.maxAge,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, {
    path: '/',
  });
}
