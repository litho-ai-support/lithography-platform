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

type InputTypeResponse = {
  data?: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __type?: {
      inputFields?: Array<{ name: string }>;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

describe('Schema 下线契约 (e2e)：updateAccessGroup / adminChangeUserRole / identityHint', () => {
  let app: INestApplication;
  let previousIntrospectionEnabled: string | undefined;

  beforeAll(async () => {
    // E2E 基线默认关闭 introspection；本 spec 只在 API 初始化期间临时开启，用于核验
    // Mutation root 与输入类型的公开契约，不修改任何 .env 或运行时生产配置。
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

  it('Mutation root 不暴露 adminChangeUserRole（创建后角色只读，无公开角色修改入口）', async () => {
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
    expect(fieldNames).not.toContain('adminChangeUserRole');
  });

  it('UpdateUserInfoInput 不包含 identityHint', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          query UpdateUserInfoInputType {
            __type(name: "UpdateUserInfoInput") {
              inputFields { name }
            }
          }
        `,
      })
      .expect(200);
    const body = response.body as InputTypeResponse;

    expect(body.errors).toBeUndefined();
    const fieldNames = body.data?.__type?.inputFields?.map((field) => field.name);
    expect(fieldNames).toBeDefined();
    expect(fieldNames).not.toContain('identityHint');
  });
});
