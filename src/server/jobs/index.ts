import { EventEmitter } from 'events';
import { getLogger } from '../logging/index.js';
import { ServiceUnavailableError } from '../errors/index.js';

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Job<T = unknown> {
  id: string;
  name: string;
  status: JobStatus;
  data: T;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
}

export type JobHandler<T = unknown, R = unknown> = (job: Job<T>, ctx: JobContext) => Promise<R>;

export interface JobContext {
  updateProgress(progress: number): void;
  isCancelled(): boolean;
}

export interface JobOptions {
  name: string;
  data: unknown;
  handler: JobHandler;
  retries?: number;
  timeout?: number;
}

export class JobRegistry extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private runningCount: number = 0;
  private maxConcurrent: number = 5;
  private logger = getLogger();

  constructor(maxConcurrent: number = 5) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  register<T = unknown, R = unknown>(name: string, handler: JobHandler<T, R>): void {
    if (this.handlers.has(name)) {
      throw new Error(`Job handler '${name}' is already registered`);
    }
    this.handlers.set(name, handler as JobHandler);
    this.logger.debug(`Registered job handler: ${name}`);
  }

  async enqueue<T = unknown>(options: JobOptions): Promise<Job<T>> {
    const { name, data, retries = 0, timeout } = options;

    const jobHandler = this.handlers.get(name);
    if (!jobHandler) {
      throw new ServiceUnavailableError(`Job handler '${name}' is not registered`);
    }

    const id = this.generateId();
    const job: Job<T> = {
      id,
      name,
      status: JobStatus.PENDING,
      data: data as T,
      createdAt: new Date(),
      progress: 0,
    };

    this.jobs.set(id, job as Job);
    this.emit('job:enqueued', job);

    this.processJob(id, jobHandler as JobHandler, retries, timeout);

    return job as Job<T>;
  }

  private async processJob(
    id: string,
    handler: JobHandler,
    retries: number,
    timeout?: number
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    if (this.runningCount >= this.maxConcurrent) {
      setTimeout(() => this.processJob(id, handler, retries, timeout), 100);
      return;
    }

    this.runningCount++;
    job.status = JobStatus.RUNNING;
    job.startedAt = new Date();
    this.emit('job:started', job);

    const ctx: JobContext = {
      updateProgress: (progress: number) => {
        job.progress = progress;
        this.emit('job:progress', { job, progress });
      },
      isCancelled: () => job.status === JobStatus.CANCELLED,
    };

    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = timeout
        ? new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Job timeout')), timeout);
          })
        : Promise.race([]);

      const result = await Promise.race([handler(job, ctx), timeoutPromise]);

      if (timeoutId) clearTimeout(timeoutId);

      job.status = JobStatus.COMPLETED;
      job.result = result;
      job.completedAt = new Date();
      job.progress = 100;
      this.emit('job:completed', job);
    } catch (error) {
      job.status = JobStatus.FAILED;
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();
      this.emit('job:failed', job);
      this.logger.error(`Job ${id} failed`, error);
    } finally {
      this.runningCount--;
      this.cleanupJob(id);
    }
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === JobStatus.PENDING || job.status === JobStatus.RUNNING) {
      job.status = JobStatus.CANCELLED;
      job.completedAt = new Date();
      this.emit('job:cancelled', job);
      return true;
    }

    return false;
  }

  get(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  getByStatus(status: JobStatus): Job[] {
    return Array.from(this.jobs.values()).filter((job) => job.status === status);
  }

  getAll(): Job[] {
    return Array.from(this.jobs.values());
  }

  getStats(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const jobs = this.getAll();
    return {
      pending: jobs.filter((j) => j.status === JobStatus.PENDING).length,
      running: jobs.filter((j) => j.status === JobStatus.RUNNING).length,
      completed: jobs.filter((j) => j.status === JobStatus.COMPLETED).length,
      failed: jobs.filter((j) => j.status === JobStatus.FAILED).length,
      cancelled: jobs.filter((j) => j.status === JobStatus.CANCELLED).length,
    };
  }

  private cleanupJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    const age = Date.now() - (job.completedAt?.getTime() ?? Date.now());
    if (age > 3600000) {
      this.jobs.delete(id);
    }
  }

  private generateId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

let globalRegistry: JobRegistry | null = null;

export function getJobRegistry(): JobRegistry {
  if (!globalRegistry) {
    globalRegistry = new JobRegistry();
  }
  return globalRegistry;
}
