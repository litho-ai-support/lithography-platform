// test/10-admin-document-database/admin-document-database-cleanup-failure.e2e-spec.ts
//
// PR3 负责人 review #1（R1）回归：夹具清理的失败路径。
//
// 设计要点：
// - 守卫语义保持真实（e2e-db-guard 的库名校验原样执行），只把 DataSource 替换为
//   可注入 mock——从而可在**不需要真实数据库**的情况下断言「守卫拒绝后 DELETE 为 0」；
// - 覆盖四条要求路径：守卫拒绝后模拟 afterAll / DataSource 赋值前失败 /
//   直接调 cleanup 传入不允许目标 / 清理中途失败（错误不吞、app 仍关闭）。
// - 真实隔离库上的「半途失败仍精确回收、连续两次运行幂等」由
//   admin-document-database.e2e-spec.ts 在 lithography_e2e 上实际执行验证。

import type { DataSource } from 'typeorm';

import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import {
  cleanupAdminDocumentFixture,
  runAdminDocFixtureTeardown,
  shouldRunAdminDocFixtureCleanup,
} from './admin-document-database-fixture';
import {
  cleanupProductionFixtureAccounts,
  cleanupProductionFixtureAccountsByIds,
  PRODUCTION_FIXTURE_BUSINESS,
  seedProductionFixtureAccounts,
} from './admin-document-database-production-fixture';

type MockState = {
  /** 每条 DELETE 的实体名与删除条件（用于断言「一次都没删」与删除顺序）。 */
  deleteCalls: Array<{ entityName: string; criteria: unknown }>;
  /** 守卫 SELECT DATABASE() 的查询次数（守卫真实执行、非 mock）。 */
  guardQueryCalls: number;
};

/**
 * mock DataSource：query 返回指定库名（供真实守卫判定），getRepository 返回
 * 记录删除调用的仓库。守卫与 cleanup 语义均为真实代码。
 */
const createMockDataSource = (options: {
  database: string;
  accountIds?: number[];
  failOnDeleteCall?: number;
}): { dataSource: DataSource; state: MockState } => {
  const state: MockState = { deleteCalls: [], guardQueryCalls: 0 };

  const createRepository = (entity: unknown) => ({
    delete: (criteria: unknown): Promise<void> => {
      state.deleteCalls.push({
        entityName: (entity as { name: string }).name,
        criteria,
      });
      if (
        options.failOnDeleteCall !== undefined &&
        state.deleteCalls.length === options.failOnDeleteCall
      ) {
        return Promise.reject(new Error('模拟清理中途失败'));
      }
      return Promise.resolve();
    },
    find: (): Promise<Array<{ id: number }>> =>
      Promise.resolve((options.accountIds ?? []).map((id) => ({ id }))),
  });

  const dataSource = {
    isInitialized: true,
    query: (): Promise<Array<{ current_database: string }>> => {
      state.guardQueryCalls += 1;
      return Promise.resolve([{ current_database: options.database }]);
    },
    getRepository: (entity: unknown) => createRepository(entity),
  } as unknown as DataSource;

  return { dataSource, state };
};

const createMockApp = (): {
  app: { close: () => Promise<void> };
  appState: { closeCalls: number };
} => {
  const appState = { closeCalls: 0 };
  const app = {
    close: (): Promise<void> => {
      appState.closeCalls += 1;
      return Promise.resolve();
    },
  };
  return { app, appState };
};

/** 从 FindOperator（In）提取集合值：用于断言精确删除范围（不依赖 SQL 生成） */
const extractInValues = (criteria: unknown, key: string): number[] | undefined => {
  const operator = (criteria as Record<string, { value?: number[] } | undefined>)[key];
  return Array.isArray(operator?.value) ? operator.value : undefined;
};

describe('admin-document-database 夹具清理失败路径（R1 回归）', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 白名单显式固定为与默认值一致，消除环境串扰
    process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('守卫拒绝后模拟 afterAll：DELETE 为 0、app.close 恰一次、不产生第二个删除错误', async () => {
    const { dataSource, state } = createMockDataSource({ database: 'lithography_drill' });
    const mockApp = createMockApp();

    // 模拟 beforeAll：真实守卫在同一 DataSource 上拒绝（lithography_drill 不在白名单）
    await expect(assertDataSourceOnAllowedE2eDatabase(dataSource)).rejects.toThrow(/白名单/);
    expect(state.guardQueryCalls).toBe(1);

    // 守卫拒绝 → targetValidated 保持 false（规格：仅「验证通过且写夹具前」才置位）
    await expect(
      runAdminDocFixtureTeardown({
        app: mockApp.app,
        dataSource,
        targetValidated: false,
        cleanup: cleanupAdminDocumentFixture,
      }),
    ).resolves.toBeUndefined();

    expect(state.deleteCalls).toHaveLength(0);
    // 清理函数根本未被调用：守卫查询次数不增加
    expect(state.guardQueryCalls).toBe(1);
    expect(mockApp.appState.closeCalls).toBe(1);
  });

  it('DataSource 赋值前失败：无 DELETE、无二次 undefined 错误、app.close 仍执行', async () => {
    const mockApp = createMockApp();

    await expect(
      runAdminDocFixtureTeardown({
        app: mockApp.app,
        dataSource: undefined,
        targetValidated: true,
        cleanup: cleanupAdminDocumentFixture,
      }),
    ).resolves.toBeUndefined();

    expect(mockApp.appState.closeCalls).toBe(1);
  });

  it('未验证目标：即使 DataSource 已初始化也跳过清理（只关闭 app）', async () => {
    const { dataSource, state } = createMockDataSource({ database: 'lithography_e2e' });
    const mockApp = createMockApp();

    await runAdminDocFixtureTeardown({
      app: mockApp.app,
      dataSource,
      targetValidated: false,
      cleanup: cleanupAdminDocumentFixture,
    });

    expect(state.deleteCalls).toHaveLength(0);
    expect(state.guardQueryCalls).toBe(0); // 清理函数未被调用
    expect(mockApp.appState.closeCalls).toBe(1);
  });

  it('直接调用 cleanup 且目标库不在白名单：第一条 DELETE 之前即被拒绝', async () => {
    const { dataSource, state } = createMockDataSource({ database: 'lithography_drill' });

    await expect(cleanupAdminDocumentFixture(dataSource)).rejects.toThrow(/白名单/);

    expect(state.guardQueryCalls).toBe(1);
    expect(state.deleteCalls).toHaveLength(0);
  });

  it('允许的隔离库：守卫先行，按子→父顺序精确删除固定标识（含账号域两跳）', async () => {
    const { dataSource, state } = createMockDataSource({
      database: 'lithography_e2e',
      accountIds: [901, 902],
    });

    await cleanupAdminDocumentFixture(dataSource);

    expect(state.guardQueryCalls).toBe(1);
    expect(state.deleteCalls.map((call) => call.entityName)).toEqual([
      'AiReportEntity',
      'AiMessageEntity',
      'EngineerResponseEntity',
      'AiConversationEntity',
      'RepairRequestEntity',
      'EquipmentModelEntity',
      'UserInfoEntity',
      'AccountEntity',
    ]);
  });

  it('清理中途失败：错误不被吞掉，app.close 仍执行（try/finally），失败后不再继续删除', async () => {
    const { dataSource, state } = createMockDataSource({
      database: 'lithography_e2e',
      failOnDeleteCall: 2,
    });
    const mockApp = createMockApp();

    await expect(
      runAdminDocFixtureTeardown({
        app: mockApp.app,
        dataSource,
        targetValidated: true,
        cleanup: cleanupAdminDocumentFixture,
      }),
    ).rejects.toThrow('模拟清理中途失败');

    expect(state.deleteCalls).toHaveLength(2); // 第 2 条失败后不再继续
    expect(mockApp.appState.closeCalls).toBe(1);
  });

  it('app.close 自身失败且无清理错误：关闭错误向上抛出，不被吞掉', async () => {
    const app = {
      close: (): Promise<void> => Promise.reject(new Error('模拟关闭失败')),
    };

    await expect(
      runAdminDocFixtureTeardown({
        app,
        dataSource: undefined,
        targetValidated: false,
        cleanup: cleanupAdminDocumentFixture,
      }),
    ).rejects.toThrow('模拟关闭失败');
  });

  it('shouldRunAdminDocFixtureCleanup 判定矩阵：仅「已验证 + 连接已初始化」为真', () => {
    const { dataSource } = createMockDataSource({ database: 'lithography_e2e' });
    const notInitialized = { ...dataSource, isInitialized: false } as unknown as DataSource;

    expect(shouldRunAdminDocFixtureCleanup({ dataSource, targetValidated: true })).toBe(true);
    expect(shouldRunAdminDocFixtureCleanup({ dataSource, targetValidated: false })).toBe(false);
    expect(
      shouldRunAdminDocFixtureCleanup({ dataSource: notInitialized, targetValidated: true }),
    ).toBe(false);
    expect(shouldRunAdminDocFixtureCleanup({ dataSource: undefined, targetValidated: true })).toBe(
      false,
    );
  });

  describe('R5 production 专属夹具失败路径（专属账号 + 精确清理）', () => {
    it('守卫拒绝：cleanupProductionFixtureAccounts 在非白名单库第一条 DELETE 之前即被拒绝', async () => {
      const { dataSource, state } = createMockDataSource({ database: 'lithography_drill' });

      await expect(cleanupProductionFixtureAccounts(dataSource)).rejects.toThrow(/白名单/);

      expect(state.guardQueryCalls).toBe(1);
      expect(state.deleteCalls).toHaveLength(0);
    });

    it('DataSource 赋值前失败：production 收尾无 DELETE、无二次错误、app.close 仍执行', async () => {
      const mockApp = createMockApp();

      await expect(
        runAdminDocFixtureTeardown({
          app: mockApp.app,
          dataSource: undefined,
          targetValidated: true,
          cleanup: cleanupProductionFixtureAccounts,
        }),
      ).resolves.toBeUndefined();

      expect(mockApp.appState.closeCalls).toBe(1);
    });

    it('允许的隔离库：守卫先行，按「申请（固定 ID + 账号依赖）→ 型号 → user_info → account」精确删除', async () => {
      const { dataSource, state } = createMockDataSource({
        database: 'lithography_e2e',
        accountIds: [901],
      });

      await cleanupProductionFixtureAccounts(dataSource);

      expect(state.guardQueryCalls).toBe(1);
      expect(state.deleteCalls.map((call) => call.entityName)).toEqual([
        'RepairRequestEntity',
        'RepairRequestEntity',
        'RepairRequestEntity',
        'EquipmentModelEntity',
        'UserInfoEntity',
        'AccountEntity',
      ]);
      // 固定 ID 业务行 + 按账号依赖的申请 + 账号域两跳，全部精确限定
      expect(extractInValues(state.deleteCalls[0].criteria, 'id')).toEqual([
        PRODUCTION_FIXTURE_BUSINESS.openRequestId,
        PRODUCTION_FIXTURE_BUSINESS.acceptedRequestId,
      ]);
      expect(extractInValues(state.deleteCalls[1].criteria, 'customerAccountId')).toEqual([901]);
      expect(extractInValues(state.deleteCalls[2].criteria, 'acceptedByEngineerAccountId')).toEqual(
        [901],
      );
      expect(extractInValues(state.deleteCalls[4].criteria, 'accountId')).toEqual([901]);
      expect(extractInValues(state.deleteCalls[5].criteria, 'id')).toEqual([901]);
    });

    it('无残留账号：只按固定 ID 清业务行（幂等 no-op），不产生任何账号范围删除', async () => {
      const { dataSource, state } = createMockDataSource({ database: 'lithography_e2e' });

      await cleanupProductionFixtureAccounts(dataSource);

      expect(state.deleteCalls.map((call) => call.entityName)).toEqual([
        'RepairRequestEntity',
        'EquipmentModelEntity',
      ]);
    });

    it('空 ID 集合为 no-op：不执行守卫查询、不产生任何 DELETE', async () => {
      const { dataSource, state } = createMockDataSource({ database: 'lithography_e2e' });

      await cleanupProductionFixtureAccountsByIds(dataSource, []);

      expect(state.guardQueryCalls).toBe(0);
      expect(state.deleteCalls).toHaveLength(0);
    });

    it('清理中途失败：错误不被吞掉，失败后不再继续删除', async () => {
      const { dataSource, state } = createMockDataSource({
        database: 'lithography_e2e',
        accountIds: [901],
        failOnDeleteCall: 2,
      });

      await expect(cleanupProductionFixtureAccountsByIds(dataSource, [901, 902])).rejects.toThrow(
        '模拟清理中途失败',
      );

      expect(state.deleteCalls).toHaveLength(2); // 第 2 条失败后不再继续
    });

    it('部分账号创建失败：如实返回 created / failures，仅按已记录的成功 ID 回收', async () => {
      const { dataSource, state } = createMockDataSource({ database: 'lithography_e2e' });

      const execute = jest
        .fn()
        .mockResolvedValueOnce({ id: 601 })
        .mockRejectedValueOnce(new Error('模拟 engineer 创建失败'))
        .mockResolvedValueOnce({ id: 603 });
      const createAccountUsecase = { execute } as unknown as CreateAccountUsecase;

      const { created, failures } = await seedProductionFixtureAccounts({
        dataSource,
        createAccountUsecase,
      });

      expect(created.map((seed) => [seed.key, seed.accountId])).toEqual([
        ['admin', 601],
        ['customer', 603],
      ]);
      expect(failures.map((failure) => failure.key)).toEqual(['engineer']);

      // 调用方按已记录 ID 回收：仅 601/603 进入删除条件，创建失败的 engineer 不出现
      await cleanupProductionFixtureAccountsByIds(
        dataSource,
        created.map((seed) => seed.accountId),
      );

      expect(state.deleteCalls.map((call) => call.entityName)).toEqual([
        'UserInfoEntity',
        'AccountEntity',
      ]);
      expect(extractInValues(state.deleteCalls[0].criteria, 'accountId')).toEqual([601, 603]);
      expect(extractInValues(state.deleteCalls[1].criteria, 'id')).toEqual([601, 603]);
    });
  });
});
