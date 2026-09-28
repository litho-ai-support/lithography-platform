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
  // 工程师真实链路要求专用隔离配置；普通入口不收集，避免把未执行计为跳过验收。
  testIgnore: ['**/helpers/**', '**/engineer-repair-request-real.spec.ts'],
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
