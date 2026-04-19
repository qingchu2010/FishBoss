export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
}

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  statusCode: number;
  cause?: unknown;
  expose?: boolean;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public override readonly cause: unknown;
  public readonly expose: boolean;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.cause = options.cause;
    this.expose = options.expose ?? true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): object {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      code: ErrorCode.BAD_REQUEST,
      message,
      statusCode: 400,
      cause,
    });
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', cause?: unknown) {
    super({
      code: ErrorCode.UNAUTHORIZED,
      message,
      statusCode: 401,
      cause,
    });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', cause?: unknown) {
    super({
      code: ErrorCode.FORBIDDEN,
      message,
      statusCode: 403,
      cause,
    });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, cause?: unknown) {
    super({
      code: ErrorCode.NOT_FOUND,
      message: `${resource} not found`,
      statusCode: 404,
      cause,
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      code: ErrorCode.CONFLICT,
      message,
      statusCode: 409,
      cause,
    });
    this.name = 'ConflictError';
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      code: ErrorCode.UNPROCESSABLE_ENTITY,
      message,
      statusCode: 422,
      cause,
    });
    this.name = 'UnprocessableEntityError';
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', cause?: unknown) {
    super({
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message,
      statusCode: 500,
      cause,
      expose: false,
    });
    this.name = 'InternalServerError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', cause?: unknown) {
    super({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message,
      statusCode: 503,
      cause,
    });
    this.name = 'ServiceUnavailableError';
  }
}

export class GatewayTimeoutError extends AppError {
  constructor(message: string = 'Gateway timeout', cause?: unknown) {
    super({
      code: ErrorCode.GATEWAY_TIMEOUT,
      message,
      statusCode: 504,
      cause,
    });
    this.name = 'GatewayTimeoutError';
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.values(ErrorCode).includes(value as ErrorCode);
}

export function sanitizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new InternalServerError(error.message, error);
  }
  return new InternalServerError(String(error));
}
