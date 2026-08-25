// src/infrastructure/database/verify-empty-db-migrations.ts
import 'reflect-metadata';
import 'tsconfig-paths/register';

import databaseConfig from '@src/infrastructure/config/database.config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

type MysqlDataSourceOptions = Extract<DataSourceOptions, { type: 'mysql' | 'mariadb' }>;

interface MysqlConnectionConfig {
  type: 'mysql';
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  timezone?: string;
  charset?: string;
  extra?: Record<string, unknown>;
}

const REQUIRED_TABLES = [
  'ai_provider_call_record',
  'ai_workflow_context',
  'base_user_account',
  'base_user_info',
  'base_async_task_record',
  'base_third_party_auth',
  'base_verification_record',
] as const;

const REQUIRED_INDEXES: ReadonlyArray<{ table: string; index: string }> = [
  { table: 'base_user_account', index: 'uk_login_email' },
  { table: 'base_third_party_auth', index: 'base_third_party_auth_provider_IDX' },
  { table: 'base_async_task_record', index: 'uk_queue_name_job_id' },
  { table: 'ai_provider_call_record', index: 'uk_ai_provider_call_trace_seq' },
  { table: 'ai_workflow_context', index: 'uk_ai_workflow_context_type_active_dedup_hash' },
  { table: 'ai_workflow_context', index: 'uk_ai_workflow_context_queue_job' },
  { table: 'base_verification_record', index: 'uk_token_fp' },
];

const REQUIRED_FOREIGN_KEYS: ReadonlyArray<{
  table: string;
  constraint: string;
  referencedTable: string;
}> = [
  {
    table: 'base_user_info',
    constraint: 'base_user_info_ibfk_1',
    referencedTable: 'base_user_account',
  },
];

interface DrillDatabaseTarget {
  readonly databaseName: string;
  readonly shouldCreate: boolean;
  readonly shouldDrop: boolean;
}

/**
 * 输出标准信息日志。
 */
function writeInfo(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * 输出标准错误日志。
 */
function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * 判断查询结果是否为数组结构。
 */
function isQueryRows(value: unknown): value is ReadonlyArray<Record<string, unknown>> {
  return Array.isArray(value);
}

/**
 * 执行存在性查询并返回结果。
 */
async function hasQueryResult(
  dataSource: DataSource,
  query: string,
  params: string[],
): Promise<boolean> {
  const rows: unknown = await dataSource.query(query, params);
  if (!isQueryRows(rows)) {
    throw new Error('查询返回格式异常，预期为数组');
  }
  return rows.length > 0;
}

/**
 * 加载 Migration 演练所需环境变量。
 */
function loadMigrationDrillEnv(): void {
  const candidates = [
    process.env.MIGRATION_DRILL_DOTENV
      ? path.resolve(process.cwd(), process.env.MIGRATION_DRILL_DOTENV)
      : null,
    path.resolve(process.cwd(), 'env/.env.e2e'),
    path.resolve(process.cwd(), 'env/.ev.e2e'),
    path.resolve(process.cwd(), 'env/.env.development'),
    path.resolve(process.cwd(), 'env/.ev.development'),
  ].filter((item): item is string => item !== null);

  const envFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (envFile) {
    dotenv.config({ path: envFile });
    writeInfo(`🌱 已加载环境文件: ${envFile}`);
  } else {
    writeInfo('🌱 未找到环境文件，使用当前进程环境变量');
  }
}

/**
 * 解析演练数据库目标。
 */
function resolveDrillDatabaseTarget(mysqlConfig: MysqlConnectionConfig): DrillDatabaseTarget {
  const configuredDatabase = process.env.MIGRATION_DRILL_DATABASE?.trim();
  if (configuredDatabase) {
    return {
      databaseName: configuredDatabase,
      shouldCreate: false,
      shouldDrop: false,
    };
  }

  if (process.env.MIGRATION_DRILL_CREATE_TEMP_DB === 'true') {
    const dbPrefix = (mysqlConfig.database ?? 'worker_backend').replace(/[^a-zA-Z0-9_]/g, '_');
    return {
      databaseName: `${dbPrefix}_baseline_drill_${Date.now()}`,
      shouldCreate: true,
      shouldDrop: true,
    };
  }

  const configuredAppDatabase = mysqlConfig.database?.trim();
  if (configuredAppDatabase) {
    return {
      databaseName: configuredAppDatabase,
      shouldCreate: false,
      shouldDrop: false,
    };
  }

  throw new Error(
    '未指定演练数据库，请设置 DB_NAME 或 MIGRATION_DRILL_DATABASE；如确需临时建库，请设置 MIGRATION_DRILL_CREATE_TEMP_DB=true',
  );
}

/**
 * 读取并校验 MySQL 连接配置。
 */
function loadMysqlConfig(): MysqlConnectionConfig {
  const config = databaseConfig() as { mysql: MysqlConnectionConfig };
  const mysql = config.mysql;

  if (!mysql?.host || !mysql.port || !mysql.username) {
    throw new Error('数据库配置不完整，至少需要 DB_HOST/DB_PORT/DB_USER');
  }

  return mysql;
}

/**
 * 对数据库标识符进行安全转义。
 */
function escapeIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

/**
 * 构建用于管理库操作（创建/删除数据库）的连接配置。
 */
function buildAdminDataSourceOptions(config: MysqlConnectionConfig): MysqlDataSourceOptions {
  return {
    type: 'mysql',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    timezone: config.timezone,
    charset: config.charset,
    logging: false,
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    extra: config.extra,
  };
}

/**
 * 构建用于执行 migration 的空库连接配置。
 */
function buildMigrationDataSourceOptions(
  config: MysqlConnectionConfig,
  databaseName: string,
): MysqlDataSourceOptions {
  return {
    ...buildAdminDataSourceOptions(config),
    database: databaseName,
    migrations: [
      path.resolve(__dirname, './migrations/*.migration.ts'),
      path.resolve(__dirname, './migrations/*.migration.js'),
    ],
  };
}

/**
 * 校验关键表是否存在。
 */
async function assertRequiredTables(dataSource: DataSource, databaseName: string): Promise<void> {
  for (const tableName of REQUIRED_TABLES) {
    const exists = await hasQueryResult(
      dataSource,
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_name = ?
        LIMIT 1
      `,
      [databaseName, tableName],
    );

    if (!exists) {
      throw new Error(`关键表缺失: ${tableName}`);
    }
  }
}

/**
 * 校验关键索引是否存在。
 */
async function assertRequiredIndexes(dataSource: DataSource, databaseName: string): Promise<void> {
  for (const item of REQUIRED_INDEXES) {
    const exists = await hasQueryResult(
      dataSource,
      `
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = ?
          AND table_name = ?
          AND index_name = ?
        LIMIT 1
      `,
      [databaseName, item.table, item.index],
    );

    if (!exists) {
      throw new Error(`关键索引缺失: ${item.table}.${item.index}`);
    }
  }
}

/**
 * 校验关键外键是否存在。
 */
async function assertRequiredForeignKeys(
  dataSource: DataSource,
  databaseName: string,
): Promise<void> {
  for (const item of REQUIRED_FOREIGN_KEYS) {
    const exists = await hasQueryResult(
      dataSource,
      `
        SELECT 1
        FROM information_schema.referential_constraints
        WHERE constraint_schema = ?
          AND table_name = ?
          AND constraint_name = ?
          AND referenced_table_name = ?
        LIMIT 1
      `,
      [databaseName, item.table, item.constraint, item.referencedTable],
    );

    if (!exists) {
      throw new Error(`关键外键缺失: ${item.table}.${item.constraint} -> ${item.referencedTable}`);
    }
  }
}

/**
 * 校验目标数据库名称，避免误操作生产库。
 */
function ensureSafeDatabaseTarget(databaseName: string): void {
  const isExplicitlyAllowed = process.env.MIGRATION_DRILL_ALLOW_NON_TEST_DB === 'true';
  const lower = databaseName.toLowerCase();
  const looksSafe = lower.includes('test') || lower.includes('drill') || lower.includes('ci');

  if (!looksSafe && !isExplicitlyAllowed) {
    throw new Error(
      `数据库名 ${databaseName} 未包含 test/drill/ci，已拒绝执行。若确认安全请设置 MIGRATION_DRILL_ALLOW_NON_TEST_DB=true`,
    );
  }
}

/**
 * 清空目标数据库中的全部表，确保 migration 在空库语义下执行。
 */
async function clearDatabaseTables(dataSource: DataSource, databaseName: string): Promise<void> {
  const rows: unknown = await dataSource.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
    `,
    [databaseName],
  );

  if (!isQueryRows(rows)) {
    throw new Error('读取数据库表清单失败，返回格式异常');
  }

  if (rows.length === 0) {
    return;
  }

  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const row of rows) {
      const tableNameCandidate = row['table_name'] ?? row['TABLE_NAME'];
      const tableNameValue =
        typeof tableNameCandidate === 'string' ? tableNameCandidate : String(tableNameCandidate);
      if (typeof tableNameValue !== 'string' || tableNameValue.length === 0) {
        throw new Error('读取到非法表名，无法继续清库');
      }
      await dataSource.query(`DROP TABLE IF EXISTS ${escapeIdentifier(tableNameValue)}`);
    }
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

/**
 * 执行空库 migration 演练，失败时抛错以阻断 CI。
 */
async function runEmptyDbMigrationDrill(): Promise<void> {
  loadMigrationDrillEnv();
  const mysqlConfig = loadMysqlConfig();
  const target = resolveDrillDatabaseTarget(mysqlConfig);
  ensureSafeDatabaseTarget(target.databaseName);

  const adminDataSource = new DataSource(buildAdminDataSourceOptions(mysqlConfig));
  const migrationDataSource = new DataSource(
    buildMigrationDataSourceOptions(mysqlConfig, target.databaseName),
  );

  let adminInitialized = false;
  let migrationInitialized = false;

  try {
    writeInfo('🔧 开始空库 migration 演练...');
    await adminDataSource.initialize();
    adminInitialized = true;

    if (target.shouldCreate) {
      try {
        await adminDataSource.query(
          `CREATE DATABASE ${escapeIdentifier(target.databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
        );
        writeInfo(`🆕 已创建空库: ${target.databaseName}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '未知建库错误';
        throw new Error(
          `自动建库失败，请为当前账号授予 CREATE/DROP DATABASE 权限，或设置 MIGRATION_DRILL_DATABASE 使用预置空库。原始错误: ${message}`,
          {
            cause: error,
          },
        );
      }
    } else {
      writeInfo(`📌 使用指定演练库: ${target.databaseName}`);
    }

    try {
      await migrationDataSource.initialize();
      migrationInitialized = true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知连接错误';
      throw new Error(
        `连接演练库失败，请确认账号对 ${target.databaseName} 具备访问与建表权限，或改用 MIGRATION_DRILL_DATABASE。原始错误: ${message}`,
        {
          cause: error,
        },
      );
    }
    await clearDatabaseTables(migrationDataSource, target.databaseName);
    writeInfo('🧽 目标数据库已清空');

    const executedMigrations = await migrationDataSource.runMigrations({ transaction: 'all' });
    if (executedMigrations.length === 0) {
      throw new Error('未执行任何 migration，请检查 migration 配置');
    }
    writeInfo(`✅ migration 执行成功，共 ${executedMigrations.length} 条`);

    await assertRequiredTables(migrationDataSource, target.databaseName);
    await assertRequiredIndexes(migrationDataSource, target.databaseName);
    await assertRequiredForeignKeys(migrationDataSource, target.databaseName);
    writeInfo('✅ 关键表、关键索引与关键外键校验通过');
    writeInfo('🎉 空库 migration 演练通过');
  } finally {
    if (migrationInitialized) {
      await migrationDataSource.destroy();
    }
    if (adminInitialized && target.shouldDrop) {
      try {
        await adminDataSource.query(
          `DROP DATABASE IF EXISTS ${escapeIdentifier(target.databaseName)}`,
        );
        writeInfo(`🧹 已清理临时数据库: ${target.databaseName}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '未知清理错误';
        writeError(`⚠️ 临时数据库清理失败: ${message}`);
      }
    }
    if (adminInitialized) {
      await adminDataSource.destroy();
    }
  }
}

void runEmptyDbMigrationDrill().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误';
  writeError(`❌ 空库 migration 演练失败: ${message}`);
  process.exit(1);
});
