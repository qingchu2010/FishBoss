import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProviderRepository } from './repository.js';

const tempRoots: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

beforeEach(() => {
  process.env.SERVER_SECRET = 'test-secret-for-encryption';
});

afterEach(async () => {
  delete process.env.SERVER_SECRET;
  await Promise.all(tempRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('provider repository', () => {
  it('stores encrypted api keys', async () => {
    const dir = await createTempDir('fishboss-provider-');
    const repository = new ProviderRepository(dir);

    const provider = await repository.create({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'sk-secret-123456',
      models: ['gpt-4.1'],
      enabled: true,
    });

    expect(provider.apiKeyEncrypted).toBeTruthy();
    expect(provider.apiKeyEncrypted).not.toContain('sk-secret-123456');

    const stored = await fs.readFile(path.join(dir, `${provider.id}.json`), 'utf-8');
    expect(stored).not.toContain('sk-secret-123456');
    expect(stored).toContain('apiKeyEncrypted');
  });

  it('rejects path traversal ids', async () => {
    const dir = await createTempDir('fishboss-provider-');
    const repository = new ProviderRepository(dir);

    await expect(repository.get('../outside')).rejects.toThrow('Invalid provider id');
  });

  it('persists model catalog metadata for custom models', async () => {
    const dir = await createTempDir('fishboss-provider-');
    const repository = new ProviderRepository(dir);

    const provider = await repository.create({
      name: 'OpenAI',
      type: 'openai',
      models: [],
      enabled: true,
    });

    await repository.addCustomModel(provider.id, {
      name: 'gpt-custom',
      contextWindow: 128000,
      supportedModes: ['chat', 'completion'],
    });

    const models = await repository.listModels(provider.id);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'gpt-custom',
      name: 'gpt-custom',
      contextWindow: 128000,
      supportedModes: ['chat', 'completion'],
    });
  });
});
