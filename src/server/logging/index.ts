import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const FISHBOSS_DIR = join(homedir(), '.fishboss');
const LOGS_DIR = join(FISHBOSS_DIR, 'logs');

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const;
const LOG_LEVEL_COLORS = ['\x1b[36m', '\x1b[32m', '\x1b[33m', '\x1b[31m', '\x1b[35m'] as const;
const RESET_COLOR = '\x1b[0m';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: Record<string, unknown>;
  error?: string;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  fatal(message: string, error?: unknown, context?: Record<string, unknown>): void;
}

function formatLogEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.levelName}] ${entry.message}`;
  if (entry.context && Object.keys(entry.context).length > 0) {
    return `${base} ${JSON.stringify(entry.context)}`;
  }
  return base;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ''}`;
  }
  return String(error);
}

function createLogEntry(
  level: LogLevel,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    levelName: LOG_LEVEL_NAMES[level],
    message,
    context,
    error: error !== undefined ? String(formatError(error)) : undefined,
  };
}

class ConsoleLogger implements Logger {
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private write(entry: LogEntry): void {
    const color = LOG_LEVEL_COLORS[entry.level];
    const formatted = formatLogEntry(entry);
    console.log(`${color}${formatted}${RESET_COLOR}`);
    if (entry.error) {
      console.log(`${color}${entry.error}${RESET_COLOR}`);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.write(createLogEntry(LogLevel.DEBUG, message, undefined, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.write(createLogEntry(LogLevel.INFO, message, undefined, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.write(createLogEntry(LogLevel.WARN, message, undefined, context));
    }
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.write(createLogEntry(LogLevel.ERROR, message, error, context));
    }
  }

  fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      this.write(createLogEntry(LogLevel.FATAL, message, error, context));
    }
  }
}

class FileLogger implements Logger {
  private filePath: string;

  constructor(filename: string) {
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
    this.filePath = join(LOGS_DIR, filename);
  }

  private write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.filePath, line, 'utf-8');
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write(createLogEntry(LogLevel.DEBUG, message, undefined, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write(createLogEntry(LogLevel.INFO, message, undefined, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write(createLogEntry(LogLevel.WARN, message, undefined, context));
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.write(createLogEntry(LogLevel.ERROR, message, error, context));
  }

  fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.write(createLogEntry(LogLevel.FATAL, message, error, context));
  }
}

class CompositeLogger implements Logger {
  private loggers: Logger[];

  constructor(loggers: Logger[]) {
    this.loggers = loggers;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.loggers.forEach((l) => l.debug(message, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.loggers.forEach((l) => l.info(message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.loggers.forEach((l) => l.warn(message, context));
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.loggers.forEach((l) => l.error(message, error, context));
  }

  fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.loggers.forEach((l) => l.fatal(message, error, context));
  }
}

function getMinLogLevel(): LogLevel {
  const env = process.env['LOG_LEVEL']?.toUpperCase();
  if (env === 'DEBUG') return LogLevel.DEBUG;
  if (env === 'INFO') return LogLevel.INFO;
  if (env === 'WARN') return LogLevel.WARN;
  if (env === 'ERROR') return LogLevel.ERROR;
  if (env === 'FATAL') return LogLevel.FATAL;
  return LogLevel.INFO;
}

function getLogFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `fishboss-${date}.log`;
}

let globalLogger: Logger | null = null;

export function createLogger(filename?: string): Logger {
  const minLevel = getMinLogLevel();
  const consoleLogger = new ConsoleLogger(minLevel);

  if (filename) {
    const fileLogger = new FileLogger(filename);
    return new CompositeLogger([consoleLogger, fileLogger]);
  }

  return consoleLogger;
}

export function initLogger(filename?: string): Logger {
  if (!globalLogger) {
    globalLogger = createLogger(filename ?? getLogFilename());
  }
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    return initLogger();
  }
  return globalLogger;
}
