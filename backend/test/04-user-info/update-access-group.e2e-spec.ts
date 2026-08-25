// 文件位置：test/04-user-info/update-access-group.e2e-spec.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { ApiModule } from '../../src/bootstraps/api/api.module';
import { AccountEntity } from '../../src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '../../src/modules/account/base/entities/user-info.entity';
import { getAccountIdByLoginName, login } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

type UpdateAccessGroupInput = {
  accountId: number;
  accessGroup: IdentityTypeEnum[];
  identityHint?: IdentityTypeEnum;
};

type UpdateAccessGroupResult = {
  accountId: number;
  accessGroup: IdentityTypeEnum[];
  identityHint: IdentityTypeEnum;
  isUpdated: boolean;
};

type GqlError = {
  message: string;
  extensions?: { code?: string; errorCode?: string };
};

type UpdateAccessGroupResponse = {
  data?: { updateAccessGroup?: UpdateAccessGroupResult };
  errors?: GqlError[];
};

/**
 * 执行 updateAccessGroup GraphQL 变更
 */
async function executeUpdateAccessGroup(params: {
  app: INestApplication;
  token: string;
  input: UpdateAccessGroupInput;
}): Promise<Response> {
  const { app, token, input } = params;
  return await request(app.getHttpServer())
    .post('/graphql')
    .set('Authorization', `Bearer ${token}`)
    .send({
      query: `
        mutation UpdateAccessGroup($input: UpdateAccessGroupInput!) {
          updateAccessGroup(input: $input) {
            accountId
            accessGroup
            identityHint
            isUpdated
          }
        }
      `,
      variables: { input },
    })
    .expect(200);
}

/**
 * 读取 updateAccessGroup 响应体
 */
function readUpdateAccessGroupBody(params: { response: Response }): UpdateAccessGroupResponse {
  return params.response.body as UpdateAccessGroupResponse;
}

describe('UpdateAccessGroup (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let staffToken: string;
  let guestPrimaryToken: string;

  let adminAccountId: number;
  let staffAccountId: number;
  let guestPrimaryAccountId: number;
  let guestSecondaryAccountId: number;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      includeKeys: ['admin', 'staff', 'guestPrimary', 'guestSecondary'],
    });

    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });
    staffToken = await login({
      app,
      loginName: testAccountsConfig.staff.loginName,
      loginPassword: testAccountsConfig.staff.loginPassword,
    });
    guestPrimaryToken = await login({
      app,
      loginName: testAccountsConfig.guestPrimary.loginName,
      loginPassword: testAccountsConfig.guestPrimary.loginPassword,
    });

    adminAccountId = await getAccountIdByLoginName(dataSource, testAccountsConfig.admin.loginName);
    staffAccountId = await getAccountIdByLoginName(dataSource, testAccountsConfig.staff.loginName);
    guestPrimaryAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestPrimary.loginName,
    );
    guestSecondaryAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.guestSecondary.loginName,
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('正例', () => {
    it('ADMIN 更新访客为 staff 并自动生成身份提示', async () => {
      const input: UpdateAccessGroupInput = {
        accountId: guestSecondaryAccountId,
        accessGroup: [IdentityTypeEnum.STAFF],
      };
      const res = await executeUpdateAccessGroup({ app, token: adminToken, input });
      const body = readUpdateAccessGroupBody({ response: res });

      expect(body.errors).toBeUndefined();
      const result = body.data?.updateAccessGroup;
      if (!result) throw new Error('更新访问组失败：缺少返回数据');
      expect(result.accessGroup).toEqual([IdentityTypeEnum.STAFF]);
      expect(result.identityHint).toBe(IdentityTypeEnum.STAFF);
      expect(result.isUpdated).toBe(true);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const userInfoRepo = dataSource.getRepository(UserInfoEntity);
      const updatedUserInfo = await userInfoRepo.findOne({
        where: { accountId: guestSecondaryAccountId },
      });
      if (!updatedUserInfo) throw new Error('用户信息不存在');
      expect(updatedUserInfo.accessGroup).toEqual([IdentityTypeEnum.STAFF]);
      expect(updatedUserInfo.metaDigest).toEqual([IdentityTypeEnum.STAFF]);

      const updatedAccount = await accountRepo.findOne({ where: { id: guestSecondaryAccountId } });
      if (!updatedAccount) throw new Error('账户不存在');
      expect(updatedAccount.identityHint).toBe(IdentityTypeEnum.STAFF);
    });

    it('STAFF 指定身份提示更新访客访问组', async () => {
      const input: UpdateAccessGroupInput = {
        accountId: guestPrimaryAccountId,
        accessGroup: [IdentityTypeEnum.GUEST, IdentityTypeEnum.STAFF],
        identityHint: IdentityTypeEnum.STAFF,
      };
      const res = await executeUpdateAccessGroup({ app, token: staffToken, input });
      const body = readUpdateAccessGroupBody({ response: res });

      expect(body.errors).toBeUndefined();
      const result = body.data?.updateAccessGroup;
      if (!result) throw new Error('更新访问组失败：缺少返回数据');
      expect(result.accessGroup).toEqual([IdentityTypeEnum.GUEST, IdentityTypeEnum.STAFF]);
      expect(result.identityHint).toBe(IdentityTypeEnum.STAFF);
      expect(result.isUpdated).toBe(true);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const userInfoRepo = dataSource.getRepository(UserInfoEntity);
      const updatedUserInfo = await userInfoRepo.findOne({
        where: { accountId: guestPrimaryAccountId },
      });
      if (!updatedUserInfo) throw new Error('用户信息不存在');
      expect(updatedUserInfo.accessGroup).toEqual([IdentityTypeEnum.GUEST, IdentityTypeEnum.STAFF]);
      expect(updatedUserInfo.metaDigest).toEqual([IdentityTypeEnum.GUEST, IdentityTypeEnum.STAFF]);

      const updatedAccount = await accountRepo.findOne({ where: { id: guestPrimaryAccountId } });
      if (!updatedAccount) throw new Error('账户不存在');
      expect(updatedAccount.identityHint).toBe(IdentityTypeEnum.STAFF);
    });

    it('幂等：重复访问组不触发更新', async () => {
      const prepare = await executeUpdateAccessGroup({
        app,
        token: staffToken,
        input: {
          accountId: guestPrimaryAccountId,
          accessGroup: [IdentityTypeEnum.GUEST],
          identityHint: IdentityTypeEnum.GUEST,
        },
      });
      const prepareBody = readUpdateAccessGroupBody({ response: prepare });
      if (prepareBody.errors) throw new Error('前置失败：无法准备访问组');

      const res = await executeUpdateAccessGroup({
        app,
        token: staffToken,
        input: {
          accountId: guestPrimaryAccountId,
          accessGroup: [IdentityTypeEnum.GUEST, IdentityTypeEnum.GUEST],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });

      expect(body.errors).toBeUndefined();
      const result = body.data?.updateAccessGroup;
      if (!result) throw new Error('更新访问组失败：缺少返回数据');
      expect(result.accessGroup).toEqual([IdentityTypeEnum.GUEST]);
      expect(result.identityHint).toBe(IdentityTypeEnum.GUEST);
      expect(result.isUpdated).toBe(false);
    });
  });

  describe('负例', () => {
    it('GUEST 更新访问组应拒绝', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: guestPrimaryToken,
        input: {
          accountId: guestSecondaryAccountId,
          accessGroup: [IdentityTypeEnum.GUEST],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('GUEST 更新 staff 访问组应拒绝', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: guestPrimaryToken,
        input: {
          accountId: staffAccountId,
          accessGroup: [IdentityTypeEnum.STAFF],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('访问组为空应返回校验错误', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: adminToken,
        input: {
          accountId: adminAccountId,
          accessGroup: [],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('身份提示不在访问组内应报错', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: adminToken,
        input: {
          accountId: guestSecondaryAccountId,
          accessGroup: [IdentityTypeEnum.GUEST],
          identityHint: IdentityTypeEnum.STAFF,
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('OPERATION_NOT_SUPPORTED');
    });

    it('目标账户不存在应报错', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: adminToken,
        input: {
          accountId: 999999,
          accessGroup: [IdentityTypeEnum.GUEST],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('ACCOUNT_NOT_FOUND');
    });
  });
});
