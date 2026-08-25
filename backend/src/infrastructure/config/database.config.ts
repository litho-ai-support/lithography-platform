// src/infrastructure/config/database.config.ts
import { ConfigFactory } from '@nestjs/config';

const getOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const parseStrictInteger = (raw: string): number => {
  const normalized = raw.trim();
  if (!/^-?\d+$/.test(normalized)) {
    return Number.NaN;
  }
  return Number(normalized);
};

const getIntEnvWithDefault = (key: string, defaultValue: number): number => {
  const value = getOptionalEnv(key);
  if (!value) {
    return defaultValue;
  }
  const parsed = parseStrictInteger(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${key} must be a valid integer`);
  }
  return parsed;
};

/**
 * 数据库配置工厂函数
 * 为 TypeORM 提供 MySQL 8.0 数据库连接配置
 */
const databaseConfig: ConfigFactory = () => ({
  mysql: {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: getIntEnvWithDefault('DB_PORT', 3306),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    timezone: process.env.DB_TIMEZONE || '+08:00',
    // 不根据 Entity 自动修改数据库
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    // MySQL 8.0 特定配置
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
    extra: {
      connectionLimit: getIntEnvWithDefault('DB_POOL_SIZE', 10),
      // 连接超时时间（毫秒）
      connectTimeout: 60000,
      // 是否等待连接释放
      waitForConnections: true,
      // 等待队列上限，0 为不限制
      queueLimit: 0,
    },
  },
});

export default databaseConfig;
