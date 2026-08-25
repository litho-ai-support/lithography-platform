// test/global-teardown-e2e.ts

/**
 * E2E 测试全局清理：
 * - 只负责关闭全局 DataSource（如果存在）
 * - 追加清理 e2e Redis DB（FLUSHDB）
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import Redis, { type RedisOptions } from 'ioredis';
import * as path from 'path';
import 'reflect-metadata';
import type { DataSource } from 'typeorm';

// 声明合并：为 global 增加 testDataSource（避免 TS7017）
declare global {
  var testDataSource: DataSource | undefined;
}
export {}; // 确保这是一个模块

const loadE2EEnv = (): string | undefined => {
  const candidates: string[] = [];
  if (process.env.E2E_DOTENV) {
    candidates.push(path.resolve(process.cwd(), process.env.E2E_DOTENV));
  }
  const envName = process.env.NODE_ENV || 'e2e';
  candidates.push(
    path.resolve(__dirname, '../env/.env.e2e'),
    path.resolve(__dirname, '../env/.ev.e2e'),
    path.resolve(__dirname, `../env/.env.${envName}`),
    path.resolve(__dirname, `../env/.ev.${envName}`),
  );
  const envFile = candidates.find((p) => fs.existsSync(p));
  if (envFile) {
    dotenv.config({ path: envFile });
  }
  return envFile;
};

const resolveEnvString = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const resolveEnvNumber = (key: string): number => {
  const raw = resolveEnvString(key);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be an integer`);
  }
  return value;
};

const buildRedisOptions = (): RedisOptions => {
  const options: RedisOptions = {
    host: resolveEnvString('REDIS_HOST'),
    port: resolveEnvNumber('REDIS_PORT'),
    db: resolveEnvNumber('REDIS_DB'),
  };
  const password = process.env.REDIS_PASSWORD;
  if (password && password.trim().length > 0) {
    options.password = password;
  }
  if (process.env.REDIS_TLS === 'true') {
    options.tls = {};
  }
  return options;
};

const flushRedisE2EDb = async (): Promise<void> => {
  const loadedEnvFile = loadE2EEnv();
  if (!loadedEnvFile) {
    console.log('📝 未找到 E2E env 文件，跳过 Redis FLUSHDB');
    return;
  }
  if (path.basename(loadedEnvFile) !== '.env.e2e') {
    console.log(`🛡️ env 文件名不是 .env.e2e（当前: ${loadedEnvFile}），跳过 Redis FLUSHDB`);
    return;
  }
  const redisOptions = buildRedisOptions();
  const client = new Redis(redisOptions);
  try {
    await client.flushdb();
    console.log(`🧹 Redis FLUSHDB 完成（db=${String(redisOptions.db)}，env=${loadedEnvFile}）`);
  } finally {
    if (client.status !== 'end') {
      await client.quit();
    }
  }
};

export default async (): Promise<void> => {
  try {
    const ds = global.testDataSource;

    if (ds?.isInitialized) {
      console.log('🔌 正在关闭 E2E 测试数据库连接...');
      await ds.destroy();
      console.log('✅ 数据库连接已关闭');
    } else {
      console.log('📝 未发现全局 DataSource，跳过全局连接关闭（各用例自行管理 DataSource）');
    }

    // 清理全局引用
    global.testDataSource = undefined;

    await flushRedisE2EDb();

    // ⚠️ 不要强制 process.exit(0)，否则可能掩盖资源泄漏
  } catch (error) {
    console.error('❌ E2E 测试环境清理失败:', error);
    throw error;
  }
};
