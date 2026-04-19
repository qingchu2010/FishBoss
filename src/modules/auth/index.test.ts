import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap } from '../../server/bootstrap/index.js';
import { resetConfig, parseTrustProxy } from '../../server/config/index.js';
import { registerAuthRoutes } from './index.js';
import { setAdminDisabled } from './service.js';

let tempRoot: string;
let previousRoot: string | undefined;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fishboss-auth-'));
  previousRoot = process.env.FISHBOSS_ROOT;
  process.env.FISHBOSS_ROOT = tempRoot;
  delete process.env.SERVER_SECRET;
  delete process.env.BOOTSTRAP_TOKEN;
  delete process.env.TRUST_PROXY;
  resetConfig();
});

afterEach(async () => {
  if (previousRoot === undefined) {
    delete process.env.FISHBOSS_ROOT;
  } else {
    process.env.FISHBOSS_ROOT = previousRoot;
  }
  delete process.env.TRUST_PROXY;
  resetConfig();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('auth routes', () => {
  it('GET /status returns setupRequired=true when not initialized', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const status = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/status',
    });

    expect(status.statusCode).toBe(200);
    const body = status.json() as { setupRequired: boolean; authenticated: boolean; user: null };
    expect(body.setupRequired).toBe(true);
    expect(body.authenticated).toBe(false);
    expect(body.user).toBeNull();
    await app.stop();
  });

  it('bootstrap creates admin.json and sets session cookie', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(bootstrapResult.statusCode).toBe(201);
    const body = bootstrapResult.json() as { user: { id: string; username: string; displayName: string } };
    expect(body.user.username).toBe('admin');
    expect(body.user.displayName).toBe('Admin User');

    const cookies = bootstrapResult.cookies;
    expect(cookies.some((c: { name: string }) => c.name === 'fishboss_session')).toBe(true);

    const adminPath = path.join(tempRoot, 'auth', 'admin.json');
    const adminData = JSON.parse(await fs.readFile(adminPath, 'utf-8'));
    expect(adminData.username).toBe('admin');
    expect(adminData.passwordHash).toBeTruthy();
    expect(adminData.passwordHash.startsWith('$argon2id$')).toBe(true);

    await app.stop();
  });

  it('bootstrap second call returns 409', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const secondBootstrap = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin2',
        displayName: 'Admin User 2',
        password: 'password456',
        confirmPassword: 'password456',
      },
    });

    expect(secondBootstrap.statusCode).toBe(409);
    const error = secondBootstrap.json() as { error: { code: string; message: string } };
    expect(error.error.code).toBe('AUTH_ALREADY_INITIALIZED');

    await app.stop();
  });

  it('login succeeds and sets session cookie', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const loginResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'password123',
      },
    });

    expect(loginResult.statusCode).toBe(200);
    const body = loginResult.json() as { user: { id: string; username: string; displayName: string } };
    expect(body.user.username).toBe('admin');

    const cookies = loginResult.cookies;
    expect(cookies.some((c: { name: string }) => c.name === 'fishboss_session')).toBe(true);

    await app.stop();
  });

  it('login with wrong password returns 401', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const loginResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'wrongpassword',
      },
    });

    expect(loginResult.statusCode).toBe(401);
    const error = loginResult.json() as { error: { code: string; message: string } };
    expect(error.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    await app.stop();
  });

  it('bootstrap rejects non-localhost requests', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      remoteAddress: '10.24.8.6',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(bootstrapResult.statusCode).toBe(403);
    const error = bootstrapResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_BOOTSTRAP_FORBIDDEN');
  });

  it('bootstrap rejects forwarded non-localhost when trust proxy is enabled', async () => {
    process.env.TRUST_PROXY = 'true';
    resetConfig();

    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      remoteAddress: '127.0.0.1',
      headers: {
        'x-forwarded-for': '10.55.1.9',
      },
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(bootstrapResult.statusCode).toBe(403);
    const error = bootstrapResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_BOOTSTRAP_FORBIDDEN');
  });

  it('unauthenticated access to business API returns 401', async () => {
    const app = await bootstrap({
      domains: [
        { prefix: '/api/auth', register: registerAuthRoutes },
        { prefix: '/api/system', register: async (f) => { f.get('/info', async () => ({ version: '1.0.0' })); } },
      ],
      skipAuth: false,
    });

    const systemResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/system/info',
    });

    expect(systemResult.statusCode).toBe(401);

    await app.stop();
  });

  it('authenticated access with valid cookie succeeds', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');

    const meResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    expect(meResult.statusCode).toBe(200);
    const body = meResult.json() as { user: { id: string; username: string; displayName: string } };
    expect(body.user.username).toBe('admin');

    await app.stop();
  });

  it('disabled admin invalidates existing session for /api/auth/me', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');
    expect(setAdminDisabled(true)).toBe(true);

    const meResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    expect(meResult.statusCode).toBe(401);
    const error = meResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('disabled admin invalidates existing session for business APIs', async () => {
    const app = await bootstrap({
      domains: [
        { prefix: '/api/auth', register: registerAuthRoutes },
        { prefix: '/api/system', register: async (f) => { f.get('/info', async () => ({ version: '1.0.0' })); } },
      ],
      skipAuth: false,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');
    expect(setAdminDisabled(true)).toBe(true);

    const systemResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/system/info',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    expect(systemResult.statusCode).toBe(401);
    const error = systemResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('logout invalidates session', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    const meResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    expect(meResult.statusCode).toBe(401);

    await app.stop();
  });

  it('change-password invalidates other sessions but keeps current session', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie1 = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');

    const loginResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'password123',
      },
    });

    const sessionCookie2 = loginResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      cookies: {
        fishboss_session: sessionCookie1?.value ?? '',
      },
      payload: {
        currentPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456',
      },
    });

    const meWithSession1 = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie1?.value ?? '',
      },
    });

    expect(meWithSession1.statusCode).toBe(200);

    const meWithSession2 = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie2?.value ?? '',
      },
    });

    expect(meWithSession2.statusCode).toBe(401);

    await app.stop();
  });

  it('change-password with wrong current password keeps authenticated session', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');

    const changePasswordResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
      payload: {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456',
      },
    });

    expect(changePasswordResult.statusCode).toBe(401);
    const changePasswordError = changePasswordResult.json() as { error: { code: string } };
    expect(changePasswordError.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const meResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    expect(meResult.statusCode).toBe(200);
  });

  it('login rate limit returns AUTH_RATE_LIMITED', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    for (let index = 0; index < 5; index += 1) {
      const result = await app.fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin',
          password: 'wrongpassword',
        },
      });
      expect(result.statusCode).toBe(401);
    }

    const limitedResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'wrongpassword',
      },
    });

    expect(limitedResult.statusCode).toBe(429);
    const error = limitedResult.json() as { error: { code: string; message: string } };
    expect(error.error.code).toBe('AUTH_RATE_LIMITED');
    expect(error.error.message).toBe('Too many authentication attempts');
  });

  it('logout then access returns 401', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const sessionCookie = bootstrapResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    const meResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        fishboss_session: sessionCookie?.value ?? '',
      },
    });

    expect(meResult.statusCode).toBe(401);

    await app.stop();
  });

  it('TRUST_PROXY=true rejects spoofed X-Forwarded-For: 127.0.0.1 from remote address', async () => {
    process.env.TRUST_PROXY = 'true';
    resetConfig();

    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      remoteAddress: '198.51.100.23',
      headers: {
        'x-forwarded-for': '127.0.0.1',
      },
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(bootstrapResult.statusCode).toBe(403);
    const error = bootstrapResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_BOOTSTRAP_FORBIDDEN');

    await app.stop();
  });

  it('TRUST_PROXY=true with trusted loopback proxy forwarding remote IP rejects bootstrap', async () => {
    process.env.TRUST_PROXY = 'true';
    resetConfig();

    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      remoteAddress: '127.0.0.1',
      headers: {
        'x-forwarded-for': '10.55.1.9',
      },
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(bootstrapResult.statusCode).toBe(403);
    const error = bootstrapResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_BOOTSTRAP_FORBIDDEN');

    await app.stop();
  });

  it('TRUST_PROXY=true allows localhost bootstrap when no forwarded header', async () => {
    process.env.TRUST_PROXY = 'true';
    resetConfig();

    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const bootstrapResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      remoteAddress: '127.0.0.1',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(bootstrapResult.statusCode).toBe(201);

    await app.stop();
  });

  it('parseTrustProxy maps values correctly', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe('loopback');
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(parseTrustProxy('10.0.0.1,10.0.0.2')).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('/api/auth/me without cookie returns 401 via global middleware', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: false,
    });

    const meResult = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(meResult.statusCode).toBe(401);

    await app.stop();
  });

  it('/api/auth/change-password without cookie returns 401 via global middleware', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: false,
    });

    const result = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: {
        currentPassword: 'password123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456',
      },
    });

    expect(result.statusCode).toBe(401);

    await app.stop();
  });

  it('/api/auth/status remains publicly accessible with global middleware', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: false,
    });

    const result = await app.fastify.inject({
      method: 'GET',
      url: '/api/auth/status',
    });

    expect(result.statusCode).toBe(200);

    await app.stop();
  });

  it('/api/auth/login remains publicly accessible with global middleware', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: false,
    });

    await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    const loginResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'wrongpassword',
      },
    });

    expect(loginResult.statusCode).toBe(401);
    const error = loginResult.json() as { error: { code: string } };
    expect(error.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    await app.stop();
  });

  it('/api/auth/bootstrap remains publicly accessible with global middleware', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: false,
    });

    const result = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        username: 'admin',
        displayName: 'Admin User',
        password: 'password123',
        confirmPassword: 'password123',
      },
    });

    expect(result.statusCode).toBe(201);

    await app.stop();
  });

  it('logout with invalid cookie still clears cookie and returns 200', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const logoutResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: {
        fishboss_session: 'invalid-session-id-that-does-not-exist',
      },
    });

    expect(logoutResult.statusCode).toBe(200);
    const body = logoutResult.json() as { success: boolean };
    expect(body.success).toBe(true);

    const clearCookie = logoutResult.cookies.find((c: { name: string }) => c.name === 'fishboss_session');
    expect(clearCookie).toBeDefined();

    await app.stop();
  });

  it('logout without any cookie still returns 200 and clears cookie', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/auth', register: registerAuthRoutes }],
      skipAuth: true,
    });

    const logoutResult = await app.fastify.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(logoutResult.statusCode).toBe(200);
    const body = logoutResult.json() as { success: boolean };
    expect(body.success).toBe(true);

    await app.stop();
  });
});
