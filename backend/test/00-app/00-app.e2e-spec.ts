// test/00-app/00-app.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Redis, { type RedisOptions } from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { ApiModule } from '../../src/bootstraps/api/api.module';

describe('00-App 全局测试', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const resolveEnvString = (key: string): string => {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      throw new Error(`${key} is required`);
    }
    return value;
  };

  const resolveEnvNumber = (key: string): number => {
    const value = resolveEnvString(key);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${key} must be a valid number`);
    }
    return parsed;
  };

  const buildRedisOptions = (): RedisOptions => {
    const host = resolveEnvString('REDIS_HOST');
    const port = resolveEnvNumber('REDIS_PORT');
    const db = resolveEnvNumber('REDIS_DB');
    const password = process.env.REDIS_PASSWORD;
    const tlsEnabled = process.env.REDIS_TLS === 'true';
    const options: RedisOptions = {
      host,
      port,
      db,
    };
    if (password && password.trim().length > 0) {
      options.password = password;
    }
    if (tlsEnabled) {
      options.tls = {};
    }
    return options;
  };

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('HTTP 服务器应该正常响应健康检查路径', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('api');
  });

  it('应用应该正常启动并初始化', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });

  it('MySQL 连接应该正常建立', () => {
    expect(dataSource).toBeDefined();
    expect(dataSource.isInitialized).toBe(true);
  });

  it('Redis 连接应该正常建立', async () => {
    const client = new Redis(buildRedisOptions());
    try {
      const result = await client.ping();
      expect(result).toBe('PONG');
    } finally {
      if (client.status !== 'end') {
        await client.quit();
      }
    }
  });

  it('GraphQL 端点应该可访问', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __typename }' })
      .expect(200);

    expect(response.body).toBeDefined();
  });

  it('应用应该能够正常关闭', () => {
    expect(app).toHaveProperty('close');
    expect(typeof app.close).toBe('function');
  });
});
