import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { getStoragePaths } from '../../storage/index.js';
import type { SessionData } from './session.js';
import { hashSessionId } from './session.js';

export interface AdminData {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt: string;
}

function getAuthDir(): string {
  const storage = getStoragePaths();
  const authDir = join(storage.auth);
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }
  return authDir;
}

function getSessionsDir(): string {
  const authDir = getAuthDir();
  const sessionsDir = join(authDir, 'sessions');
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  return sessionsDir;
}

function getAdminFilePath(): string {
  return join(getAuthDir(), 'admin.json');
}

function getSessionFilePath(sessionIdHash: string): string {
  return join(getSessionsDir(), `${sessionIdHash}.json`);
}

export function isAdminInitialized(): boolean {
  const adminPath = getAdminFilePath();
  return existsSync(adminPath);
}

export function loadAdmin(): AdminData | null {
  const adminPath = getAdminFilePath();
  if (!existsSync(adminPath)) {
    return null;
  }
  try {
    const data = readFileSync(adminPath, 'utf-8');
    return JSON.parse(data) as AdminData;
  } catch (error) {
    console.error('Failed to load admin data', error);
    return null;
  }
}

export function saveAdmin(admin: AdminData): void {
  const adminPath = getAdminFilePath();
  writeFileSync(adminPath, JSON.stringify(admin, null, 2), 'utf-8');
}

export function createAdmin(
  username: string,
  displayName: string,
  passwordHash: string
): AdminData {
  const now = new Date().toISOString();
  const admin: AdminData = {
    id: `admin_${Date.now()}`,
    username,
    displayName,
    passwordHash,
    disabled: false,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
  };
  saveAdmin(admin);
  return admin;
}

export function updateAdminPassword(passwordHash: string): AdminData | null {
  const admin = loadAdmin();
  if (!admin) {
    return null;
  }
  const now = new Date().toISOString();
  admin.passwordHash = passwordHash;
  admin.passwordChangedAt = now;
  admin.updatedAt = now;
  saveAdmin(admin);
  return admin;
}

export function loadSession(sessionId: string): SessionData | null {
  const sessionIdHash = hashSessionId(sessionId);
  const sessionPath = getSessionFilePath(sessionIdHash);
  if (!existsSync(sessionPath)) {
    return null;
  }
  try {
    const data = readFileSync(sessionPath, 'utf-8');
    return JSON.parse(data) as SessionData;
  } catch (error) {
    console.error('Failed to load session data', error);
    return null;
  }
}

export function saveSession(sessionId: string, session: SessionData): void {
  const sessionIdHash = hashSessionId(sessionId);
  const sessionPath = getSessionFilePath(sessionIdHash);
  writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

export function deleteSession(sessionId: string): void {
  const sessionIdHash = hashSessionId(sessionId);
  const sessionPath = getSessionFilePath(sessionIdHash);
  if (existsSync(sessionPath)) {
    unlinkSync(sessionPath);
  }
}

export function deleteAllSessionsExcept(sessionId: string): void {
  const sessionsDir = getSessionsDir();
  const currentSessionHash = hashSessionId(sessionId);
  const files = readdirSync(sessionsDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (file.replace('.json', '') === currentSessionHash) continue;
    try {
      unlinkSync(join(sessionsDir, file));
    } catch (error) {
      console.error('Failed to delete session file', error);
    }
  }
}

export function deleteAllSessions(): void {
  const sessionsDir = getSessionsDir();
  const files = readdirSync(sessionsDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      unlinkSync(join(sessionsDir, file));
    } catch (error) {
      console.error('Failed to delete session file', error);
    }
  }
}

export function cleanupExpiredSessions(): { deleted: number } {
  const sessionsDir = getSessionsDir();
  const files = readdirSync(sessionsDir);
  let deleted = 0;
  const now = Date.now();
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = readFileSync(join(sessionsDir, file), 'utf-8');
      const session: SessionData = JSON.parse(data);
      const idleExpires = new Date(session.idleExpiresAt).getTime();
      const absoluteExpires = new Date(session.absoluteExpiresAt).getTime();
      if (now > idleExpires || now > absoluteExpires) {
        unlinkSync(join(sessionsDir, file));
        deleted++;
      }
    } catch (error) {
      console.error('Failed to clean expired session', error);
    }
  }
  return { deleted };
}
