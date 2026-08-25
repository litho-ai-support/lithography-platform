// test/01-auth/auth.e2e-spec.ts
import {
  AccountStatus,
  IdentityTypeEnum,
  LoginTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';

import { Gender, UserState } from '@app-types/models/user-info.types';
import { ThirdPartySession } from '@app-types/models/third-party-auth.types';
import {
  THIRD_PARTY_PROVIDER_TOKENS,
  WeAppProviderContract,
} from '@src/modules/third-party-auth/contracts/third-party-provider.contract';
import { ThirdPartyAuthEntity } from '@src/modules/third-party-auth/third-party-auth.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * Auth 模块基础 E2E 测试
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 使用统一的测试账号配置
  const { guest: activeUser } = testAccountsConfig;

  // WeApp 模拟的 openid/unionid（绑定/未绑定场景）
  const MOCK_WEAPP_OPENID_BOUND = 'weapp_openid_e2e_guest_1';
  const MOCK_WEAPP_OPENID_UNBOUND = 'weapp_openid_e2e_unbound_1';
  const MOCK_WEAPP_UNIONID = 'weapp_union_e2e_guest_1';

  // 额外的测试账号（仅用于特殊状态测试）
  const bannedUser = {
    loginName: 'banneduser',
    loginEmail: 'banned@example.com',
    loginPassword: 'testBanned@2024',
    status: AccountStatus.BANNED,
    accessGroup: [IdentityTypeEnum.REGISTRANT],
    identityType: IdentityTypeEnum.REGISTRANT,
  };

  const pendingUser = {
    loginName: 'pendinguser',
    loginEmail: 'pending@example.com',
    loginPassword: 'testPending@2024',
    status: AccountStatus.PENDING,
    accessGroup: [IdentityTypeEnum.REGISTRANT],
    identityType: IdentityTypeEnum.REGISTRANT,
  };

  // 覆写 WeAppProvider：根据 authCredential 返回不同的 openid（绑定 / 未绑定）
  const mockWeAppProvider: WeAppProviderContract = {
    provider: ThirdPartyProviderEnum.WEAPP,
    exchangeCredential: ({ authCredential }): Promise<ThirdPartySession> => {
      if (authCredential === 'e2e-unbound') {
        return Promise.resolve({
          providerUserId: MOCK_WEAPP_OPENID_UNBOUND,
          unionId: null,
          profile: { nickname: 'UnboundUser' },
          sessionKeyRaw: 'mock-session-key-unbound',
        });
      }
      return Promise.resolve({
        providerUserId: MOCK_WEAPP_OPENID_BOUND,
        unionId: MOCK_WEAPP_UNIONID,
        profile: { nickname: 'BoundUser' },
        sessionKeyRaw: 'mock-session-key-bound',
      });
    },
    getAccessToken: () => Promise.resolve('mock-access-token'),
    getPhoneNumber: () =>
      Promise.resolve({
        phoneNumber: '13800138000',
        purePhoneNumber: '13800138000',
        countryCode: '86',
      }),
    createWxaCodeUnlimit: () =>
      Promise.resolve({
        buffer: Buffer.from('mock-qrcode'),
        contentType: 'image/png',
      }),
  };

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    })
      .overrideProvider(THIRD_PARTY_PROVIDER_TOKENS.WEAPP)
      .useValue(mockWeAppProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createTestAccounts();
  });

  /**
   * 清理测试数据
   */
  const cleanupTestData = async (): Promise<void> => {
    try {
      // 先清理第三方绑定记录
      const thirdPartyRepo = dataSource.getRepository(ThirdPartyAuthEntity);
      await thirdPartyRepo.clear();

      // 清理统一测试账号
      await cleanupTestAccounts(dataSource);

      // 清理额外的特殊状态测试账号
      const accountRepository = dataSource.getRepository(AccountEntity);
      const specialAccounts = [bannedUser, pendingUser];
      const loginNames = specialAccounts.map((account) => account.loginName);

      if (loginNames.length > 0) {
        await accountRepository.delete({
          loginName: In(loginNames),
        });
      }
    } catch (error) {
      console.warn('清理测试数据失败:', error);
    }
  };

  /**
   * 创建测试账户数据
   */
  const createTestAccounts = async (): Promise<void> => {
    try {
      // 创建统一测试账号
      await seedTestAccounts({
        dataSource,
        createAccountUsecase,
        includeKeys: ['guest'], // 只创建 guest 账号作为 activeUser
      });

      // 创建额外的特殊状态测试账号
      const specialAccounts = [bannedUser, pendingUser];
      await Promise.all(
        specialAccounts.map(async (account) => {
          await createAccountUsecase.execute({
            accountData: {
              loginName: account.loginName,
              loginEmail: account.loginEmail,
              loginPassword: account.loginPassword,
              status: account.status,
              identityHint: account.identityType,
            },
            userInfoData: {
              nickname: `${account.loginName}_nickname`,
              gender: Gender.SECRET,
              birthDate: null,
              avatarUrl: null,
              email: account.loginEmail,
              signature: null,
              accessGroup: account.accessGroup,
              address: null,
              phone: null,
              tags: null,
              geographic: null,
              metaDigest: account.accessGroup,
              notifyCount: 0,
              unreadCount: 0,
              userState: UserState.ACTIVE,
            },
          });
        }),
      );

      // 绑定 WeApp 第三方登录到 guest 账号
      await seedWeAppThirdPartyBinding();
    } catch (error) {
      console.error('❌ 创建测试账户失败:', error);
      throw error;
    }
  };

  /**
   * 为 guest 账号绑定 WeApp 第三方登录
   */
  const seedWeAppThirdPartyBinding = async (): Promise<void> => {
    const accountRepository = dataSource.getRepository(AccountEntity);
    const thirdPartyRepo = dataSource.getRepository(ThirdPartyAuthEntity);

    const account = await accountRepository.findOne({ where: { loginName: activeUser.loginName } });
    if (!account) return;

    const existed = await thirdPartyRepo.findOne({
      where: { accountId: account.id, provider: ThirdPartyProviderEnum.WEAPP },
    });

    if (!existed) {
      await thirdPartyRepo.save(
        thirdPartyRepo.create({
          accountId: account.id,
          provider: ThirdPartyProviderEnum.WEAPP,
          providerUserId: MOCK_WEAPP_OPENID_BOUND,
          unionId: MOCK_WEAPP_UNIONID,
          accessToken: null,
        }),
      );
    }
  };

  /**
   * 执行 GraphQL 登录请求
   */
  const performLogin = async (
    loginName: string,
    loginPassword: string,
    type: LoginTypeEnum = LoginTypeEnum.PASSWORD,
    audience: string = 'DESKTOP',
    ip: string = '127.0.0.1',
  ) => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              accessToken
              refreshToken
              accountId
              role
              userInfo {
                userInfoId: id
                accountId
                nickname
                gender
                birthDate
                avatarUrl
                email
                signature
                accessGroup
                address
                phone
                tags
                geographic
                notifyCount
                unreadCount
                userState
                createdAt
                updatedAt
              }
            }
          }
        `,
        variables: {
          input: {
            loginName,
            loginPassword,
            type,
            audience,
            ip,
          },
        },
      });

    return response;
  };

  /**
   * 执行 GraphQL 第三方 WeApp 登录请求
   */
  const performThirdPartyLogin = async (
    provider: ThirdPartyProviderEnum,
    authCredential: string,
    audience: string = 'SSTSTEST',
    ip: string = '127.0.0.1',
  ) => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation ThirdPartyLogin($input: ThirdPartyLoginInput!) {
            thirdPartyLogin(input: $input) {
              accessToken
              refreshToken
              accountId
              role
              userInfo {
                userInfoId: id
                accountId
                nickname
                gender
                birthDate
                avatarUrl
                email
                signature
                accessGroup
                address
                phone
                tags
                geographic
                notifyCount
                unreadCount
                userState
                createdAt
                updatedAt
              }
            }
          }
        `,
        variables: {
          input: {
            provider,
            authCredential,
            audience,
            ip,
          },
        },
      });

    return response;
  };

  describe('登录成功场景', () => {
    it('应该支持用户名登录成功', async () => {
      const response = await performLogin(
        activeUser.loginName,
        activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'DESKTOP',
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
    });

    it('应该支持邮箱登录成功', async () => {
      const response = await performLogin(activeUser.loginEmail, activeUser.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
    });

    it('应该支持有效的 audience 登录成功', async () => {
      const response = await performLogin(
        activeUser.loginName,
        activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'SSTSTEST',
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
    });

    it('登录成功后应该返回正确的用户 ID', async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: activeUser.loginName },
      });

      const response = await performLogin(activeUser.loginName, activeUser.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBe(account?.id);
    });

    it('应该正确决策用户角色', async () => {
      const response = await performLogin(activeUser.loginName, activeUser.loginPassword);

      const { data } = response.body;
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
      expect(data?.login.role).toBe(activeUser.identityType);
    });

    it('应该拒绝无效的 audience', async () => {
      const response = await performLogin(
        activeUser.loginName,
        activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'invalid-audience',
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain(
        'Value "invalid-audience" does not exist in "AudienceTypeEnum" enum.',
      );
    });
  });

  describe('第三方登录 - WeApp', () => {
    it('应该支持绑定账号的 WeApp 第三方登录', async () => {
      const response = await performThirdPartyLogin(
        ThirdPartyProviderEnum.WEAPP,
        'e2e-bound',
        'SSTSTEST',
      );

      const { data, errors } = response.body;
      expect(errors).toBeUndefined();

      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: activeUser.loginName },
      });

      expect(data?.thirdPartyLogin.accountId).toBe(account?.id);
      expect(data?.thirdPartyLogin.role).toBe(activeUser.identityType);
      expect(typeof data?.thirdPartyLogin.accessToken).toBe('string');
      expect(typeof data?.thirdPartyLogin.refreshToken).toBe('string');
    });

    it('未绑定的 WeApp 第三方登录应返回未绑定错误', async () => {
      const response = await performThirdPartyLogin(
        ThirdPartyProviderEnum.WEAPP,
        'e2e-unbound',
        'SSTSTEST',
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('该第三方账户未绑定');
    });
  });

  describe('账户状态相关场景', () => {
    it('应该正确处理账户不存在的情况', async () => {
      const response = await performLogin('nonexistent', 'password123');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户不存在');
    });

    it('应该正确处理账户被禁用的情况', async () => {
      const response = await performLogin(bannedUser.loginName, bannedUser.loginPassword);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户未激活或已被禁用');
    });

    it('应该正确处理待激活账户的情况', async () => {
      const response = await performLogin(pendingUser.loginName, pendingUser.loginPassword);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户未激活或已被禁用');
    });
  });

  describe('密码验证场景', () => {
    it('应该正确处理密码错误的情况', async () => {
      const response = await performLogin(activeUser.loginName, 'wrongpassword');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('密码错误');
    });

    it('应该正确处理空密码的情况', async () => {
      const response = await performLogin(activeUser.loginName, '');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('密码不能为空或纯空白字符');
    });
  });

  describe('输入参数验证', () => {
    it('应该正确处理空用户名的情况', async () => {
      const response = await performLogin('', 'password123');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户不存在');
    });

    it('应该正确验证必需参数', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login {
              login {
                accessToken
                refreshToken
                accountId
                role
              }
            }
          `,
        })
        .expect(400);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('input');
    });

    it('登录成功后应该返回有效的 JWT Token', async () => {
      const response = await performLogin(activeUser.loginName, activeUser.loginPassword);

      const { data } = response.body;
      const accessToken = data?.login.accessToken;
      const refreshToken = data?.login.refreshToken;

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
    });
  });

  afterAll(async () => {
    try {
      // 检查数据库连接状态，只有在连接有效时才进行清理
      if (dataSource && dataSource.isInitialized) {
        await cleanupTestAccounts(dataSource);
      }
    } catch (error) {
      console.error('afterAll 清理失败:', error);
    } finally {
      // 确保应用正确关闭，添加延迟以允许 WebSocket 服务器优雅关闭
      if (app) {
        try {
          await app.close();
          // 给 WebSocket 服务器一些时间来完成清理
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (closeError) {
          console.warn('应用关闭时出现警告:', closeError);
        }
      }
    }
  });
});
