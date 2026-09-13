// test/02-register/weapp-register-active.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { ApiModule } from '../../src/bootstraps/api/api.module';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
import type { ThirdPartySession } from '@app-types/models/third-party-auth.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { ThirdPartyAuthEntity } from '@src/modules/third-party-auth/third-party-auth.entity';
import {
  THIRD_PARTY_PROVIDER_TOKENS,
  WeAppProviderContract,
} from '@src/modules/third-party-auth/contracts/third-party-provider.contract';

/**
 * 微信小程序注册「注册成功即立即可用」完整链路 E2E。
 *
 * 使用仓库现有的 WEAPP provider mock（覆写 `THIRD_PARTY_PROVIDER_TOKENS.WEAPP`，
 * 与 `test/01-auth/auth.e2e-spec.ts` 同一模式），覆盖：
 * 1. 第三方注册成功 → 数据库 `account.status = ACTIVE` / `userInfo.userState = ACTIVE`；
 * 2. 第三方登录取得 Access Token；
 * 3. Token 可访问真实受保护 GraphQL Query。
 */
describe('Register 微信小程序注册 ACTIVE/ACTIVE 完整链路 (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const PROVIDER_USER_ID = `weapp_openid_e2e_register_${Date.now()}`;
  const AUTH_CREDENTIAL = 'e2e-weapp-register-code';

  type GqlBody = {
    data?: {
      thirdPartyRegister?: { success?: boolean; accountId?: number };
      thirdPartyLogin?: { accessToken?: string; accountId?: number };
    };
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  const mockWeAppProvider: WeAppProviderContract = {
    provider: ThirdPartyProviderEnum.WEAPP,
    exchangeCredential: ({
      authCredential,
    }: {
      authCredential: string;
    }): Promise<ThirdPartySession> =>
      Promise.resolve({
        providerUserId:
          authCredential === AUTH_CREDENTIAL ? PROVIDER_USER_ID : 'weapp_openid_other',
        unionId: null,
        profile: { nickname: 'WeappRegisterE2E' },
        sessionKeyRaw: 'mock-session-key',
      }),
    getAccessToken: () => Promise.resolve('mock-access-token'),
    getPhoneNumber: () =>
      Promise.resolve({
        phoneNumber: '13800138000',
        purePhoneNumber: '13800138000',
        countryCode: '86',
      }),
    createWxaCodeUnlimit: () =>
      Promise.resolve({ buffer: Buffer.from('mock-qrcode'), contentType: 'image/png' }),
  };

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    })
      .overrideProvider(THIRD_PARTY_PROVIDER_TOKENS.WEAPP)
      .useValue(mockWeAppProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await app.init();
  }, 30000);

  afterAll(async () => {
    await cleanupCreatedAccounts();
    if (app) await app.close();
  });

  const cleanupCreatedAccounts = async (): Promise<void> => {
    try {
      if (!dataSource?.isInitialized) return;
      // 仅清理本 spec 注册产生的账号（按 mock openid 的绑定关系定位）
      const thirdPartyRepo = dataSource.getRepository(ThirdPartyAuthEntity);
      const bindings = await thirdPartyRepo.find({
        where: { provider: ThirdPartyProviderEnum.WEAPP, providerUserId: PROVIDER_USER_ID },
        select: { accountId: true },
      });
      const accountIds = bindings.map((binding) => binding.accountId);
      if (accountIds.length > 0) {
        await dataSource.getRepository(UserInfoEntity).delete({ accountId: In(accountIds) });
        await thirdPartyRepo.delete({ providerUserId: PROVIDER_USER_ID });
        await dataSource.getRepository(AccountEntity).delete({ id: In(accountIds) });
      }
    } catch (error) {
      console.warn('清理测试数据失败:', error);
    }
  };

  const performThirdPartyRegister = async () =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation ThirdPartyRegister($input: ThirdPartyRegisterInput!) {
            thirdPartyRegister(input: $input) { success message accountId }
          }
        `,
        variables: {
          input: {
            provider: ThirdPartyProviderEnum.WEAPP,
            authCredential: AUTH_CREDENTIAL,
            audience: AudienceTypeEnum.SSTSWEAPP,
          },
        },
      });

  const performThirdPartyLogin = async () =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation ThirdPartyLogin($input: ThirdPartyLoginInput!) {
            thirdPartyLogin(input: $input) { accessToken accountId }
          }
        `,
        variables: {
          input: {
            provider: ThirdPartyProviderEnum.WEAPP,
            authCredential: AUTH_CREDENTIAL,
            audience: AudienceTypeEnum.SSTSWEAPP,
          },
        },
      });

  const queryProtectedUserInfo = async (token: string, accountId: number) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          query ProtectedUserInfo($accountId: Int!) {
            userInfo(accountId: $accountId) { id accountId nickname userState }
          }
        `,
        variables: { accountId },
      });

  it('注册 → 数据库 ACTIVE/ACTIVE → 第三方登录取 Token → 访问受保护 Query', async () => {
    const registerResponse = await performThirdPartyRegister();

    expect(registerResponse.status).toBe(200);
    const registerBody = registerResponse.body as GqlBody;
    expect(registerBody.errors).toBeUndefined();
    expect(registerBody.data?.thirdPartyRegister?.success).toBe(true);
    const accountId = registerBody.data?.thirdPartyRegister?.accountId;
    expect(typeof accountId).toBe('number');

    // 数据库事实：account.status 与 userInfo.userState 同为 ACTIVE
    const account = await dataSource
      .getRepository(AccountEntity)
      .findOne({ where: { id: accountId } });
    expect(account?.status).toBe(AccountStatus.ACTIVE);
    expect(account?.identityHint).toBe(IdentityTypeEnum.CUSTOMER);

    const userInfo = await dataSource
      .getRepository(UserInfoEntity)
      .findOne({ where: { accountId } });
    expect(userInfo?.userState).toBe(UserState.ACTIVE);
    expect(userInfo?.accessGroup).toContain(IdentityTypeEnum.CUSTOMER);

    // 第三方登录取得 Token
    const loginResponse = await performThirdPartyLogin();
    expect(loginResponse.status).toBe(200);
    const loginBody = loginResponse.body as GqlBody;
    expect(loginBody.errors).toBeUndefined();
    expect(loginBody.data?.thirdPartyLogin?.accountId).toBe(accountId);
    const accessToken = loginBody.data?.thirdPartyLogin?.accessToken;
    expect(typeof accessToken).toBe('string');

    // Token 访问真实受保护 GraphQL Query 成功
    const protectedResponse = await queryProtectedUserInfo(accessToken as string, accountId!);
    expect(protectedResponse.status).toBe(200);
    const protectedBody = protectedResponse.body as {
      data?: { userInfo?: { accountId?: number } };
      errors?: GqlBody['errors'];
    };
    expect(protectedBody.errors).toBeUndefined();
    expect(protectedBody.data?.userInfo?.accountId).toBe(accountId);
  });
});
