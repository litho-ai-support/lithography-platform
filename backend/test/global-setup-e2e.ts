// test/global-setup-e2e.ts
import 'reflect-metadata';
import 'tsconfig-paths/register';

import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import Redis, { type RedisOptions } from 'ioredis';
import * as path from 'path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '../src/infrastructure/config/database.config';
import { assertDataSourceOnAllowedE2eDatabase } from './utils/e2e-db-guard';

/**
 * ⚠️ 注意：Jest 的 globalSetup 运行在独立上下文，
 * 这里设置的 global 变量无法直接被测试文件复用为「同一个对象」。
 * 因此这里不暴露 DataSource，也不预插用户数据。
 * 仅做：环境变量加载 + 目标库白名单校验 + 一次性的全库清理。
 *
 * 🔒 破坏性清理的安全边界（0918 决策 / codex review M-02）：
 * - 只要本组需要 MySQL，就**无条件**先校验「实际连接库」属于 E2E 白名单（默认 lithography_e2e）；
 *   该校验不受 E2E_SKIP_INFRA_CHECKS / E2E_SKIP_DB_CLEANUP 影响，任何开关都无法绕过；
 * - 全库 TRUNCATE 另需显式 E2E_ALLOW_DB_CLEANUP=1 表示同意；
 * - 任一条件不满足即在「开始删数据之前」抛错退出；
 * - 全局清理不得清空 Migration 执行记录表，保证 schema 版本可追溯。
 */

type InfraNeed = 'mysql' | 'redis' | 'bullmq' | 'external';

/**
 * 全库清理时必须保留的系统/基线表（大小写不敏感）。
 * Migration 执行记录一旦丢失，DB 版本将无法追溯，故永不 TRUNCATE。
 */
const PROTECTED_TABLES = new Set(['migrations']);

const GROUP_NEEDS: Record<string, ReadonlyArray<InfraNeed>> = {
  core: ['mysql'],
  worker: ['mysql', 'redis', 'bullmq'],
  smoke: ['mysql', 'redis', 'bullmq', 'external'],
};

const extractTableName = (row: unknown): string | null => {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const record = row as Record<string, unknown>;
  const tableName = record.table_name ?? record.TABLE_NAME;
  if (typeof tableName !== 'string' || tableName.trim().length === 0) {
    return null;
  }
  return tableName;
};

const cleanupTestDatabase = async (dataSource: DataSource): Promise<void> => {
  const qr = dataSource.createQueryRunner();
  try {
    console.log('🧹 开始清理测试数据库...');
    const rows = (await qr.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    )) as unknown[];
    const tables = rows
      .map((row) => extractTableName(row))
      .filter((name): name is string => !!name)
      .filter((name) => !PROTECTED_TABLES.has(name.toLowerCase()));
    if (tables.length === 0) {
      console.log('📝 未发现需要清理的表（Migration 记录表已保留）');
      return;
    }
    await qr.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const name of tables) {
      await qr.query(`TRUNCATE TABLE \`${name}\``);
    }
    await qr.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`✅ 已清理 ${tables.length} 个表的数据（保留 Migration 执行记录）`);
  } finally {
    await qr.release();
  }
};

const parseBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseNeedsFromEnv = (raw: string | undefined): Set<InfraNeed> => {
  const allowed = new Set<InfraNeed>(['mysql', 'redis', 'bullmq', 'external']);
  const values = (raw || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is InfraNeed => allowed.has(item as InfraNeed));
  return new Set<InfraNeed>(values);
};

const parseSpecsFromEnv = (raw: string | undefined): string[] => {
  return (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const shouldCheckWeappEnv = (): boolean => {
  const specs = parseSpecsFromEnv(process.env.E2E_SPECS);
  if (specs.length === 0) {
    return true;
  }
  return specs.some((spec) => spec.includes('weapp'));
};

const resolveInfraNeeds = (): Set<InfraNeed> => {
  const fromEnv = parseNeedsFromEnv(process.env.E2E_NEEDS);
  if (fromEnv.size > 0) {
    return fromEnv;
  }
  const group = (process.env.E2E_GROUP || 'core').trim();
  const needs = GROUP_NEEDS[group] ?? GROUP_NEEDS.core;
  return new Set(needs);
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

const checkRedis = async (): Promise<void> => {
  const options = buildRedisOptions();
  const client = new Redis(options);
  try {
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Unexpected Redis PING result');
    }
    console.log(`✅ Redis 连接测试成功（db=${String(options.db)}）`);
  } finally {
    if (client.status !== 'end') {
      await client.quit();
    }
  }
};

const checkBullMq = async (): Promise<void> => {
  const prefix = (process.env.BULLMQ_PREFIX || 'bullmq').trim();
  if (prefix.length === 0) {
    throw new Error('BULLMQ_PREFIX is invalid');
  }
  const queue = new Queue('__e2e_setup_healthcheck__', {
    connection: buildRedisOptions(),
    prefix,
  });
  try {
    await queue.waitUntilReady();
    console.log(`✅ BullMQ 基础连接检查成功（prefix=${prefix}）`);
  } finally {
    await queue.close();
  }
};

const ensureExternalEnv = (keys: ReadonlyArray<string>, scope: string): void => {
  const missing = keys.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`${scope} missing env: ${missing.join(', ')}`);
  }
};

const checkExternal = (): void => {
  if (shouldCheckWeappEnv()) {
    ensureExternalEnv(['WECHAT_APP_ID', 'WECHAT_APP_SECRET'], 'weapp');
  }
  const shouldCheckAi =
    (process.env.RUN_REAL_AI_E2E || '').trim().toLowerCase() === 'true' ||
    (process.env.RUN_REAL_AI_AUTH_FAIL_E2E || '').trim().toLowerCase() === 'true';
  if (shouldCheckAi) {
    ensureExternalEnv(
      ['AI_PROVIDER_MODE', 'QWEN_BASE_URL', 'QWEN_API_KEY', 'QWEN_GENERATE_MODEL'],
      'ai',
    );
    if ((process.env.RUN_REAL_AI_AUTH_FAIL_E2E || '').trim().toLowerCase() === 'true') {
      ensureExternalEnv(['QWEN_AUTH_FAIL_API_KEY'], 'ai-auth-fail');
    }
  }
  console.log('✅ External 配置检查成功');
};

const verifyMysqlTargetAndMaybeCleanup = async (options: {
  skipInfraChecks: boolean;
  skipDbCleanup: boolean;
  allowDbCleanup: boolean;
}): Promise<void> => {
  const { skipInfraChecks, skipDbCleanup, allowDbCleanup } = options;
  const dbConfig = databaseConfig() as { mysql: DataSourceOptions };
  const config: DataSourceOptions = {
    ...dbConfig.mysql,
    entities: ['src/**/*.entity{.ts,.js}'],
  };
  const ds = new DataSource(config);
  try {
    await ds.initialize();
    await ds.query('SELECT 1');
    // 🔒 硬性前置（codex review M-02）：只要本组需要 MySQL，就无条件先校验
    //    「实际连接库」属于 E2E 白名单。此调用仅 SELECT DATABASE()，不写数据。
    //    E2E_SKIP_INFRA_CHECKS / E2E_SKIP_DB_CLEANUP 最多跳过健康检查或全库 TRUNCATE，
    //    绝不能跳过本校验；库名不在白名单即在删任何数据之前抛错退出。
    const currentDatabase = await assertDataSourceOnAllowedE2eDatabase(ds);
    console.log(`🔎 E2E 目标库白名单校验通过：${currentDatabase}`);
    if (!skipInfraChecks) {
      console.log(`✅ MySQL 连接测试成功，已加载实体 ${ds.entityMetadatas.length} 个`);
    }
    if (skipDbCleanup) {
      console.log('⏭️ 已跳过 MySQL 全库清理（E2E_SKIP_DB_CLEANUP=true）；目标库白名单已校验通过');
      return;
    }
    if (!allowDbCleanup) {
      throw new Error(
        `拒绝全库清理：目标库 ${currentDatabase} 虽在白名单内，但全库 TRUNCATE 需显式设置 E2E_ALLOW_DB_CLEANUP=1 表示同意。`,
      );
    }
    await cleanupTestDatabase(ds);
  } finally {
    if (ds.isInitialized) {
      await ds.destroy();
    }
  }
};

/**
 * 加载 E2E 环境变量
 * - 优先 E2E_DOTENV 指定的路径
 * - 其次 .env.e2e / .ev.e2e
 * - 其次 .env.${NODE_ENV} / .ev.${NODE_ENV}
 */
function loadE2EEnv(): void {
  const candidates: string[] = [];

  if (process.env.E2E_DOTENV) {
    // 允许相对项目根路径的写法
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
    console.log('🌱 已加载 E2E env 文件:', envFile);
  } else {
    console.log('🌱 未找到匹配的 E2E env 文件，使用现有的 process.env');
  }

  // 兜底：确保关键变量存在
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    console.log('🔑 JWT_SECRET 未设置，已使用默认测试值');
  } else {
    console.log('🔑 JWT_SECRET 已设置: ✅');
  }
}

export default async (): Promise<void> => {
  try {
    console.log('🔧 开始初始化 E2E 测试环境...');
    loadE2EEnv();
    process.env.NODE_ENV = 'test';
    const group = (process.env.E2E_GROUP || 'core').trim();
    const skipInfraChecks = parseBoolean(process.env.E2E_SKIP_INFRA_CHECKS);
    const skipDbCleanup = parseBoolean(process.env.E2E_SKIP_DB_CLEANUP);
    const allowDbCleanup = parseBoolean(process.env.E2E_ALLOW_DB_CLEANUP);
    const needs = resolveInfraNeeds();
    console.log(
      `🧩 E2E 运行上下文: group=${group || 'core'}, needs=${Array.from(needs).join(',') || 'none'}, skipInfraChecks=${String(skipInfraChecks)}, skipDbCleanup=${String(skipDbCleanup)}, allowDbCleanup=${String(allowDbCleanup)}`,
    );
    if (needs.has('mysql')) {
      // 🔒 目标库白名单校验不可跳过：即使 E2E_SKIP_INFRA_CHECKS=true，也要先连接并校验库名，
      //    再决定是否做健康检查日志与全库 TRUNCATE。
      await verifyMysqlTargetAndMaybeCleanup({ skipInfraChecks, skipDbCleanup, allowDbCleanup });
    }
    if (skipInfraChecks) {
      console.log('⏭️ 已跳过其余基础依赖检查（E2E_SKIP_INFRA_CHECKS=true）');
      return;
    }
    if (needs.has('redis')) {
      await checkRedis();
    }
    if (needs.has('bullmq')) {
      await checkBullMq();
    }
    if (needs.has('external')) {
      checkExternal();
    }
    console.log('🚀 E2E 测试环境初始化完成');
  } catch (error) {
    console.error('❌ E2E 测试环境初始化失败:', error);
    throw error;
  }
};
