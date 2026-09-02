import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}', 'e2e/helpers/*.spec.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
