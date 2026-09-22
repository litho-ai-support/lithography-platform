// test/10-admin-document-database/admin-document-database-production-ownership.e2e-spec.ts
//
// 敌对式终审 F1：**固定主键不等于所有权**。
//
// 场景：production fixture 的型号 / 维修申请 / 哨兵链历史上以固定主键（5296–5301）代表
// 「这些行属于我」，于是准备与清理阶段都会按固定 ID 直接删除。若隔离库中恰好存在
// 主键相同、但**归属不是本 spec** 的行（其他用例、历史残留、人工造数），这些行会被
// 无声删除或覆盖。
//
// 本 spec 在真实隔离库 `lithography_e2e` 上先造出「同主键、不同归属」的外部数据，
// 再调用 production fixture 的准备/清理 helper，断言外部数据的 ID、字段与行数**完全不变**。
// 预置数据不经任何 fixture helper 清除（不规避失败）；外部数据使用与 fixture 完全不同的
// 专属标记（modelCode / requestNo / loginName）以区分归属。
//
// 同时覆盖 fixture lifecycle 的部分失败路径（§4.4 矩阵，需要真实唯一约束）：
// - 型号成功、第一条申请失败 → 只回收本轮已创建的型号；
// - 第一条申请成功、第二条失败 → 只回收本轮已创建的型号与申请。
//
// 目标库安全：所有破坏性动作前复用不可跳过的白名单守卫（e2e-db-guard）。

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import { DataSource, In } from 'typeorm';

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';

import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { createTestAccount, type TestAccountConfig } from '../utils/test-accounts';
import {
  cleanupProductionFixtureByIds,
  cleanupProductionFixtureResidue,
  cleanupProductionSentinelChain,
  createProductionFixtureOwnership,
  ensureProductionSentinelChain,
  findProductionFixtureAccountIds,
  readProductionSentinelSnapshot,
  seedProductionFixtureAccounts,
  seedProductionFixtureBusiness,
  type ProductionFixtureOwnership,
} from './admin-document-database-production-fixture';

/** 历史固定主键（外部数据刻意占用这些 ID：主键碰撞不得改变归属判定） */
const LEGACY_FIXED_IDS = {
  modelId: 5298,
  openRequestId: 5300,
  acceptedRequestId: 5301,
  sentinelModelId: 5296,
  sentinelRequestId: 5297,
} as const;

/** 外部（非本 spec）数据标记：与 fixture 标记完全不同，用于区分归属 */
const FOREIGN = {
  accountLoginName: 'pr3collisionowner',
  modelCode: 'E2E-PR3-COLLISION-MODEL',
  openRequestNo: 'E2E-PR3-COLLISION-OPEN',
  acceptedRequestNo: 'E2E-PR3-COLLISION-ACCEPTED',
  sentinelModelCode: 'E2E-PR3-COLLISION-SENTINEL-MODEL',
  sentinelRequestNo: 'E2E-PR3-COLLISION-SENTINEL',
} as const;

const FOREIGN_REQUEST_NOS: readonly string[] = [
  FOREIGN.openRequestNo,
  FOREIGN.acceptedRequestNo,
  FOREIGN.sentinelRequestNo,
];

const FOREIGN_MODEL_CODES: readonly string[] = [FOREIGN.modelCode, FOREIGN.sentinelModelCode];

const FOREIGN_ACCOUNT_CONFIG: TestAccountConfig = {
  loginName: FOREIGN.accountLoginName,
  loginEmail: 'pr3.collision.owner@example.com',
  loginPassword: 'Pr3CollisionOwner@2024',
  status: AccountStatus.ACTIVE,
  accessGroup: [IdentityTypeEnum.CUSTOMER],
  identityType: IdentityTypeEnum.CUSTOMER,
};

/** E2E 日志配置：stdout 直写（无 pino/file transport），不触碰生产日志目录 */
const E2E_LOGGER_PARAMS = {
  pinoHttp: {
    level: 'info',
  },
} as unknown as Params;

type ForeignSnapshot = {
  model: EquipmentModelEntity | null;
  openRequest: RepairRequestEntity | null;
  acceptedRequest: RepairRequestEntity | null;
  sentinelModel: EquipmentModelEntity | null;
  sentinelRequest: RepairRequestEntity | null;
  /** 按外部标记统计的行数：证明既没被删除也没被复制 */
  rowCounts: {
    models: number;
    requests: number;
  };
};

describe('production fixture 所有权：固定主键碰撞不得影响外部数据（F1）', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let foreignAccountId: number;
  /** 本 spec 自己创建、可回收的 fixture 账号（按记录 ID 收尾） */
  const fixtureOwnership: ProductionFixtureOwnership = createProductionFixtureOwnership();
  /** 部分失败用例共用的桩账号 ID（真实 FK 目标） */
  let fixtureCustomerAccountId: number;
  let fixtureEngineerAccountId: number;

  beforeAll(async () => {
    const [{ initGraphQLSchema }, { ApiModule: apiModule }] = await Promise.all([
      import('../../src/adapters/api/graphql/schema/schema.init'),
      import('../../src/bootstraps/api/api.module'),
    ]);

    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [apiModule],
    })
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useValue(E2E_LOGGER_PARAMS)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 🔒 第一条 DELETE 之前复用不可跳过的目标库白名单守卫
    await assertDataSourceOnAllowedE2eDatabase(dataSource);

    // 先清掉本 spec 上一次运行自己预置的外部数据（按专属标记 → 再按解析出的 ID 回收）
    await removeForeignResidue();
    // 再清掉**上一次 fixture 运行**的崩溃残留（按 fixture 专属标记 + 完整归属校验）
    await cleanupProductionFixtureResidue(dataSource);

    foreignAccountId = (
      await createTestAccount(dataSource, app.get(CreateAccountUsecase), FOREIGN_ACCOUNT_CONFIG)
    ).accountId;

    await presetForeignRows();

    // 本 spec 自己造一份 fixture 账号（业务行引用它们，属于本 spec 可回收范围）
    const seeded = await seedProductionFixtureAccounts({
      dataSource,
      ownership: fixtureOwnership,
      createAccountUsecase: app.get(CreateAccountUsecase),
    });
    if (seeded.failures.length > 0) {
      throw new Error(
        `所有权 spec 桩账号创建失败：${seeded.failures.map((f) => f.key).join(', ')}`,
      );
    }
    const idByKey = new Map(seeded.created.map((seed) => [seed.key, seed.accountId]));
    const customerAccountId = idByKey.get('customer');
    const engineerAccountId = idByKey.get('engineer');
    if (customerAccountId === undefined || engineerAccountId === undefined) {
      throw new Error('所有权 spec 桩账号记录不完整（缺少 customer / engineer）');
    }
    fixtureCustomerAccountId = customerAccountId;
    fixtureEngineerAccountId = engineerAccountId;
  });

  afterAll(async () => {
    try {
      // 只回收本 spec 自己预置的外部数据（标记先行 → 记录 ID）
      await removeForeignResidue();
      // 只回收本 spec 自己创建的 fixture 账号（按本轮记录的 ID）
      await cleanupProductionFixtureByIds(dataSource, fixtureOwnership);
    } finally {
      await app.close();
    }
  });

  /** 预置「同主键、不同归属」的外部数据（显式占用历史固定 ID） */
  const presetForeignRows = async (): Promise<void> => {
    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    const requestRepo = dataSource.getRepository(RepairRequestEntity);

    await modelRepo.save(
      modelRepo.create({
        id: LEGACY_FIXED_IDS.modelId,
        modelCode: FOREIGN.modelCode,
        modelName: '外部（非本 spec）型号：占用历史固定 ID',
        enabled: true,
        sortOrder: 1,
      }),
    );
    await requestRepo.save(
      requestRepo.create([
        {
          id: LEGACY_FIXED_IDS.openRequestId,
          requestNo: FOREIGN.openRequestNo,
          customerAccountId: foreignAccountId,
          equipmentModelId: LEGACY_FIXED_IDS.modelId,
          errorCode: 'COLLISION-OPEN',
          faultDescription: '外部数据：占用历史固定申请 ID',
          contentMd: '# E2E-PR3-COLLISION-OPEN',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        },
        {
          id: LEGACY_FIXED_IDS.acceptedRequestId,
          requestNo: FOREIGN.acceptedRequestNo,
          customerAccountId: foreignAccountId,
          equipmentModelId: LEGACY_FIXED_IDS.modelId,
          errorCode: 'COLLISION-ACCEPTED',
          faultDescription: '外部数据：占用历史固定申请 ID',
          contentMd: '# E2E-PR3-COLLISION-ACCEPTED',
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
          isAccepted: true,
          acceptedByEngineerAccountId: foreignAccountId,
          acceptedAt: new Date('2026-08-02T01:00:00.000Z'),
          deprecated: false,
          deletedAt: null,
        },
      ]),
    );
  };

  /** 预置「同主键、不同归属」的哨兵链（固定 ID 相同，字段与所属账号不同） */
  const presetForeignSentinelRows = async (): Promise<void> => {
    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    const requestRepo = dataSource.getRepository(RepairRequestEntity);

    await modelRepo.save(
      modelRepo.create({
        id: LEGACY_FIXED_IDS.sentinelModelId,
        modelCode: FOREIGN.sentinelModelCode,
        modelName: '外部（非本 spec）哨兵型号：占用历史固定 ID',
        enabled: true,
        sortOrder: 2,
      }),
    );
    await requestRepo.save(
      requestRepo.create({
        id: LEGACY_FIXED_IDS.sentinelRequestId,
        requestNo: FOREIGN.sentinelRequestNo,
        customerAccountId: foreignAccountId,
        equipmentModelId: LEGACY_FIXED_IDS.sentinelModelId,
        errorCode: 'COLLISION-SENTINEL',
        faultDescription: '外部数据：占用历史固定哨兵 ID',
        contentMd: '# E2E-PR3-COLLISION-SENTINEL',
        createdAt: new Date('2026-08-03T00:00:00.000Z'),
        isAccepted: false,
        acceptedByEngineerAccountId: null,
        acceptedAt: null,
        deprecated: false,
        deletedAt: null,
      }),
    );
  };

  /**
   * 回收本 spec 自己预置的外部数据（上次运行残留 / 收尾）。
   * 边界：**本 spec 专属标记 → 再按解析出的 ID 删除**（标记先行；即使主键相同，
   * 也绝不凭主键删除归属不明的数据）。
   *
   * 注：预置阶段刻意占用历史固定主键（5296–5301）以构造「主键碰撞」场景，这一步只在
   * 测试自身的预置/回收中使用；被测 fixture 不得依赖任何固定主键（本 spec 的断言主题）。
   */
  const removeForeignResidue = async (): Promise<void> => {
    await assertDataSourceOnAllowedE2eDatabase(dataSource);

    const requestRepo = dataSource.getRepository(RepairRequestEntity);
    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    const accountRepo = dataSource.getRepository(AccountEntity);

    // 先子后父：申请（按专属编号定位）→ 型号（按专属编码定位）→ 账号域
    const foreignRequests = await requestRepo.find({
      where: { requestNo: In([...FOREIGN_REQUEST_NOS]) },
      select: { id: true },
    });
    if (foreignRequests.length > 0) {
      await requestRepo.delete({ id: In(foreignRequests.map((row) => row.id)) });
    }
    const foreignModels = await modelRepo.find({
      where: { modelCode: In([...FOREIGN_MODEL_CODES]) },
      select: { id: true },
    });
    if (foreignModels.length > 0) {
      await modelRepo.delete({ id: In(foreignModels.map((row) => row.id)) });
    }

    const account = await accountRepo.findOne({
      where: { loginName: FOREIGN.accountLoginName },
      select: { id: true },
    });
    if (account) {
      await dataSource.getRepository(UserInfoEntity).delete({ accountId: account.id });
      await accountRepo.delete({ id: account.id });
    }
  };

  const readForeignSnapshot = async (): Promise<ForeignSnapshot> => {
    const [model, openRequest, acceptedRequest, sentinelModel, sentinelRequest, models, requests] =
      await Promise.all([
        dataSource
          .getRepository(EquipmentModelEntity)
          .findOne({ where: { id: LEGACY_FIXED_IDS.modelId } }),
        dataSource
          .getRepository(RepairRequestEntity)
          .findOne({ where: { id: LEGACY_FIXED_IDS.openRequestId } }),
        dataSource
          .getRepository(RepairRequestEntity)
          .findOne({ where: { id: LEGACY_FIXED_IDS.acceptedRequestId } }),
        dataSource
          .getRepository(EquipmentModelEntity)
          .findOne({ where: { id: LEGACY_FIXED_IDS.sentinelModelId } }),
        dataSource
          .getRepository(RepairRequestEntity)
          .findOne({ where: { id: LEGACY_FIXED_IDS.sentinelRequestId } }),
        dataSource
          .getRepository(EquipmentModelEntity)
          .count({ where: { modelCode: FOREIGN.modelCode } }),
        dataSource
          .getRepository(RepairRequestEntity)
          .count({ where: { requestNo: In([FOREIGN.openRequestNo, FOREIGN.acceptedRequestNo]) } }),
      ]);

    return {
      model,
      openRequest,
      acceptedRequest,
      sentinelModel,
      sentinelRequest,
      rowCounts: { models, requests },
    };
  };

  it('部分失败：型号创建成功后第一条申请失败 → 只回收本轮已创建的型号', async () => {
    const ownership = createProductionFixtureOwnership();

    await expect(
      seedProductionFixtureBusiness({
        dataSource,
        ownership,
        customerAccountId: fixtureCustomerAccountId,
        engineerAccountId: fixtureEngineerAccountId,
        // 注入与外部数据相同的编号：第一条申请必然撞唯一索引
        requestNos: { open: FOREIGN.openRequestNo },
      }),
    ).rejects.toThrow();

    // 记录边界：只有型号被记录（申请尚未创建）
    expect(ownership.createdEquipmentModelIds).toHaveLength(1);
    expect(ownership.createdRepairRequestIds).toEqual([]);

    await cleanupProductionFixtureByIds(dataSource, ownership);

    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    expect(
      await modelRepo.findOne({ where: { id: ownership.createdEquipmentModelIds[0] } }),
    ).toBeNull();
    // 外部数据不受影响
    expect((await readForeignSnapshot()).rowCounts).toEqual({ models: 1, requests: 2 });
  });

  it('部分失败：第一条申请成功后第二条失败 → 只回收本轮型号与已创建申请', async () => {
    const ownership = createProductionFixtureOwnership();

    await expect(
      seedProductionFixtureBusiness({
        dataSource,
        ownership,
        customerAccountId: fixtureCustomerAccountId,
        engineerAccountId: fixtureEngineerAccountId,
        requestNos: { accepted: FOREIGN.acceptedRequestNo },
      }),
    ).rejects.toThrow();

    expect(ownership.createdEquipmentModelIds).toHaveLength(1);
    expect(ownership.createdRepairRequestIds).toHaveLength(1);

    await cleanupProductionFixtureByIds(dataSource, ownership);

    const requestRepo = dataSource.getRepository(RepairRequestEntity);
    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    expect(
      await requestRepo.findOne({ where: { id: ownership.createdRepairRequestIds[0] } }),
    ).toBeNull();
    expect(
      await modelRepo.findOne({ where: { id: ownership.createdEquipmentModelIds[0] } }),
    ).toBeNull();
    expect((await readForeignSnapshot()).rowCounts).toEqual({ models: 1, requests: 2 });
  });

  it('准备阶段：seedProductionFixtureBusiness 不得删除/覆盖同主键的外部型号与申请', async () => {
    const before = await readForeignSnapshot();
    expect(before.model).not.toBeNull();
    expect(before.openRequest).not.toBeNull();
    expect(before.acceptedRequest).not.toBeNull();

    const ownership = createProductionFixtureOwnership();
    const businessIds = await seedProductionFixtureBusiness({
      dataSource,
      ownership,
      customerAccountId: fixtureCustomerAccountId,
      engineerAccountId: fixtureEngineerAccountId,
    });

    // 主键由数据库生成：绝不复用（更不覆盖）历史固定主键
    expect(businessIds.equipmentModelId).not.toBe(LEGACY_FIXED_IDS.modelId);
    expect(businessIds.openRequestId).not.toBe(LEGACY_FIXED_IDS.openRequestId);
    expect(businessIds.acceptedRequestId).not.toBe(LEGACY_FIXED_IDS.acceptedRequestId);

    // 外部数据 ID、字段、行数完全不变
    expect(await readForeignSnapshot()).toEqual(before);

    await cleanupProductionFixtureByIds(dataSource, ownership);
    expect(await readForeignSnapshot()).toEqual(before);
  });

  it('清理阶段：按本轮记录 ID 与专属标记恢复均不得删除同主键的外部型号与申请', async () => {
    const before = await readForeignSnapshot();

    // 正常收尾：只按本轮记录的 ID（先造一份本轮数据，确保清理确有动作）
    const ownership = createProductionFixtureOwnership();
    await seedProductionFixtureBusiness({
      dataSource,
      ownership,
      customerAccountId: fixtureCustomerAccountId,
      engineerAccountId: fixtureEngineerAccountId,
    });
    await cleanupProductionFixtureByIds(dataSource, ownership);
    expect(await readForeignSnapshot()).toEqual(before);

    // 崩溃残留恢复：按 fixture 专属标记 + 完整归属校验
    const residueOwnership = createProductionFixtureOwnership();
    await seedProductionFixtureBusiness({
      dataSource,
      ownership: residueOwnership,
      customerAccountId: fixtureCustomerAccountId,
      engineerAccountId: fixtureEngineerAccountId,
    });
    const removed = await cleanupProductionFixtureResidue(dataSource);
    expect(removed.repairRequestIds.length).toBeGreaterThan(0);
    expect(await readForeignSnapshot()).toEqual(before);
  });

  it('哨兵链：ensure/cleanup 不得删除同主键、不同归属的外部哨兵行', async () => {
    await presetForeignSentinelRows();

    const before = await readForeignSnapshot();
    expect(before.sentinelModel).not.toBeNull();
    expect(before.sentinelRequest).not.toBeNull();

    const sentinelOwnership = createProductionFixtureOwnership();
    let sentinelIds: {
      accountId: number;
      equipmentModelId: number;
      repairRequestId: number;
    } | null = null;
    try {
      sentinelIds = await ensureProductionSentinelChain({
        dataSource,
        ownership: sentinelOwnership,
        createAccountUsecase: app.get(CreateAccountUsecase),
      });
      const afterEnsure = await readForeignSnapshot();
      expect(afterEnsure.sentinelModel).toEqual(before.sentinelModel);
      expect(afterEnsure.sentinelRequest).toEqual(before.sentinelRequest);

      await cleanupProductionSentinelChain(dataSource, sentinelIds);
      const afterCleanup = await readForeignSnapshot();
      expect(afterCleanup.sentinelModel).toEqual(before.sentinelModel);
      expect(afterCleanup.sentinelRequest).toEqual(before.sentinelRequest);
    } finally {
      // 无论断言结果如何，都不要把本 spec 自己造的哨兵残留留在库里
      if (sentinelIds) {
        await cleanupProductionSentinelChain(dataSource, sentinelIds);
      }
    }
  });

  it('夹具自身的哨兵链在专属清理下原样保留（对照：真正的本 spec 数据仍受保护）', async () => {
    // 重新造出本 spec 账号（专属标记此时空闲），使「清理确实发生」可被观察
    const ownership = createProductionFixtureOwnership();
    const reseeded = await seedProductionFixtureAccounts({
      dataSource,
      ownership,
      createAccountUsecase: app.get(CreateAccountUsecase),
    });
    expect(reseeded.failures).toEqual([]);

    const sentinelOwnership = createProductionFixtureOwnership();
    const sentinelIds = await ensureProductionSentinelChain({
      dataSource,
      ownership: sentinelOwnership,
      createAccountUsecase: app.get(CreateAccountUsecase),
    });

    const before = await readProductionSentinelSnapshot(dataSource, sentinelIds);
    expect(before.account).not.toBeNull();
    expect(before.model).not.toBeNull();
    expect(before.request).not.toBeNull();

    try {
      await cleanupProductionFixtureByIds(dataSource, ownership);
      // 本 spec 账号确实被回收，而夹具外哨兵链 ID、字段、行数完全一致
      expect(await findProductionFixtureAccountIds(dataSource)).toEqual([]);
      expect(await readProductionSentinelSnapshot(dataSource, sentinelIds)).toEqual(before);
    } finally {
      await cleanupProductionSentinelChain(dataSource, sentinelIds);
      await cleanupProductionFixtureByIds(dataSource, ownership);
    }
  });

  it('外部账号未被任何 fixture 动作回收', async () => {
    const account = await dataSource.getRepository(AccountEntity).findOne({
      where: { loginName: FOREIGN.accountLoginName },
    });
    expect(account).not.toBeNull();
    expect(account?.id).toBe(foreignAccountId);

    const userInfo = await dataSource
      .getRepository(UserInfoEntity)
      .findOne({ where: { accountId: foreignAccountId } });
    expect(userInfo).not.toBeNull();
  });
});
