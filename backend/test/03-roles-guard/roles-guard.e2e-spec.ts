// test/03-roles-guard/roles-guard.e2e-spec.ts
import { INestApplication, UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Test, TestingModule } from '@nestjs/testing';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';

import { IdentityTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
// 添加身份实体导入
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { executeGql as executeGqlUtils } from '../utils/e2e-graphql-utils';
// 导入全局测试账户工具
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 测试用的 GraphQL Resolver
 * 用于测试不同角色权限场景
 */
@Resolver()
class TestRolesResolver {
  /**
   * 无角色要求的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard)
  publicQuery(): string {
    return 'public access';
  }

  /**
   * 需要 STAFF 角色的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  staffQuery(): string {
    return 'staff access';
  }

  /**
   * 需要 ADMIN 角色的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  adminQuery(): string {
    return 'admin access';
  }

  /**
   * 需要多个角色之一的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  multiRoleQuery(): string {
    return 'multi role access';
  }

  /**
   * 空角色数组的查询（应该根据用户的 accessGroup 首项判断）
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles()
  emptyRolesQuery(): string {
    return 'empty roles access';
  }

  /**
   * 仅需要认证但无角色守卫的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard)
  authOnlyQuery(): string {
    return 'auth only access';
  }

  /**
   * 无任何守卫的查询
   */
  @Query(() => String)
  noGuardQuery(): string {
    return 'no guard access';
  }

  /**
   * 仅角色守卫无认证守卫的查询（用于测试未登录场景）
   */
  @Query(() => String)
  @UseGuards(RolesGuard)
  @Roles('STAFF')
  roleOnlyQuery(): string {
    return 'role only access';
  }
}

/**
 * RolesGuard E2E 测试
 */
describe('RolesGuard (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
      // 直接注册测试用 Resolver，确保 GraphQL 能发现查询字段
      providers: [TestRolesResolver],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    createAccountUsecase = app.get(CreateAccountUsecase);

    await app.init();
  }, 30000);

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

  // 全局清库
  beforeEach(async () => {
    await cleanupTestAccounts(dataSource);
  });

  /**
   * 登录用户获取 token
   */
  const loginUser = async (loginName: string, loginPassword: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              accessToken
            }
          }
        `,
        variables: {
          input: {
            loginName,
            loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: 'DESKTOP',
          },
        },
      })
      .expect(200);

    if (!response.body.data?.login?.accessToken) {
      throw new Error(`用户 ${loginName} 登录失败`);
    }

    return response.body.data.login.accessToken as string;
  };

  /**
   * 执行 GraphQL 查询
   */
  const executeQuery = (query: string, token?: string): request.Test =>
    executeGqlUtils({ app, query, token });

  // 只用到 staff 的用例组
  describe('无 @Roles 装饰器场景', () => {
    let staffToken: string;

    beforeEach(async () => {
      await seedTestAccounts({ dataSource, createAccountUsecase, includeKeys: ['staff'] });
      staffToken = await loginUser(
        testAccountsConfig.staff.loginName,
        testAccountsConfig.staff.loginPassword,
      );
    });

    it('应该允许无角色要求的查询通过（有认证）', async () => {
      const response = await executeQuery('query { publicQuery }', staffToken).expect(200);
      expect(response.body.data.publicQuery).toBe('public access');
    });

    it('应该允许无任何守卫的查询通过（无认证）', async () => {
      const response = await executeQuery('query { noGuardQuery }').expect(200);
      expect(response.body.data.noGuardQuery).toBe('no guard access');
    });

    it('应该允许仅认证守卫的查询通过', async () => {
      const response = await executeQuery('query { authOnlyQuery }', staffToken).expect(200);
      expect(response.body.data.authOnlyQuery).toBe('auth only access');
    });
  });

  // 需要 staff + admin 的用例组
  describe("@Roles('STAFF') + accessGroup 匹配场景", () => {
    let staffToken: string;
    let adminToken: string;

    beforeEach(async () => {
      await seedTestAccounts({
        dataSource,
        createAccountUsecase,
        includeKeys: ['staff', 'admin'],
      });
      staffToken = await loginUser(
        testAccountsConfig.staff.loginName,
        testAccountsConfig.staff.loginPassword,
      );
      adminToken = await loginUser(
        testAccountsConfig.admin.loginName,
        testAccountsConfig.admin.loginPassword,
      );
    });

    it('应该允许 STAFF 角色访问 staffQuery', async () => {
      const response = await executeQuery('query { staffQuery }', staffToken).expect(200);
      expect(response.body.data.staffQuery).toBe('staff access');
    });

    it('应该允许 ADMIN 角色访问需要 STAFF 或 ADMIN 的查询', async () => {
      const response = await executeQuery('query { multiRoleQuery }', adminToken).expect(200);
      expect(response.body.data.multiRoleQuery).toBe('multi role access');
    });

    it('应该允许 STAFF 角色访问需要 STAFF 或 ADMIN 的查询', async () => {
      const response = await executeQuery('query { multiRoleQuery }', staffToken).expect(200);
      expect(response.body.data.multiRoleQuery).toBe('multi role access');
    });
  });

  // 需要 staff + guest 的不匹配场景
  describe("@Roles('STAFF') + accessGroup 不匹配场景", () => {
    let staffToken: string;
    let guestToken: string;

    beforeEach(async () => {
      await seedTestAccounts({
        dataSource,
        createAccountUsecase,
        includeKeys: ['staff', 'guestPrimary'],
      });
      staffToken = await loginUser(
        testAccountsConfig.staff.loginName,
        testAccountsConfig.staff.loginPassword,
      );
      guestToken = await loginUser(
        testAccountsConfig.guestPrimary.loginName,
        testAccountsConfig.guestPrimary.loginPassword,
      );
    });

    it('应该拒绝 GUEST 角色访问 staffQuery 并返回 403', async () => {
      const response = await executeQuery('query { staffQuery }', guestToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['STAFF']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['GUEST']);
    });

    it('应该拒绝 GUEST 角色访问 adminQuery 并返回 403', async () => {
      const response = await executeQuery('query { adminQuery }', guestToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['ADMIN']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['GUEST']);
    });

    it('应该拒绝 STAFF 角色访问 adminQuery 并返回 403', async () => {
      const response = await executeQuery('query { adminQuery }', staffToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['ADMIN']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['STAFF']);
    });

    it('应该拒绝 GUEST 角色访问需要 STAFF 或 ADMIN 的查询', async () => {
      const response = await executeQuery('query { multiRoleQuery }', guestToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['STAFF', 'ADMIN']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['GUEST']);
    });
  });

  // 不需要任何账号的场景
  describe('未登录场景（移除 JwtAuthGuard）', () => {
    it('应该拒绝未登录用户访问并返回 401', async () => {
      const response = await executeQuery('query { roleOnlyQuery }').expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('用户未登录');
      expect(response.body.errors[0].extensions.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['STAFF']);
    });
  });

  // 只需要 emptyRoles 的场景
  describe('@Roles() 空数组场景', () => {
    let emptyRolesToken: string;

    beforeEach(async () => {
      await seedTestAccounts({ dataSource, createAccountUsecase, includeKeys: ['emptyRoles'] });
      emptyRolesToken = await loginUser(
        testAccountsConfig.emptyRoles.loginName,
        testAccountsConfig.emptyRoles.loginPassword,
      );
    });

    it('应该允许空 accessGroup 账号以 REGISTRANT 规范化结果访问空角色查询', async () => {
      const response = await executeQuery('query { emptyRolesQuery }', emptyRolesToken).expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.emptyRolesQuery).toBe('empty roles access');
    });
  });

  // 需要 staff + emptyRoles 的脏数据场景
  describe('脏数据处理测试', () => {
    let emptyRolesToken: string;

    beforeEach(async () => {
      await seedTestAccounts({
        dataSource,
        createAccountUsecase,
        includeKeys: ['staff', 'emptyRoles'],
      });
      emptyRolesToken = await loginUser(
        testAccountsConfig.emptyRoles.loginName,
        testAccountsConfig.emptyRoles.loginPassword,
      );
    });

    it('应该正确处理数据库 accessGroup 为 null 的约束', async () => {
      // 直接修改数据库中的 accessGroup 为 null
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);
      const accountRepository = dataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: { loginName: testAccountsConfig.staff.loginName },
      });

      // 尝试更新为 null，预期会失败
      let updateError: Error | null = null;
      try {
        if (account) {
          await userInfoRepository.update(
            { accountId: account.id },
            { accessGroup: null as unknown as IdentityTypeEnum[] },
          );
        }
      } catch (error) {
        updateError = error as Error;
      }

      // 验证数据库操作抛出了错误
      expect(updateError).toBeDefined();
      // 验证错误信息包含数据库列不能为空的提示
      expect(updateError?.message).toContain('Column');
      expect(updateError?.message).toContain('cannot be null');
    });

    it('应该正确处理 RolesGuard 中 accessGroup 为空数组的情况', async () => {
      // 使用现有的 emptyRoles 账户，它的 accessGroup 就是空数组
      const response = await executeQuery('query { staffQuery }', emptyRolesToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['STAFF']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['REGISTRANT']);
    });
  });
});
