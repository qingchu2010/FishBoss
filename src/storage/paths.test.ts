import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStoragePaths } from './paths.js';

describe('storage paths', () => {
  it('defaults to ~/.fishboss root', () => {
    const paths = createStoragePaths();

    expect(paths.root).toBe(path.join(os.homedir(), '.fishboss'));
    expect(paths.prompts).toBe(path.join(os.homedir(), '.fishboss', 'prompts'));
  });
});
