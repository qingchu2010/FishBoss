import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './routes.js';

export { registerAuthRoutes } from './routes.js';
export { registerAuthRoutes as default } from './routes.js';
export * from './schema.js';
export * from './password.js';
export * from './session.js';
export * from './service.js';
export * from './repository.js';

export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  await registerAuthRoutes(fastify);
}
