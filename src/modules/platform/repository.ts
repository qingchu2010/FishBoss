import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import { resolveSafeJsonEntityPath } from '../../utils/path.js';
import { generateId } from '../../utils/string.js';
import { encryptApiKey, decryptApiKey } from '../../utils/crypto.js';
import type { Platform } from './schema.js';

interface StoredPlatform {
  id: string;
  name: string;
  platformType: string;
  config: Record<string, unknown>;
  credentialsEncrypted?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PlatformRepository {
  private platformsPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { platforms: customPath } : getStoragePaths();
    this.platformsPath = paths.platforms;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.platformsPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.platformsPath, id, 'platform id');
  }

  async list(): Promise<Platform[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.platformsPath);
    const platforms: Platform[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.platformsPath, file), 'utf-8');
        const data = JSON.parse(content) as StoredPlatform;
        platforms.push(this.deserializePlatform(data));
      } catch {
      }
    }

    return platforms.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  }

  async get(id: string): Promise<Platform | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.deserializePlatform(JSON.parse(content));
    } catch {
      return null;
    }
  }

  async create(data: {
    name: string;
    platformType: string;
    config: Record<string, unknown>;
    credentials?: string;
    enabled: boolean;
  }): Promise<Platform> {
    await this.ensureDir();
    const now = new Date();
    const platform: Platform = {
      id: generateId(),
      name: data.name,
      platformType: data.platformType as Platform['platformType'],
      config: data.config,
      credentials: data.credentials,
      enabled: data.enabled,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      this.getFilePath(platform.id),
      JSON.stringify(this.serializePlatform(platform, now), null, 2)
    );

    return platform;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      platformType: string;
      config: Record<string, unknown>;
      credentials: string | null;
      enabled: boolean;
    }>
  ): Promise<Platform | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: Platform = {
      ...existing,
      name: data.name ?? existing.name,
      platformType: (data.platformType ?? existing.platformType) as Platform['platformType'],
      config: data.config ?? existing.config,
      credentials: data.credentials === null ? undefined : (data.credentials ?? existing.credentials),
      enabled: data.enabled ?? existing.enabled,
    };

    await fs.writeFile(
      this.getFilePath(id),
      JSON.stringify(this.serializePlatform(updated, new Date()), null, 2)
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private serializePlatform(platform: Platform, date: Date): StoredPlatform {
    return {
      id: platform.id,
      name: platform.name,
      platformType: platform.platformType,
      config: platform.config,
      credentialsEncrypted: platform.credentials ? encryptApiKey(platform.credentials) : undefined,
      enabled: platform.enabled,
      createdAt: (platform.createdAt ?? date).toISOString(),
      updatedAt: date.toISOString(),
    };
  }

  private deserializePlatform(data: StoredPlatform): Platform {
    return {
      id: data.id,
      name: data.name,
      platformType: data.platformType as Platform['platformType'],
      config: data.config,
      credentials: data.credentialsEncrypted ? decryptApiKey(data.credentialsEncrypted) : undefined,
      enabled: data.enabled,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  maskCredentials(credentials: string | undefined): string {
    if (!credentials) return '';
    if (credentials.length <= 8) return '****';
    return credentials.slice(0, 4) + '****' + credentials.slice(-4);
  }
}
