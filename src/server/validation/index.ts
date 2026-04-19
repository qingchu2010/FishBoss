import type { FastifySchema, FastifyRequest } from 'fastify';
import { BadRequestError } from '../errors/index.js';

export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ValidationResult {
  success: boolean;
  errors?: ValidationFieldError[];
}

export type ValidatorFn<T = unknown> = (value: T) => ValidationResult;

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function minLength(min: number): ValidatorFn<string> {
  return (value: string) => ({
    success: value.length >= min,
    errors:
      value.length >= min ? undefined : [{ field: 'value', message: `Minimum length is ${min}` }],
  });
}

export function maxLength(max: number): ValidatorFn<string> {
  return (value: string) => ({
    success: value.length <= max,
    errors:
      value.length <= max ? undefined : [{ field: 'value', message: `Maximum length is ${max}` }],
  });
}

export function pattern(regex: RegExp, message: string): ValidatorFn<string> {
  return (value: string) => ({
    success: regex.test(value),
    errors: regex.test(value) ? undefined : [{ field: 'value', message }],
  });
}

export function minValue(min: number): ValidatorFn<number> {
  return (value: number) => ({
    success: value >= min,
    errors: value >= min ? undefined : [{ field: 'value', message: `Minimum value is ${min}` }],
  });
}

export function maxValue(max: number): ValidatorFn<number> {
  return (value: number) => ({
    success: value <= max,
    errors: value <= max ? undefined : [{ field: 'value', message: `Maximum value is ${max}` }],
  });
}

export function required(message: string = 'This field is required'): ValidatorFn<unknown> {
  return (value: unknown) => ({
    success: value !== undefined && value !== null && value !== '',
    errors:
      value !== undefined && value !== null && value !== ''
        ? undefined
        : [{ field: 'value', message }],
  });
}

export function validateObject<T extends Record<string, unknown>>(
  obj: T,
  validators: Partial<Record<keyof T, ValidatorFn>>
): ValidationResult {
  const errors: ValidationFieldError[] = [];

  for (const [key, validator] of Object.entries(validators)) {
    const value = obj[key as keyof T];
    const result = validator!(value);
    if (!result.success && result.errors) {
      errors.push(...result.errors.map((e) => ({ ...e, field: key })));
    }
  }

  return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

export async function parseBody<T>(request: FastifyRequest, _schema: FastifySchema): Promise<T> {
  if (!request.body) {
    throw new BadRequestError('Request body is required');
  }
  return request.body as T;
}

export function createSchemaValidators<T extends Record<string, unknown>>(validators: {
  [K in keyof T]?: ValidatorFn<T[K]>;
}) {
  return async (
    data: unknown
  ): Promise<{ success: true; data: T } | { success: false; errors: ValidationFieldError[] }> => {
    if (!isObject(data)) {
      return { success: false, errors: [{ field: '_', message: 'Invalid object' }] };
    }

    const errors: ValidationFieldError[] = [];
    const result = data as T;

    for (const [key, validator] of Object.entries(validators) as [keyof T, ValidatorFn<T[keyof T]>][]) {
      const value = result[key];
      const validationResult = validator!(value);
      if (!validationResult.success && validationResult.errors) {
        errors.push(...validationResult.errors.map((e) => ({ ...e, field: String(key) })));
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: result };
  };
}
