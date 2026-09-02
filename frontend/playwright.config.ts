// playwright.config.ts

import { defineConfig } from '@playwright/test';

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: 'list',
  retries: 0,
  testDir: './e2e',
  // helpers 目录是 e2e 共享工具（含 vitest 单测，如 real-backend 白名单 helper），不是 Playwright 用例
  testIgnore: '**/helpers/**',
  timeout: 20_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: 'http://127.0.0.1:4173',
  },
});
