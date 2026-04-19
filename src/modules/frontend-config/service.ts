import type { FrontendConfig } from './schema.js';
import { UpdateFrontendConfigSchema } from './schema.js';
import { FrontendConfigRepository } from './repository.js';

export class FrontendConfigService {
  private repository: FrontendConfigRepository;

  constructor(repository?: FrontendConfigRepository) {
    this.repository = repository ?? new FrontendConfigRepository();
  }

  async get(): Promise<FrontendConfig> {
    return this.repository.get();
  }

  async update(data: unknown): Promise<FrontendConfig> {
    const parsed = UpdateFrontendConfigSchema.parse(data);
    return this.repository.update(parsed);
  }
}
