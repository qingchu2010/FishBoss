import type { FastifyInstance } from 'fastify';
import { registerFrontendConfigRoutes } from './routes.js';

export { registerFrontendConfigRoutes } from './routes.js';
export { registerFrontendConfigRoutes as default } from './routes.js';
export * from './schema.js';
export * from './repository.js';
export * from './service.js';

export async function registerFrontendConfig(fastify: FastifyInstance): Promise<void> {
  await registerFrontendConfigRoutes(fastify);
}
