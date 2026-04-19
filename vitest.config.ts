import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'frontend/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['frontend/src/**/*.test.ts', 'jsdom']],
    include: ['src/**/*.test.ts', 'frontend/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'frontend/src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    typecheck: {
      tsconfigPath: './tsconfig.json',
    },
  },
});
