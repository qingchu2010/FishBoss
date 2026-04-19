import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProviderRepository } from './repository.js';
import { ProviderService } from './service.js';

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

describe('provider service', () => {
  it('rejects endpoint changes when reusing a saved api key implicitly', async () => {
    const dir = await createTempDir('fishboss-provider-service-');
    const repository = new ProviderRepository(dir);
    const service = new ProviderService(repository);

    const provider = await repository.create({
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-secret-123456',
      models: ['gpt-4.1'],
      enabled: true,
    });

    await expect(service.update(provider.id, {
      baseUrl: 'https://evil.example.com',
    })).rejects.toThrow('Changing the provider endpoint requires re-entering the API key or clearing it first');
  });

  it('rejects endpoint changes when apiKey is an empty string', async () => {
    const dir = await createTempDir('fishboss-provider-service-');
    const repository = new ProviderRepository(dir);
    const service = new ProviderService(repository);

    const provider = await repository.create({
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-secret-123456',
      models: ['gpt-4.1'],
      enabled: true,
    });

    await expect(service.update(provider.id, {
      baseUrl: 'https://evil.example.com',
      apiKey: '',
    })).rejects.toThrow('Changing the provider endpoint requires re-entering the API key or clearing it first');
  });

  it('fetches backend-owned model metadata without frontend fabrication', async () => {
    const dir = await createTempDir('fishboss-provider-service-');
    const repository = new ProviderRepository(dir);
    const service = new ProviderService(repository);

    const provider = await repository.create({
      name: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      models: [],
      enabled: true,
    });

    const result = await service.fetchModels({ providerId: provider.id });

    expect(result.error).toBeUndefined();
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0]?.contextWindow).toBe(200000);
    expect(result.models[0]?.supportedModes).toEqual(['chat', 'completion']);

    const storedModels = await repository.listModels(provider.id);
    expect(storedModels[0]?.contextWindow).toBe(200000);
  });

  it('applies backend defaults when adding a custom model', async () => {
    const dir = await createTempDir('fishboss-provider-service-');
    const repository = new ProviderRepository(dir);
    const service = new ProviderService(repository);

    const provider = await repository.create({
      name: 'Custom API',
      type: 'custom',
      baseUrl: 'https://api.example.com',
      models: [],
      enabled: true,
    });

    const model = await service.addCustomModel(provider.id, { name: 'my-model' });

    expect(model).toMatchObject({
      id: 'my-model',
      name: 'my-model',
      contextWindow: 4096,
      supportedModes: ['chat', 'completion'],
    });
  });
});
