import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import { DATA_DIR, CONFIG_DIR, CACHE_DIR } from '../config/index.js';
import { NotFoundError, ConflictError } from '../errors/index.js';

export type StorageType = 'data' | 'config' | 'cache';

export interface FileStorageOptions {
  type: StorageType;
  subdirectory?: string;
}

function getStorageDirectory(type: StorageType, subdirectory?: string): string {
  let base = DATA_DIR;
  if (type === 'config') base = CONFIG_DIR;
  else if (type === 'cache') base = CACHE_DIR;

  if (subdirectory) {
    return join(base, subdirectory);
  }
  return base;
}

export class FileStorage {
  private basePath: string;

  constructor(private options: FileStorageOptions) {
    this.basePath = getStorageDirectory(options.type, options.subdirectory);
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getFilePath(filename: string): string {
    return join(this.basePath, filename);
  }

  read<T>(filename: string): T {
    const filePath = this.getFilePath(filename);
    if (!existsSync(filePath)) {
      throw new NotFoundError(`File ${filename}`);
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }

  write<T>(filename: string, data: T): void {
    const filePath = this.getFilePath(filename);
    const content = JSON.stringify(data, null, 2);
    writeFileSync(filePath, content, 'utf-8');
  }

  exists(filename: string): boolean {
    return existsSync(this.getFilePath(filename));
  }

  delete(filename: string): void {
    const filePath = this.getFilePath(filename);
    if (!existsSync(filePath)) {
      throw new NotFoundError(`File ${filename}`);
    }
    unlinkSync(filePath);
  }

  list(): string[] {
    return readdirSync(this.basePath).filter((file) => {
      try {
        return statSync(join(this.basePath, file)).isFile();
      } catch {
        return false;
      }
    });
  }

  getModificationTime(filename: string): Date {
    const filePath = this.getFilePath(filename);
    if (!existsSync(filePath)) {
      throw new NotFoundError(`File ${filename}`);
    }
    return statSync(filePath).mtime;
  }
}

const globalStorages: Map<string, FileStorage> = new Map();

export function getStorage(type: StorageType, subdirectory?: string): FileStorage {
  const key = `${type}:${subdirectory ?? ''}`;
  if (!globalStorages.has(key)) {
    globalStorages.set(key, new FileStorage({ type, subdirectory }));
  }
  return globalStorages.get(key) as FileStorage;
}

export class JsonFileStore<T extends Record<string, unknown>> {
  private storage: FileStorage;
  private filename: string;

  constructor(storage: FileStorage, filename: string) {
    this.storage = storage;
    this.filename = filename;
  }

  load(): T | null {
    if (!this.storage.exists(this.filename)) {
      return null;
    }
    try {
      return this.storage.read<T>(this.filename);
    } catch {
      return null;
    }
  }

  save(data: T): void {
    if (this.storage.exists(this.filename)) {
      throw new ConflictError(`File ${this.filename} already exists`);
    }
    this.storage.write(this.filename, data);
  }

  update(data: Partial<T>): T {
    const existing = this.load() ?? ({} as T);
    const merged = { ...existing, ...data };
    this.storage.write(this.filename, merged);
    return merged;
  }

  delete(): void {
    this.storage.delete(this.filename);
  }
}

export class KeyedStore<K extends string | number, V extends Record<string, unknown>> {
  private storage: FileStorage;
  private directory: string;
  private collectionName: string;

  constructor(storage: FileStorage, collectionName: string) {
    this.storage = storage;
    this.directory = collectionName;
    this.collectionName = collectionName;
  }

  private getItemStore(itemKey: K): FileStorage {
    return new FileStorage({
      type: this.storage['options']['type'] as StorageType,
      subdirectory: `${this.directory}/${String(itemKey)}`,
    });
  }

  get(itemKey: K): V | null {
    const store = this.getItemStore(itemKey);
    const filename = `${this.collectionName}.json`;
    if (!store.exists(filename)) {
      return null;
    }
    return store.read<V>(filename);
  }

  set(itemKey: K, data: V): void {
    const store = this.getItemStore(itemKey);
    store.write(`${this.collectionName}.json`, data);
  }

  has(itemKey: K): boolean {
    const store = this.getItemStore(itemKey);
    return store.exists(`${this.collectionName}.json`);
  }

  delete(itemKey: K): boolean {
    const store = this.getItemStore(itemKey);
    const filename = `${this.collectionName}.json`;
    if (!store.exists(filename)) {
      return false;
    }
    store.delete(filename);
    return true;
  }

  keys(): K[] {
    const dirStore = new FileStorage({
      type: this.storage['options']['type'] as StorageType,
      subdirectory: this.directory,
    });
    return dirStore
      .list()
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', '') as K);
  }

  size(): number {
    return this.keys().length;
  }
}
