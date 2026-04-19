import Fastify from 'fastify';
import type { FastifyInstance, FastifyListenOptions, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import cookie from '@fastify/cookie';
import { loadConfig, ensureFishbossDirs } from '../config/index.js';
import type { AppConfig } from '../config/index.js';
import { initLogger, getLogger } from '../logging/index.js';
import { AppError, isAppError, sanitizeError } from '../errors/index.js';
import { createAuthMiddleware } from '../middleware/index.js';

export interface DomainRoute {
  prefix: string;
  register: (fastify: FastifyInstance) => Promise<void>;
}

export interface BootstrapOptions {
  config?: Partial<AppConfig>;
  domains?: DomainRoute[];
  skipAuth?: boolean;
}

function isRateLimitResponse(obj: unknown): obj is { error: { code: string; message: string } } {
  if (!obj || typeof obj !== 'object') return false;
  const record = obj as Record<string, unknown>;
  if (!record.error || typeof record.error !== 'object') return false;
  const err = record.error as Record<string, unknown>;
  return typeof err.code === 'string' && typeof err.message === 'string';
}

export class Application {
  public readonly fastify: FastifyInstance;
  public readonly config: AppConfig;
  public readonly logger = getLogger();

  private isRunning: boolean = false;

  constructor(config: AppConfig) {
    this.config = config;
    this.fastify = Fastify({
      logger: false,
      disableRequestLogging: true,
      trustProxy: this.config.server.trustProxy,
    });
  }

  async initialize(domains: DomainRoute[] = [], skipAuth: boolean = false): Promise<void> {
    await this.registerPlugins();
    await this.registerHooks();
    this.registerErrorHandler();

    if (!skipAuth) {
      const authMiddleware = createAuthMiddleware({
        excludePaths: [
          '/api/health',
          '/api/health/liveness',
          '/api/health/readiness',
          '/api/auth/status',
          '/api/auth/login',
          '/api/auth/bootstrap',
          '/api/auth/logout',
          '/api/frontend-config',
        ],
      });

      this.fastify.addHook('onRequest', async (request, reply) => {
        return new Promise<void>((resolve, reject) => {
          authMiddleware(
            request,
            reply,
            (err: Error | undefined) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });
    }

    await this.registerDomains(domains);
    await this.registerHealthRoutes();
  }

  private async registerPlugins(): Promise<void> {
    await this.fastify.register(cors, {
      origin: this.config.cors.origins,
      credentials: this.config.cors.credentials,
    });

    await this.fastify.register(cookie);

    if (this.config.rateLimit.enabled) {
      await this.fastify.register(rateLimit, {
        max: this.config.rateLimit.max,
        timeWindow: this.config.rateLimit.timeWindow,
      });
    }

    await this.fastify.register(sensible);
  }

  private async registerHooks(): Promise<void> {
    this.fastify.addHook('onRequest', async (request) => {
      request.log.info({ url: request.url, method: request.method }, 'request received');
    });

    this.fastify.addHook('onResponse', async (request, reply) => {
      request.log.info({ url: request.url, statusCode: reply.statusCode }, 'request completed');
    });
  }

  private registerErrorHandler(): void {
    this.fastify.setErrorHandler((error: FastifyError | AppError, request, reply) => {
      if (isRateLimitResponse(error)) {
        return reply.status(429).send(error);
      }

      this.logger.error('Request error', error, { url: request.url });

      if (isAppError(error)) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      const statusCode = (error as FastifyError & { statusCode?: number }).statusCode ?? 500;
      const sanitized = sanitizeError(error);

      return reply.status(statusCode).send({
        error: {
          code: sanitized.code,
          message: statusCode === 500 ? 'Internal server error' : sanitized.message,
        },
      });
    });
  }

  private async registerDomains(domains: DomainRoute[]): Promise<void> {
    for (const domain of domains) {
      this.logger.info(`Registering domain: ${domain.prefix}`);
      await this.fastify.register(domain.register, { prefix: domain.prefix });
    }
  }

  private async registerHealthRoutes(): Promise<void> {
    this.fastify.get('/api/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }));

    this.fastify.get('/api/health/liveness', async () => ({ status: 'alive' }));

    this.fastify.get('/api/health/readiness', async () => ({
      status: 'ready',
      jobs: { running: 0 },
    }));
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Application is already running');
    }

    const listenOptions: FastifyListenOptions = {
      host: this.config.server.host,
      port: this.config.server.port,
    };

    await this.fastify.listen(listenOptions);
    this.isRunning = true;

    this.logger.info(
      `Server listening on ${this.config.server.host}:${this.config.server.port}`,
      { env: this.config.server.env }
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Shutting down server...');
    await this.fastify.close();
    this.isRunning = false;
    this.logger.info('Server stopped');
  }
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<Application> {
  ensureFishbossDirs();
  initLogger();

  const config = { ...loadConfig(), ...options.config };
  const app = new Application(config);

  await app.initialize(options.domains ?? [], options.skipAuth ?? false);

  return app;
}
