import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap } from '../../server/bootstrap/index.js';
import { resetConfig } from '../../server/config/index.js';
import { registerFrontendConfigRoutes } from './index.js';

let tempRoot: string;
let previousRoot: string | undefined;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fishboss-frontend-config-'));
  previousRoot = process.env.FISHBOSS_ROOT;
  process.env.FISHBOSS_ROOT = tempRoot;
  resetConfig();
});

afterEach(async () => {
  if (previousRoot === undefined) {
    delete process.env.FISHBOSS_ROOT;
  } else {
    process.env.FISHBOSS_ROOT = previousRoot;
  }
  resetConfig();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('frontend config routes', () => {
  it('is accessible without authentication when auth middleware is enabled', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/frontend-config', register: registerFrontendConfigRoutes }],
    });

    const response = await app.fastify.inject({
      method: 'PATCH',
      url: '/api/frontend-config',
      payload: {
        theme: 'dark',
        locale: 'zh_CN',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      config: {
        theme: 'dark',
        locale: 'zh_CN',
      },
    });
    await app.stop();
  });

  it('returns empty config before anything is saved', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/frontend-config', register: registerFrontendConfigRoutes }],
      skipAuth: true,
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/api/frontend-config',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ config: {} });
    await app.stop();
  });

  it('persists theme and locale through the backend module', async () => {
    const app = await bootstrap({
      domains: [{ prefix: '/api/frontend-config', register: registerFrontendConfigRoutes }],
      skipAuth: true,
    });

    const patchResponse = await app.fastify.inject({
      method: 'PATCH',
      url: '/api/frontend-config',
      payload: {
        theme: 'light',
        locale: 'en',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual({
      config: {
        theme: 'light',
        locale: 'en',
      },
    });

    const readResponse = await app.fastify.inject({
      method: 'GET',
      url: '/api/frontend-config',
    });

    expect(readResponse.json()).toEqual({
      config: {
        theme: 'light',
        locale: 'en',
      },
    });

    await app.stop();
  });
});
