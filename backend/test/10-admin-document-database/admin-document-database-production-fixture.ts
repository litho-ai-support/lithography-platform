// test/10-admin-document-database/admin-document-database-production-fixture.ts
//
// PR3 第二轮负责人 review（R5）production spec 专属夹具：
// - 专属账号（固定 loginName 前缀 testpr3r5，清理边界 = 仅这组账号，禁止占用通用账号）；
// - R6 nullable 矩阵锚点业务数据（固定且专属的型号/申请 ID）；
// - 夹具外哨兵链（独立 loginName/固定 ID，用于证明精确清理不误删）。
//
// 安全设计（对齐 R1 fixture 的自保护范式）：
// - 任何 DELETE 之前先复用不可跳过的目标库白名单守卫（e2e-db-guard）；
// - 清理只按固定 loginName / 固定 ID 精确执行，禁止无 WHERE 整表删除；
// - 空账号 ID 集合为 no-op：不执行守卫、不产生空 IN、不产生任何 DELETE；
// - 部分造数失败由调用方按「已记录的成功 ID」精确回收（本文件只如实返回记录）。

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource, In } from 'typeorm';

import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { createTestAccount, TestAccountConfig } from '../utils/test-accounts';

/** 本 spec 专属账号（固定 loginName；清理边界仅此三者） */
export const PRODUCTION_FIXTURE_ACCOUNTS = {
  admin: {
    loginName: 'testpr3r5admin',
    loginEmail: 'pr3r5.admin@example.com',
    loginPassword: 'testPr3R5Admin@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.SUPER_ADMIN],
    identityType: IdentityTypeEnum.SUPER_ADMIN,
  },
  engineer: {
    loginName: 'testpr3r5engineer',
    loginEmail: 'pr3r5.engineer@example.com',
    loginPassword: 'testPr3R5Engineer@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.ENGINEER],
    identityType: IdentityTypeEnum.ENGINEER,
  },
  customer: {
    loginName: 'testpr3r5customer',
    loginEmail: 'pr3r5.customer@example.com',
    loginPassword: 'testPr3R5Customer@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.CUSTOMER],
    identityType: IdentityTypeEnum.CUSTOMER,
  },
} satisfies Record<'admin' | 'engineer' | 'customer', TestAccountConfig>;

export type ProductionFixtureAccountKey = keyof typeof PRODUCTION_FIXTURE_ACCOUNTS;

export type ProductionFixtureAccountSeed = {
  key: ProductionFixtureAccountKey;
  loginName: string;
  accountId: number;
};

/** 唯一允许被本 spec 清理的账号 loginName 集合（固定且专属） */
export const PRODUCTION_FIXTURE_LOGIN_NAMES: readonly string[] = Object.values(
  PRODUCTION_FIXTURE_ACCOUNTS,
).map((cfg) => cfg.loginName);

/** R6 nullable 矩阵锚点业务数据（固定且专属 ID；申请引用专属账号） */
export const PRODUCTION_FIXTURE_BUSINESS = {
  equipmentModelId: 5298,
  modelCode: 'E2E-PR3R5-MODEL',
  openRequestId: 5300,
  openRequestNo: 'E2E-PR3R5-OPEN',
  acceptedRequestId: 5301,
  acceptedRequestNo: 'E2E-PR3R5-ACCEPTED',
} as const;

/** 夹具外哨兵链（独立 loginName / 固定 ID；任何精确清理都不得触碰） */
export const PRODUCTION_SENTINEL = {
  loginName: 'testpr3r5sentinel',
  loginEmail: 'pr3r5.sentinel@example.com',
  loginPassword: 'testPr3R5Sentinel@2024',
  modelId: 5296,
  modelCode: 'E2E-PR3R5-SENTINEL',
  requestId: 5297,
  requestNo: 'E2E-PR3R5-SENTINEL',
  errorCode: 'E-5297',
} as const;

const SENTINEL_ACCOUNT_CONFIG: TestAccountConfig = {
  loginName: PRODUCTION_SENTINEL.loginName,
  loginEmail: PRODUCTION_SENTINEL.loginEmail,
  loginPassword: PRODUCTION_SENTINEL.loginPassword,
  status: AccountStatus.ACTIVE,
  accessGroup: [IdentityTypeEnum.CUSTOMER],
  identityType: IdentityTypeEnum.CUSTOMER,
};

/** 仅 SELECT：按固定专属 loginName 集合定位残留账号 ID（不产生任何写入） */
export const findProductionFixtureAccountIds = async (ds: DataSource): Promise<number[]> => {
  const accounts = await ds.getRepository(AccountEntity).find({
    where: { loginName: In([...PRODUCTION_FIXTURE_LOGIN_NAMES]) },
    select: { id: true },
  });
  return accounts.map((account) => account.id);
};

/**
 * 按给定账号 ID 集合精确回收（user_info → account）。
 * - 空集合为 no-op：不执行守卫、不产生任何 DELETE（无目标即无破坏面）；
 * - 非空集合自保护：第一条 DELETE 之前复用不可跳过的白名单守卫。
 */
export const cleanupProductionFixtureAccountsByIds = async (
  ds: DataSource,
  accountIds: readonly number[],
): Promise<void> => {
  const ids = [...new Set(accountIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) {
    return;
  }
  await assertDataSourceOnAllowedE2eDatabase(ds);
  await ds.getRepository(UserInfoEntity).delete({ accountId: In(ids) });
  await ds.getRepository(AccountEntity).delete({ id: In(ids) });
};

/**
 * 完整回收本 spec 专属夹具（沿外键 RESTRICT 反向，只按固定标识精确执行）：
 * 1) 白名单守卫（第一条 DELETE 之前）；
 * 2) 申请（固定 ID + 依赖专属账号 ID 的行）→ 型号 → user_info → account；
 * 3) 无残留时全部为 no-op（连跑两次幂等）。
 */
export const cleanupProductionFixtureAccounts = async (ds: DataSource): Promise<void> => {
  await assertDataSourceOnAllowedE2eDatabase(ds);

  const accountIds = await findProductionFixtureAccountIds(ds);
  const business = PRODUCTION_FIXTURE_BUSINESS;
  const requestRepo = ds.getRepository(RepairRequestEntity);

  await requestRepo.delete({ id: In([business.openRequestId, business.acceptedRequestId]) });
  if (accountIds.length > 0) {
    // 上次运行可能残留的、引用专属账号的其他申请（防御性精确回收，避免账号删除被 RESTRICT 阻止）
    await requestRepo.delete({ customerAccountId: In(accountIds) });
    await requestRepo.delete({ acceptedByEngineerAccountId: In(accountIds) });
  }
  await ds.getRepository(EquipmentModelEntity).delete({ id: business.equipmentModelId });

  if (accountIds.length > 0) {
    await ds.getRepository(UserInfoEntity).delete({ accountId: In(accountIds) });
    await ds.getRepository(AccountEntity).delete({ id: In(accountIds) });
  }
};

/**
 * 逐个创建专属账号并记录成功 ID（串行保证记录确定性，便于部分失败时定位）。
 * 部分失败不抛出：failures 汇总每个失败 key，由调用方决定「仅按已记录 ID 回收」与 fail fast。
 */
export const seedProductionFixtureAccounts = async (opts: {
  dataSource: DataSource;
  createAccountUsecase?: CreateAccountUsecase | null;
}): Promise<{
  created: ProductionFixtureAccountSeed[];
  failures: Array<{ key: ProductionFixtureAccountKey; loginName: string; error: Error }>;
}> => {
  const created: ProductionFixtureAccountSeed[] = [];
  const failures: Array<{ key: ProductionFixtureAccountKey; loginName: string; error: Error }> = [];
  const keys = Object.keys(PRODUCTION_FIXTURE_ACCOUNTS) as ProductionFixtureAccountKey[];

  for (const key of keys) {
    const cfg = PRODUCTION_FIXTURE_ACCOUNTS[key];
    try {
      const { accountId } = await createTestAccount(
        opts.dataSource,
        opts.createAccountUsecase ?? null,
        cfg,
      );
      created.push({ key, loginName: cfg.loginName, accountId });
    } catch (error) {
      failures.push({
        key,
        loginName: cfg.loginName,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
  return { created, failures };
};

/** 幂等种 R6 锚点业务数据：型号 5298 + 申请 5300（未接单）/ 5301（已接单） */
export const seedProductionFixtureBusiness = async (opts: {
  dataSource: DataSource;
  customerAccountId: number;
  engineerAccountId: number;
}): Promise<void> => {
  const { dataSource, customerAccountId, engineerAccountId } = opts;
  const business = PRODUCTION_FIXTURE_BUSINESS;
  const modelRepo = dataSource.getRepository(EquipmentModelEntity);
  const requestRepo = dataSource.getRepository(RepairRequestEntity);

  // 幂等：先清固定 ID（对不存在的行为 no-op），再重建
  await requestRepo.delete({ id: In([business.openRequestId, business.acceptedRequestId]) });
  await modelRepo.delete({ id: business.equipmentModelId });

  await modelRepo.save(
    modelRepo.create({
      id: business.equipmentModelId,
      modelCode: business.modelCode,
      modelName: 'PR3 R6 锚点型号',
      enabled: true,
      sortOrder: 520,
    }),
  );
  await requestRepo.save(
    requestRepo.create([
      {
        id: business.openRequestId,
        requestNo: business.openRequestNo,
        customerAccountId,
        equipmentModelId: business.equipmentModelId,
        errorCode: 'E-5300',
        faultDescription: 'R6 矩阵锚点：未接单',
        contentMd: '# E2E-PR3R5-OPEN',
        createdAt: new Date('2026-09-10T01:00:00.000Z'),
        isAccepted: false,
        acceptedByEngineerAccountId: null,
        acceptedAt: null,
        deprecated: false,
        deletedAt: null,
      },
      {
        id: business.acceptedRequestId,
        requestNo: business.acceptedRequestNo,
        customerAccountId,
        equipmentModelId: business.equipmentModelId,
        errorCode: 'E-5301',
        faultDescription: 'R6 矩阵锚点：已接单',
        contentMd: '# E2E-PR3R5-ACCEPTED',
        createdAt: new Date('2026-09-11T01:00:00.000Z'),
        isAccepted: true,
        acceptedByEngineerAccountId: engineerAccountId,
        acceptedAt: new Date('2026-09-11T02:00:00.000Z'),
        deprecated: false,
        deletedAt: null,
      },
    ]),
  );
};

/**
 * 幂等种哨兵链：账号（含 user_info）→ 型号 → 申请；已存在的行**原样保留**（不更新），
 * 保证「运行前后快照一致」断言只受清理动作影响。
 */
export const ensureProductionSentinelChain = async (opts: {
  dataSource: DataSource;
  createAccountUsecase?: CreateAccountUsecase | null;
}): Promise<void> => {
  const { dataSource } = opts;
  const accountRepo = dataSource.getRepository(AccountEntity);

  const existingAccount = await accountRepo.findOne({
    where: { loginName: PRODUCTION_SENTINEL.loginName },
    select: { id: true },
  });
  const accountId =
    existingAccount?.id ??
    (
      await createTestAccount(
        dataSource,
        opts.createAccountUsecase ?? null,
        SENTINEL_ACCOUNT_CONFIG,
      )
    ).accountId;

  const modelRepo = dataSource.getRepository(EquipmentModelEntity);
  const existingModel = await modelRepo.findOne({
    where: { id: PRODUCTION_SENTINEL.modelId },
    select: { id: true },
  });
  if (!existingModel) {
    await modelRepo.save(
      modelRepo.create({
        id: PRODUCTION_SENTINEL.modelId,
        modelCode: PRODUCTION_SENTINEL.modelCode,
        modelName: 'R5 哨兵型号（夹具外）',
        enabled: true,
        sortOrder: 997,
      }),
    );
  }

  const requestRepo = dataSource.getRepository(RepairRequestEntity);
  const existingRequest = await requestRepo.findOne({
    where: { id: PRODUCTION_SENTINEL.requestId },
    select: { id: true },
  });
  if (!existingRequest) {
    await requestRepo.save(
      requestRepo.create({
        id: PRODUCTION_SENTINEL.requestId,
        requestNo: PRODUCTION_SENTINEL.requestNo,
        customerAccountId: accountId,
        equipmentModelId: PRODUCTION_SENTINEL.modelId,
        errorCode: PRODUCTION_SENTINEL.errorCode,
        faultDescription: 'R5 哨兵：夹具外独立链，精确清理不得误删',
        contentMd: '# E2E-PR3R5-SENTINEL',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        isAccepted: false,
        acceptedByEngineerAccountId: null,
        acceptedAt: null,
        deprecated: false,
        deletedAt: null,
      }),
    );
  }
};

/** 哨兵链快照（ID、字段、行数；null 表示不存在） */
export type ProductionSentinelSnapshot = {
  account: AccountEntity | null;
  userInfo: UserInfoEntity | null;
  model: EquipmentModelEntity | null;
  request: RepairRequestEntity | null;
};

/** 读取哨兵链完整快照（用于「运行前后完全一致」的深比较断言） */
export const readProductionSentinelSnapshot = async (
  ds: DataSource,
): Promise<ProductionSentinelSnapshot> => {
  const account = await ds.getRepository(AccountEntity).findOne({
    where: { loginName: PRODUCTION_SENTINEL.loginName },
  });
  const [userInfo, model, request] = await Promise.all([
    account
      ? ds.getRepository(UserInfoEntity).findOne({ where: { accountId: account.id } })
      : Promise.resolve(null),
    ds.getRepository(EquipmentModelEntity).findOne({ where: { id: PRODUCTION_SENTINEL.modelId } }),
    ds.getRepository(RepairRequestEntity).findOne({ where: { id: PRODUCTION_SENTINEL.requestId } }),
  ]);
  return { account, userInfo, model, request };
};

/** 回收哨兵链（存在即删，不存在 no-op；先子后父，守卫先行） */
export const cleanupProductionSentinelChain = async (ds: DataSource): Promise<void> => {
  await assertDataSourceOnAllowedE2eDatabase(ds);

  const accountRepo = ds.getRepository(AccountEntity);
  const account = await accountRepo.findOne({
    where: { loginName: PRODUCTION_SENTINEL.loginName },
    select: { id: true },
  });

  await ds.getRepository(RepairRequestEntity).delete({ id: PRODUCTION_SENTINEL.requestId });
  await ds.getRepository(EquipmentModelEntity).delete({ id: PRODUCTION_SENTINEL.modelId });
  if (account) {
    await ds.getRepository(UserInfoEntity).delete({ accountId: account.id });
    await accountRepo.delete({ id: account.id });
  }
};
