// 文件位置：test/04-user-info/update-access-group.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { ApiModule } from '../../src/bootstraps/api/api.module';

type MutationRootResponse = {
  data?: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __schema?: {
      mutationType?: {
        fields?: Array<{ name: string }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
};

describe('UpdateAccessGroup schema removal (e2e)', () => {
  let app: INestApplication;
  let previousIntrospectionEnabled: string | undefined;

  beforeAll(async () => {
    // E2E 基线默认关闭 introspection；本 spec 只在 API 初始化期间临时开启，用于核验
    // Mutation root 的公开契约，不修改任何 .env 或运行时生产配置。
    previousIntrospectionEnabled = process.env.GRAPHQL_INTROSPECTION_ENABLED;
    process.env.GRAPHQL_INTROSPECTION_ENABLED = 'true';
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (previousIntrospectionEnabled === undefined) {
      delete process.env.GRAPHQL_INTROSPECTION_ENABLED;
    } else {
      process.env.GRAPHQL_INTROSPECTION_ENABLED = previousIntrospectionEnabled;
    }
  });

  it('Mutation root 不暴露 updateAccessGroup', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          query MutationRoot {
            __schema {
              mutationType {
                fields { name }
              }
            }
          }
        `,
      })
      .expect(200);
    const body = response.body as MutationRootResponse;

    expect(body.errors).toBeUndefined();
    const fieldNames = body.data?.__schema?.mutationType?.fields?.map((field) => field.name);
    expect(fieldNames).toBeDefined();
    expect(fieldNames).not.toContain('updateAccessGroup');
  });
});
