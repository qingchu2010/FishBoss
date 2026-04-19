import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import type { FrontendConfig } from './schema.js';

const FRONTEND_CONFIG_FILE = 'preferences.json';

export class FrontendConfigRepository {
  private readonly configPath: string;

  constructor(configDir: string = path.join(getStoragePaths().root, 'frontend-config')) {
    this.configPath = path.join(configDir, FRONTEND_CONFIG_FILE);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
  }

  async get(): Promise<FrontendConfig> {
    await this.ensureDir();

    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content) as FrontendConfig;
    } catch {
      return {};
    }
  }

  async update(data: Partial<FrontendConfig>): Promise<FrontendConfig> {
    await this.ensureDir();
    const existing = await this.get();
    const nextConfig: FrontendConfig = {
      ...existing,
      ...data,
    };

    await fs.writeFile(this.configPath, JSON.stringify(nextConfig, null, 2), 'utf-8');
    return nextConfig;
  }
}
