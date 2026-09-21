// e2e-real/global-setup.ts
// 专用账号设置真实联调的全局前置（R4 修正轮 P1-1）：
//
// 1. 硬失败门：物理清理授权（E2E_ALLOW_PHYSICAL_CLEANUP=1）缺失、目标库不合法或
//    与专用库不一致时，联调链路直接失败，不得 skip 掩盖；
// 2. 只对专用独立库 lithography_e2e 执行 baseline Migration（官方空库演练脚本：
//    清空表 → 全量迁移 → 结构校验）与官方 Mock Seed；绝不触碰 lithography_drill
//    或其他数据库；
// 3. 专用后端由 playwright 配置的 webServer 以进程级环境变量启动
//    （APP_PORT=3100 / DB_NAME=lithography_e2e / NODE_ENV=development），不修改任何 .env。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPhysicalCleanupAllowed, readBackendEnv } from '../e2e/helpers/real-backend';

export const DEDICATED_E2E_DB_NAME = 'lithography_e2e';
export const DEDICATED_BACKEND_ORIGIN = 'http://127.0.0.1:3100';

const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'backend',
);

function runBackendScript(script: string, extraEnv: Record<string, string>): void {
  execFileSync('npm', ['run', script], {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
}

export default function globalSetup(): void {
  const env = readBackendEnv();

  // 授权缺失 / 库名不合法：直接失败（不得以 skip 掩盖）
  assertPhysicalCleanupAllowed(env);

  if (env.DB_NAME !== DEDICATED_E2E_DB_NAME) {
    throw new Error(
      `专用真实联调必须以 ${JSON.stringify(DEDICATED_E2E_DB_NAME)} 为目标库（DB_NAME 进程级覆盖），实际为 ${JSON.stringify(env.DB_NAME)}`,
    );
  }

  // 官方 baseline：空库演练脚本（清空 lithography_e2e 全部表 → 全量迁移 → 结构校验）。
  // 目标库经进程级 DB_NAME 指定，dotenv 不会覆盖已存在的进程变量，故绝不影响
  // lithography_drill 或其他库；DB 名不含 test/drill/ci 段，按脚本要求显式授权。
  runBackendScript('migration:drill:empty-db', {
    DB_NAME: DEDICATED_E2E_DB_NAME,
    MIGRATION_DRILL_ALLOW_NON_TEST_DB: 'true',
  });

  // 官方 Mock Seed：与 migration 同库（lithography_e2e）。库名不含 test/drill/dev/local
  // 段，按 seed 脚本自身安全门的要求以进程级变量显式授权。
  runBackendScript('seed:mock', {
    DB_NAME: DEDICATED_E2E_DB_NAME,
    SEED_ALLOW_NON_TEST_DB: 'true',
  });
}
