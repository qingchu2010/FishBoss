import {
  isAdminInitialized,
  loadAdmin,
  createAdmin,
  updateAdminPassword,
  saveAdmin,
  loadSession,
  saveSession,
  deleteSession,
  deleteAllSessionsExcept,
  cleanupExpiredSessions,
} from './repository.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  generateSessionId,
  hashSessionId,
  hashUserAgent,
  calculateExpiryDates,
  refreshSessionExpiry,
  isIdleExpired,
  isAbsoluteExpired,
  isUserAgentMatch,
  setSessionCookie,
  clearSessionCookie,
  type SessionData,
} from './session.js';
import type { FastifyReply } from 'fastify';
import { getLogger } from '../../server/logging/index.js';

const logger = getLogger();

export enum AuthErrorCode {
  AUTH_SETUP_REQUIRED = 'AUTH_SETUP_REQUIRED',
  AUTH_ALREADY_INITIALIZED = 'AUTH_ALREADY_INITIALIZED',
  AUTH_BOOTSTRAP_FORBIDDEN = 'AUTH_BOOTSTRAP_FORBIDDEN',
  AUTH_BOOTSTRAP_TOKEN_REQUIRED = 'AUTH_BOOTSTRAP_TOKEN_REQUIRED',
  AUTH_BOOTSTRAP_TOKEN_INVALID = 'AUTH_BOOTSTRAP_TOKEN_INVALID',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_DISABLED = 'AUTH_ACCOUNT_DISABLED',
  AUTH_SESSION_MISSING = 'AUTH_SESSION_MISSING',
  AUTH_SESSION_INVALID = 'AUTH_SESSION_INVALID',
  AUTH_SESSION_IDLE_EXPIRED = 'AUTH_SESSION_IDLE_EXPIRED',
  AUTH_SESSION_ABSOLUTE_EXPIRED = 'AUTH_SESSION_ABSOLUTE_EXPIRED',
  AUTH_USER_AGENT_MISMATCH = 'AUTH_USER_AGENT_MISMATCH',
  AUTH_PASSWORD_CONFIRM_MISMATCH = 'AUTH_PASSWORD_CONFIRM_MISMATCH',
  AUTH_PASSWORD_POLICY_VIOLATION = 'AUTH_PASSWORD_POLICY_VIOLATION',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

export function isLocalhost(ip: string | undefined): boolean {
  if (!ip) return true;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function isBootstrapAllowed(ip: string | undefined): boolean {
  const localhostOnly = process.env.AUTH_BOOTSTRAP_LOCALHOST_ONLY ?? 'true';
  if (localhostOnly === 'false') return true;
  return isLocalhost(ip);
}

export function validateBootstrapToken(token: string | undefined): boolean {
  const expectedToken = process.env.BOOTSTRAP_TOKEN;
  if (!expectedToken) return true;
  if (!token) return false;
  return token === expectedToken;
}

export function isSetupRequired(): boolean {
  return !isAdminInitialized();
}

export interface StatusResult {
  setupRequired: boolean;
  authenticated: boolean;
  user: { id: string; username: string; displayName: string } | null;
}

export async function getStatus(): Promise<StatusResult> {
  cleanupExpiredSessions();
  const initialized = isAdminInitialized();
  if (!initialized) {
    return { setupRequired: true, authenticated: false, user: null };
  }
  return { setupRequired: false, authenticated: false, user: null };
}

export async function getStatusWithSession(
  sessionId: string,
  userAgent: string
): Promise<StatusResult> {
  cleanupExpiredSessions();
  const initialized = isAdminInitialized();
  if (!initialized) {
    return { setupRequired: true, authenticated: false, user: null };
  }
  const session = validateSession(sessionId, userAgent);
  if ('code' in session) {
    return { setupRequired: false, authenticated: false, user: null };
  }
  const admin = loadAdmin();
  return {
    setupRequired: false,
    authenticated: true,
    user: {
      id: session.userId,
      username: session.username,
      displayName: admin?.displayName ?? session.username,
    },
  };
}

export interface BootstrapResult {
  user: { id: string; username: string; displayName: string };
}

export async function bootstrap(
  username: string,
  displayName: string,
  password: string,
  bootstrapToken: string | undefined,
  ip: string | undefined,
  userAgent: string,
  reply: FastifyReply
): Promise<BootstrapResult | AuthError> {
  if (isAdminInitialized()) {
    return { code: AuthErrorCode.AUTH_ALREADY_INITIALIZED, message: 'System already initialized' };
  }
  if (!isBootstrapAllowed(ip)) {
    return { code: AuthErrorCode.AUTH_BOOTSTRAP_FORBIDDEN, message: 'Bootstrap only allowed from localhost' };
  }
  if (!validateBootstrapToken(bootstrapToken)) {
    const expectedToken = process.env.BOOTSTRAP_TOKEN;
    if (expectedToken && !bootstrapToken) {
      return { code: AuthErrorCode.AUTH_BOOTSTRAP_TOKEN_REQUIRED, message: 'Bootstrap token required' };
    }
    return { code: AuthErrorCode.AUTH_BOOTSTRAP_TOKEN_INVALID, message: 'Invalid bootstrap token' };
  }
  const passwordHash = await hashPassword(password);
  const admin = createAdmin(username, displayName, passwordHash);
  logger.info('Admin bootstrap successful', { username, ip });
  const session = createSession(admin.id, admin.username, userAgent, ip);
  setSessionCookie(reply, session);
  return {
    user: {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
    },
  };
}

export interface LoginResult {
  user: { id: string; username: string; displayName: string };
}

export async function login(
  username: string,
  password: string,
  ip: string | undefined,
  userAgent: string,
  reply: FastifyReply
): Promise<LoginResult | AuthError> {
  const admin = loadAdmin();
  if (!admin) {
    logger.warn('Login failed: no admin', { username, ip });
    return { code: AuthErrorCode.AUTH_INVALID_CREDENTIALS, message: 'Invalid username or password' };
  }
  if (admin.username !== username) {
    logger.warn('Login failed: username mismatch', { username, ip });
    return { code: AuthErrorCode.AUTH_INVALID_CREDENTIALS, message: 'Invalid username or password' };
  }
  if (admin.disabled) {
    logger.warn('Login failed: account disabled', { username, ip });
    return { code: AuthErrorCode.AUTH_ACCOUNT_DISABLED, message: 'Account is disabled' };
  }
  const validPassword = await verifyPassword(password, admin.passwordHash);
  if (!validPassword) {
    logger.warn('Login failed: invalid password', { username, ip });
    return { code: AuthErrorCode.AUTH_INVALID_CREDENTIALS, message: 'Invalid username or password' };
  }
  logger.info('Login successful', { username, ip });
  const session = createSession(admin.id, admin.username, userAgent, ip);
  setSessionCookie(reply, session);
  return {
    user: {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
    },
  };
}

export function logout(sessionId: string, reply: FastifyReply): void {
  deleteSession(sessionId);
  clearSessionCookie(reply);
  logger.info('Logout successful', { sessionIdHash: hashSessionId(sessionId) });
}

export interface MeResult {
  user: { id: string; username: string; displayName: string };
}

export function me(
  sessionId: string,
  userAgent: string
): MeResult | AuthError {
  const session = validateSession(sessionId, userAgent);
  if ('code' in session) {
    return session;
  }
  const updatedExpiry = refreshSessionExpiry();
  session.lastSeenAt = new Date().toISOString();
  session.idleExpiresAt = updatedExpiry.idleExpiresAt;
  saveSession(sessionId, session);
  const admin = loadAdmin();
  const displayName = admin?.displayName ?? session.username;
  return {
    user: {
      id: session.userId,
      username: session.username,
      displayName,
    },
  };
}

export interface ChangePasswordResult {
  success: boolean;
}

export async function changePassword(
  sessionId: string,
  currentPassword: string,
  newPassword: string,
  userAgent: string
): Promise<ChangePasswordResult | AuthError> {
  const sessionValidation = validateSession(sessionId, userAgent);
  if ('code' in sessionValidation) {
    return sessionValidation;
  }
  const admin = loadAdmin();
  if (!admin) {
    return { code: AuthErrorCode.AUTH_SETUP_REQUIRED, message: 'System not initialized' };
  }
  const validCurrent = await verifyPassword(currentPassword, admin.passwordHash);
  if (!validCurrent) {
    return { code: AuthErrorCode.AUTH_INVALID_CREDENTIALS, message: 'Current password is incorrect' };
  }
  const newHash = await hashPassword(newPassword);
  updateAdminPassword(newHash);
  deleteAllSessionsExcept(sessionId);
  logger.info('Password changed successfully', { username: admin.username });
  return { success: true };
}

function createSession(
  userId: string,
  username: string,
  userAgent: string,
  ip: string | undefined
): string {
  const sessionId = generateSessionId();
  const { idleExpiresAt, absoluteExpiresAt } = calculateExpiryDates();
  const now = new Date().toISOString();
  const session: SessionData = {
    sessionIdHash: hashSessionId(sessionId),
    userId,
    username,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
    userAgentHash: hashUserAgent(userAgent),
    lastIp: ip ?? '',
  };
  saveSession(sessionId, session);
  return sessionId;
}

export function validateSession(
  sessionId: string,
  userAgent: string
): SessionData | AuthError {
  const session = loadSession(sessionId);
  if (!session) {
    return { code: AuthErrorCode.AUTH_SESSION_MISSING, message: 'Session not found' };
  }
  if (isIdleExpired(session)) {
    deleteSession(sessionId);
    return { code: AuthErrorCode.AUTH_SESSION_IDLE_EXPIRED, message: 'Session idle expired' };
  }
  if (isAbsoluteExpired(session)) {
    deleteSession(sessionId);
    return { code: AuthErrorCode.AUTH_SESSION_ABSOLUTE_EXPIRED, message: 'Session absolute expired' };
  }
  const userAgentHash = hashUserAgent(userAgent);
  if (!isUserAgentMatch(session, userAgentHash)) {
    return { code: AuthErrorCode.AUTH_USER_AGENT_MISMATCH, message: 'User agent mismatch' };
  }
  const admin = loadAdmin();
  if (!admin || admin.disabled) {
    deleteSession(sessionId);
    return { code: AuthErrorCode.AUTH_ACCOUNT_DISABLED, message: 'Account is disabled' };
  }
  return session;
}

export function setAdminDisabled(disabled: boolean): boolean {
  const admin = loadAdmin();
  if (!admin) {
    return false;
  }
  admin.disabled = disabled;
  admin.updatedAt = new Date().toISOString();
  saveAdmin(admin);
  return true;
}

export function refreshSession(sessionId: string): void {
  const session = loadSession(sessionId);
  if (!session) return;
  const updatedExpiry = refreshSessionExpiry();
  session.lastSeenAt = new Date().toISOString();
  session.idleExpiresAt = updatedExpiry.idleExpiresAt;
  saveSession(sessionId, session);
}
