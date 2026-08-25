// test/05-verification-record/verification-record-invite.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

interface GraphqlError {
  readonly message: string;
  readonly extensions?: Record<string, unknown>;
}

interface GraphqlBody<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly GraphqlError[];
}

type EnumValueData = Record<
  '__type',
  {
    readonly enumValues?: readonly {
      readonly name: string;
    }[];
  } | null
>;

interface CreateVerificationRecordData {
  readonly createVerificationRecord?: {
    readonly success: boolean;
    readonly token?: string | null;
    readonly message?: string | null;
    readonly data?: {
      readonly id: number;
      readonly type: string;
      readonly status: string;
      readonly expiresAt: string;
    } | null;
  } | null;
}

async function postGql(
  app: INestApplication,
  query: string,
  variables?: unknown,
  bearer?: string,
): Promise<request.Response> {
  const httpRequest = request(app.getHttpServer() as App)
    .post('/graphql')
    .send(variables ? { query, variables } : { query });

  if (bearer) {
    httpRequest.set('Authorization', `Bearer ${bearer}`);
  }

  return await httpRequest;
}

async function login(app: INestApplication, loginName: string, loginPassword: string) {
  const response = await postGql(app, LOGIN_MUTATION, {
    input: {
      loginName,
      loginPassword,
      type: 'PASSWORD',
      audience: 'DESKTOP',
    },
  });

  const body = response.body as GraphqlBody<{
    readonly login?: {
      readonly accessToken?: string | null;
    } | null;
  }>;
  const accessToken = body.data?.login?.accessToken;
  if (!accessToken) {
    throw new Error(`登录失败: ${JSON.stringify(response.body)}`);
  }

  return accessToken;
}

const LOGIN_MUTATION = `
  mutation Login($input: AuthLoginInput!) {
    login(input: $input) {
      accessToken
    }
  }
`;

const CREATE_VERIFICATION_RECORD_MUTATION = `
  mutation CreateVerificationRecord($input: CreateVerificationRecordInput!) {
    createVerificationRecord(input: $input) {
      success
      token
      message
      data {
        id
        type
        status
        expiresAt
      }
    }
  }
`;

describe('05-VerificationRecord 邀请停用 E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;
  let staffAccessToken: string;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);

    await dataSource.createQueryBuilder().delete().from(VerificationRecordEntity).execute();
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase,
      includeKeys: ['staff'],
    });

    staffAccessToken = await login(
      app,
      testAccountsConfig.staff.loginName,
      testAccountsConfig.staff.loginPassword,
    );
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('创建入口只暴露 PASSWORD_RESET 类型', async () => {
    const response = await postGql(
      app,
      `
        query CreatableVerificationRecordTypeValues {
          __type(name: "CreatableVerificationRecordType") {
            enumValues {
              name
            }
          }
        }
      `,
    );

    expect(response.status).toBe(200);
    const body = response.body as GraphqlBody<EnumValueData>;
    const enumValues = body.data?.['__type']?.enumValues?.map((item) => item.name) ?? [];

    expect(body.errors).toBeUndefined();
    expect(enumValues).toEqual(['PASSWORD_RESET']);
  });

  it.each(['INVITE_COACH', 'INVITE_MANAGER'])('不再允许创建 %s 验证记录', async (type) => {
    const response = await postGql(
      app,
      CREATE_VERIFICATION_RECORD_MUTATION,
      {
        input: {
          type,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          payload: {
            email: 'invitee@example.com',
          },
          returnToken: true,
        },
      },
      staffAccessToken,
    );

    expect([200, 400]).toContain(response.status);
    const body = response.body as GraphqlBody<CreateVerificationRecordData>;
    const messages = body.errors?.map((error) => error.message) ?? [];

    expect(messages.some((message) => message.includes(type))).toBe(true);
    expect(body.data?.createVerificationRecord).toBeUndefined();
  });

  it('PASSWORD_RESET 验证记录仍可签发', async () => {
    const response = await postGql(
      app,
      CREATE_VERIFICATION_RECORD_MUTATION,
      {
        input: {
          type: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          payload: {
            reason: 'p4-regression',
          },
          returnToken: true,
        },
      },
      staffAccessToken,
    );

    expect(response.status).toBe(200);
    const body = response.body as GraphqlBody<CreateVerificationRecordData>;
    const result = body.data?.createVerificationRecord;

    expect(body.errors).toBeUndefined();
    expect(result?.success).toBe(true);
    expect(result?.data?.type).toBe('PASSWORD_RESET');
    expect(result?.data?.status).toBe('ACTIVE');
    expect(result?.token).toEqual(expect.any(String));
  });
});
