import argon2 from 'argon2';
import { getLogger } from '../../server/logging/index.js';

const logger = getLogger();

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error('Password verification failed', error);
    return false;
  }
}
