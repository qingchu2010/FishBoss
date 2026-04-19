import type { PlatformAdapter, PlatformType, PlatformTypeMetadata } from '../schema.js';
import { qqAdapter } from './qq.js';
import { onebotAdapter } from './onebot.js';

export * from './qq.js';
export * from './onebot.js';

export const allPlatforms: PlatformAdapter[] = [
  qqAdapter,
  onebotAdapter,
];

export function getPlatformAdapter(type: PlatformType): PlatformAdapter | undefined {
  return allPlatforms.find((platform) => platform.platformType === type);
}

export function getPlatformPresets(): PlatformTypeMetadata[] {
  return allPlatforms.map((platform) => ({
    type: platform.platformType,
    displayName: platform.displayName,
    defaultConfig: platform.defaultConfig,
    modules: platform.modules,
    capabilities: platform.capabilities,
  }));
}
