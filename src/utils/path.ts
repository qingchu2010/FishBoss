import path from 'node:path';
import { BadRequestError } from '../server/errors/index.js';

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function ensureUnderBasePath(basePath: string, targetPath: string, label: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget === resolvedBase) {
    return resolvedTarget;
  }

  const basePrefix = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;
  if (!resolvedTarget.startsWith(basePrefix)) {
    throw new BadRequestError(`Invalid ${label}`);
  }

  return resolvedTarget;
}

export function assertSafeEntityId(id: string, label: string = 'id'): string {
  if (!SAFE_ENTITY_ID.test(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }

  return id;
}

export function resolveSafeJsonEntityPath(basePath: string, id: string, label: string = 'id'): string {
  const safeId = assertSafeEntityId(id, label);
  return ensureUnderBasePath(basePath, path.join(basePath, `${safeId}.json`), label);
}

export function resolveSafeRelativePath(basePath: string, relativePath: string, label: string = 'path'): string {
  return ensureUnderBasePath(basePath, path.join(basePath, relativePath), label);
}
