// test/10-admin-document-database/admin-document-database-production-fixture.ts
//
// PR3 production spec 专属夹具（敌对式终审 F1 后重写）：
//
// 所有权模型（修复前的问题：用固定主键 5296–5301 代表「这行属于我」，于是按固定 ID
// 直接删除，主键相同但归属不同的行会被误删/覆盖）：
// - **创建**：型号 / 维修申请 / 哨兵链一律不指定主键，交由数据库生成；每次 save/create
//   成功后立即把返回 ID 记进本轮所有权上下文（createdAccountIds / createdEquipmentModelIds /
//   createdRepairRequestIds / createdSentinelIds）。
// - **收尾**：只接受本轮记录的 ID（cleanupProductionFixtureByIds），不接受任何裸固定 ID。
// - **崩溃残留恢复**：先按本 spec 专属标记（modelCode / requestNo / loginName，含 spec 名称
//   与稳定前缀）定位，再核验关键字段与关联（客户账号、型号、接单工程师）均属于本 spec；
//   校验不完整时**拒绝删除**并抛出可观察错误（失败关闭）。
// - **自保护**：每个会写库/删库的 helper 在第一条写操作前自行调用不可跳过的目标库白名单守卫
//   （e2e-db-guard）；守卫拒绝时 INSERT/UPDATE/DELETE 均为 0。
//
// 安全边界不变：禁止无 WHERE 整表删除；空 ID 集合为 no-op；清理顺序沿外键 RESTRICT 反向
// （维修申请 → 型号 → user_info → account）；清理中途失败不吞错。

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource, In } from 'typeorm';

import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { createTestAccount, TestAccountConfig } from '../utils/test-accounts';

/** 本 spec 专属账号（固定 loginName；所有权边界仅此三者） */
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

/** 夹具外哨兵账号（独立 loginName；任何精确清理都不得触碰其数据链） */
export const PRODUCTION_SENTINEL = {
  loginName: 'testpr3r5sentinel',
  loginEmail: 'pr3r5.sentinel@example.com',
  loginPassword: 'testPr3R5Sentinel@2024',
} as const;

/**
 * 本 spec 专属**自然标记**（含 spec 名称与稳定前缀，仅用于测试）：
 * 跨运行恢复的唯一依据；与业务字段（编号规则）不重叠，可安全用于精确定位残留。
 */
export const PRODUCTION_FIXTURE_MARKERS = {
  modelCode: 'E2E-ADM-DOCDB-PROD-MODEL',
  openRequestNo: 'E2E-ADM-DOCDB-PROD-OPEN',
  acceptedRequestNo: 'E2E-ADM-DOCDB-PROD-ACCEPTED',
  sentinelModelCode: 'E2E-ADM-DOCDB-PROD-SENTINEL-MODEL',
  sentinelRequestNo: 'E2E-ADM-DOCDB-PROD-SENTINEL-REQ',
} as const;

const FIXTURE_MODEL_NAME = 'PR3 R6 锚点型号（spec 专属）';
const FIXTURE_MODEL_SORT_ORDER = 520;
const SENTINEL_MODEL_NAME = 'R5 哨兵型号（夹具外）';
const SENTINEL_MODEL_SORT_ORDER = 997;

const SENTINEL_ACCOUNT_CONFIG: TestAccountConfig = {
  loginName: PRODUCTION_SENTINEL.loginName,
  loginEmail: PRODUCTION_SENTINEL.loginEmail,
  loginPassword: PRODUCTION_SENTINEL.loginPassword,
  status: AccountStatus.ACTIVE,
  accessGroup: [IdentityTypeEnum.CUSTOMER],
  identityType: IdentityTypeEnum.CUSTOMER,
};

/** 本轮所有权上下文：只记录「本轮实际创建成功并拿到 ID」的行 */
export type ProductionFixtureOwnership = {
  createdAccountIds: number[];
  createdEquipmentModelIds: number[];
  createdRepairRequestIds: number[];
  createdSentinelIds: {
    accountIds: number[];
    equipmentModelIds: number[];
    repairRequestIds: number[];
  };
};

/** 新建空的所有权上下文（每次 spec 运行一份，禁止跨进程复用） */
export const createProductionFixtureOwnership = (): ProductionFixtureOwnership => ({
  createdAccountIds: [],
  createdEquipmentModelIds: [],
  createdRepairRequestIds: [],
  createdSentinelIds: { accountIds: [], equipmentModelIds: [], repairRequestIds: [] },
});

const uniquePositiveIds = (ids: readonly number[]): number[] => [
  ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
];

/**
 * helper 自保护：第一条写操作之前复用不可跳过的目标库白名单守卫。
 * 不把「调用者已经守卫」当作永久授权；错误信息含 helper 名称、阶段与守卫原因（无口令/连接串）。
 */
const assertWritableTarget = async (ds: DataSource, helper: string): Promise<string> => {
  try {
    return await assertDataSourceOnAllowedE2eDatabase(ds);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[${helper}] 阶段=目标库守卫 拒绝执行写入/删除：${detail}`, { cause: error });
  }
};

/** 归属校验失败：失败关闭（拒绝删除），错误可观察且不含敏感信息 */
const ownershipViolation = (helper: string, database: string, detail: string): Error =>
  new Error(`[${helper}] 阶段=归属校验 目标库=${database} 拒绝删除：${detail}`);

/** 仅 SELECT：按固定专属 loginName 集合定位残留账号 ID（不产生任何写入） */
export const findProductionFixtureAccountIds = async (ds: DataSource): Promise<number[]> => {
  const accounts = await ds.getRepository(AccountEntity).find({
    where: { loginName: In([...PRODUCTION_FIXTURE_LOGIN_NAMES]) },
    select: { id: true },
  });
  return accounts.map((account) => account.id);
};

/** 按标记 + 归属校验解析出的「属于本 spec」的行 */
type OwnedRows = {
  accountIds: number[];
  fixtureModelIds: number[];
  fixtureRequestIds: number[];
  sentinelModelIds: number[];
  sentinelRequestIds: number[];
  sentinelAccountIds: number[];
};

/**
 * 崩溃残留恢复的定位与归属校验（只读）：
 * 先按专属标记查找，再核验关联字段确实指向本 spec 的账号/型号；
 * 任何一项不成立即失败关闭（抛错），绝不「先删了再说」。
 */
const resolveOwnedRows = async (
  ds: DataSource,
  helper: string,
  database: string,
): Promise<OwnedRows> => {
  const markers = PRODUCTION_FIXTURE_MARKERS;
  const accountRepo = ds.getRepository(AccountEntity);
  const modelRepo = ds.getRepository(EquipmentModelEntity);
  const requestRepo = ds.getRepository(RepairRequestEntity);

  const specLoginNames = [...PRODUCTION_FIXTURE_LOGIN_NAMES, PRODUCTION_SENTINEL.loginName];
  const accounts = await accountRepo.find({
    where: { loginName: In(specLoginNames) },
    select: { id: true, loginName: true },
  });
  const accountIds = accounts.map((account) => account.id);
  const accountIdSet = new Set(accountIds);
  const sentinelAccountIds = accounts
    .filter((account) => account.loginName === PRODUCTION_SENTINEL.loginName)
    .map((account) => account.id);

  const fixtureModels = await modelRepo.find({
    where: { modelCode: markers.modelCode },
    select: { id: true, modelCode: true },
  });
  const sentinelModels = await modelRepo.find({
    where: { modelCode: markers.sentinelModelCode },
    select: { id: true, modelCode: true },
  });
  if (fixtureModels.some((model) => model.modelCode !== markers.modelCode)) {
    throw ownershipViolation(helper, database, '型号标记字段与预期不一致');
  }
  if (sentinelModels.some((model) => model.modelCode !== markers.sentinelModelCode)) {
    throw ownershipViolation(helper, database, '哨兵型号标记字段与预期不一致');
  }
  const fixtureModelIds = fixtureModels.map((model) => model.id);
  const sentinelModelIds = sentinelModels.map((model) => model.id);
  const fixtureModelIdSet = new Set(fixtureModelIds);
  const sentinelModelIdSet = new Set(sentinelModelIds);

  const ownedRequests = await requestRepo.find({
    where: { requestNo: In([markers.openRequestNo, markers.acceptedRequestNo]) },
    select: {
      id: true,
      requestNo: true,
      customerAccountId: true,
      equipmentModelId: true,
      acceptedByEngineerAccountId: true,
    },
  });
  const sentinelRequests = await requestRepo.find({
    where: { requestNo: markers.sentinelRequestNo },
    select: {
      id: true,
      requestNo: true,
      customerAccountId: true,
      equipmentModelId: true,
      acceptedByEngineerAccountId: true,
    },
  });

  for (const request of ownedRequests) {
    if (!accountIdSet.has(request.customerAccountId)) {
      throw ownershipViolation(
        helper,
        database,
        `申请 ${request.requestNo}(id=${request.id}) 的客户账号 ${request.customerAccountId} 不属于本 spec，归属不明确`,
      );
    }
    if (!fixtureModelIdSet.has(request.equipmentModelId)) {
      throw ownershipViolation(
        helper,
        database,
        `申请 ${request.requestNo}(id=${request.id}) 的型号 ${request.equipmentModelId} 不是本 spec 标记型号，归属不明确`,
      );
    }
    if (
      request.requestNo === markers.acceptedRequestNo &&
      (request.acceptedByEngineerAccountId === null ||
        !accountIdSet.has(request.acceptedByEngineerAccountId))
    ) {
      throw ownershipViolation(
        helper,
        database,
        `已接单申请 ${request.requestNo}(id=${request.id}) 的接单工程师归属不明确`,
      );
    }
  }

  for (const request of sentinelRequests) {
    if (!sentinelAccountIds.includes(request.customerAccountId)) {
      throw ownershipViolation(
        helper,
        database,
        `哨兵申请 ${request.requestNo}(id=${request.id}) 的客户账号不属于哨兵链，归属不明确`,
      );
    }
    if (!sentinelModelIdSet.has(request.equipmentModelId)) {
      throw ownershipViolation(
        helper,
        database,
        `哨兵申请 ${request.requestNo}(id=${request.id}) 的型号不是哨兵标记型号，归属不明确`,
      );
    }
  }

  return {
    accountIds,
    fixtureModelIds,
    fixtureRequestIds: ownedRequests.map((request) => request.id),
    sentinelModelIds,
    sentinelRequestIds: sentinelRequests.map((request) => request.id),
    sentinelAccountIds,
  };
};

/** 精确删除给定 ID 集合：先子后父（申请 → 型号 → user_info → account） */
const deleteOwnedRows = async (
  ds: DataSource,
  rows: {
    repairRequestIds: readonly number[];
    equipmentModelIds: readonly number[];
    accountIds: readonly number[];
  },
): Promise<void> => {
  const requestIds = uniquePositiveIds(rows.repairRequestIds);
  const modelIds = uniquePositiveIds(rows.equipmentModelIds);
  const accountIds = uniquePositiveIds(rows.accountIds);

  if (requestIds.length > 0) {
    await ds.getRepository(RepairRequestEntity).delete({ id: In(requestIds) });
  }
  if (modelIds.length > 0) {
    await ds.getRepository(EquipmentModelEntity).delete({ id: In(modelIds) });
  }
  if (accountIds.length > 0) {
    // 账号删除前的防御性精确回收：本轮/残留申请可能引用这些账号（外键 RESTRICT）
    await ds.getRepository(RepairRequestEntity).delete({ customerAccountId: In(accountIds) });
    await ds.getRepository(RepairRequestEntity).delete({
      acceptedByEngineerAccountId: In(accountIds),
    });
    await ds.getRepository(UserInfoEntity).delete({ accountId: In(accountIds) });
    await ds.getRepository(AccountEntity).delete({ id: In(accountIds) });
  }
};

/**
 * 崩溃残留恢复（beforeAll 用）：按专属标记定位 + 完整归属校验后精确回收本 spec 残留。
 * 与「按本轮记录 ID 收尾」互补：本函数只处理**上一次运行**留下的行。
 * @returns 实际删除的行 ID（便于回执与断言）
 */
export const cleanupProductionFixtureResidue = async (
  ds: DataSource,
): Promise<{ repairRequestIds: number[]; equipmentModelIds: number[]; accountIds: number[] }> => {
  const helper = 'cleanupProductionFixtureResidue';
  const database = await assertWritableTarget(ds, helper);
  const owned = await resolveOwnedRows(ds, helper, database);

  await deleteOwnedRows(ds, {
    repairRequestIds: [...owned.fixtureRequestIds, ...owned.sentinelRequestIds],
    equipmentModelIds: [...owned.fixtureModelIds, ...owned.sentinelModelIds],
    accountIds: owned.accountIds,
  });

  return {
    repairRequestIds: [...owned.fixtureRequestIds, ...owned.sentinelRequestIds],
    equipmentModelIds: [...owned.fixtureModelIds, ...owned.sentinelModelIds],
    accountIds: owned.accountIds,
  };
};

/**
 * 本轮收尾（afterAll / 创建中途失败）：只接受本轮记录的 ID，逆序回收。
 * - 空 ID 集合为 no-op：不执行守卫、不产生任何写入/删除；
 * - 非空集合自保护：第一条 DELETE 之前复用白名单守卫。
 */
export const cleanupProductionFixtureByIds = async (
  ds: DataSource,
  ownership: ProductionFixtureOwnership,
): Promise<void> => {
  const requestIds = uniquePositiveIds(ownership.createdRepairRequestIds);
  const modelIds = uniquePositiveIds(ownership.createdEquipmentModelIds);
  const accountIds = uniquePositiveIds(ownership.createdAccountIds);
  if (requestIds.length === 0 && modelIds.length === 0 && accountIds.length === 0) {
    return;
  }
  await assertWritableTarget(ds, 'cleanupProductionFixtureByIds');
  await deleteOwnedRows(ds, {
    repairRequestIds: requestIds,
    equipmentModelIds: modelIds,
    accountIds,
  });
};

/**
 * 逐个创建专属账号并记录成功 ID（串行保证记录确定性，便于部分失败时定位）。
 * 部分失败不抛出：failures 汇总每个失败 key，由调用方决定「仅按已记录 ID 回收」与 fail fast。
 */
export const seedProductionFixtureAccounts = async (opts: {
  dataSource: DataSource;
  ownership: ProductionFixtureOwnership;
  createAccountUsecase?: CreateAccountUsecase | null;
}): Promise<{
  created: ProductionFixtureAccountSeed[];
  failures: Array<{ key: ProductionFixtureAccountKey; loginName: string; error: Error }>;
}> => {
  await assertWritableTarget(opts.dataSource, 'seedProductionFixtureAccounts');
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
      // 成功即记录：中途失败时调用方只能回收这里已记录成功的 ID
      created.push({ key, loginName: cfg.loginName, accountId });
      opts.ownership.createdAccountIds.push(accountId);
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

/** 本 spec 锚点业务数据（主键由数据库生成，ID 只在运行期存在） */
export type ProductionFixtureBusinessIds = {
  equipmentModelId: number;
  openRequestId: number;
  acceptedRequestId: number;
};

/**
 * 创建 R6 锚点业务数据：型号（动态主键）+ 未接单申请 + 已接单申请。
 * 每步成功后立即记录 ID；**中途失败直接抛出**，由调用方按已记录 ID 逆序回收。
 *
 * @param opts.requestNos 测试注入点：仅用于验证「第二条申请失败 → 只回收已创建行」，
 *   默认使用本 spec 专属标记；不得用于生产造数路径。
 */
export const seedProductionFixtureBusiness = async (opts: {
  dataSource: DataSource;
  ownership: ProductionFixtureOwnership;
  customerAccountId: number;
  engineerAccountId: number;
  requestNos?: { open?: string; accepted?: string };
}): Promise<ProductionFixtureBusinessIds> => {
  const { dataSource, ownership, customerAccountId, engineerAccountId } = opts;
  const markers = PRODUCTION_FIXTURE_MARKERS;
  const openRequestNo = opts.requestNos?.open ?? markers.openRequestNo;
  const acceptedRequestNo = opts.requestNos?.accepted ?? markers.acceptedRequestNo;

  await assertWritableTarget(dataSource, 'seedProductionFixtureBusiness');

  const modelRepo = dataSource.getRepository(EquipmentModelEntity);
  const requestRepo = dataSource.getRepository(RepairRequestEntity);

  // 主键交由数据库生成（不再抢占固定 ID：固定 ID 可能已被其他归属的数据占用）
  const model = await modelRepo.save(
    modelRepo.create({
      modelCode: markers.modelCode,
      modelName: FIXTURE_MODEL_NAME,
      enabled: true,
      sortOrder: FIXTURE_MODEL_SORT_ORDER,
    }),
  );
  ownership.createdEquipmentModelIds.push(model.id);

  const openRequest = await requestRepo.save(
    requestRepo.create({
      requestNo: openRequestNo,
      customerAccountId,
      equipmentModelId: model.id,
      errorCode: 'E-OPEN-ANCHOR',
      faultDescription: 'R6 矩阵锚点：未接单',
      contentMd: '# E2E-ADM-DOCDB-PROD-OPEN',
      createdAt: new Date('2026-09-10T01:00:00.000Z'),
      isAccepted: false,
      acceptedByEngineerAccountId: null,
      acceptedAt: null,
      deprecated: false,
      deletedAt: null,
    }),
  );
  ownership.createdRepairRequestIds.push(openRequest.id);

  const acceptedRequest = await requestRepo.save(
    requestRepo.create({
      requestNo: acceptedRequestNo,
      customerAccountId,
      equipmentModelId: model.id,
      errorCode: 'E-ACCEPTED-ANCHOR',
      faultDescription: 'R6 矩阵锚点：已接单',
      contentMd: '# E2E-ADM-DOCDB-PROD-ACCEPTED',
      createdAt: new Date('2026-09-11T01:00:00.000Z'),
      isAccepted: true,
      acceptedByEngineerAccountId: engineerAccountId,
      acceptedAt: new Date('2026-09-11T02:00:00.000Z'),
      deprecated: false,
      deletedAt: null,
    }),
  );
  ownership.createdRepairRequestIds.push(acceptedRequest.id);

  return {
    equipmentModelId: model.id,
    openRequestId: openRequest.id,
    acceptedRequestId: acceptedRequest.id,
  };
};

/**
 * 建立夹具外哨兵链：账号（含 user_info）→ 型号 → 申请，全部动态主键。
 * 幂等：按专属标记 find-or-create；标记命中但归属不符时失败关闭（拒绝覆盖外部数据）。
 * @returns 哨兵链的实际 ID（同一次运行内使用，写进所有权上下文）
 */
export const ensureProductionSentinelChain = async (opts: {
  dataSource: DataSource;
  ownership: ProductionFixtureOwnership;
  createAccountUsecase?: CreateAccountUsecase | null;
}): Promise<{ accountId: number; equipmentModelId: number; repairRequestId: number }> => {
  const { dataSource, ownership } = opts;
  const helper = 'ensureProductionSentinelChain';
  const markers = PRODUCTION_FIXTURE_MARKERS;

  await assertWritableTarget(dataSource, helper);

  const accountRepo = dataSource.getRepository(AccountEntity);
  const modelRepo = dataSource.getRepository(EquipmentModelEntity);
  const requestRepo = dataSource.getRepository(RepairRequestEntity);

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

  const existingModel = await modelRepo.findOne({
    where: { modelCode: markers.sentinelModelCode },
    select: { id: true },
  });
  const equipmentModelId =
    existingModel?.id ??
    (
      await modelRepo.save(
        modelRepo.create({
          modelCode: markers.sentinelModelCode,
          modelName: SENTINEL_MODEL_NAME,
          enabled: true,
          sortOrder: SENTINEL_MODEL_SORT_ORDER,
        }),
      )
    ).id;

  const existingRequest = await requestRepo.findOne({
    where: { requestNo: markers.sentinelRequestNo },
    select: {
      id: true,
      customerAccountId: true,
      equipmentModelId: true,
    },
  });
  if (existingRequest) {
    // 归属校验：标记相同但关联不属于哨兵链 → 失败关闭，绝不覆盖/复用
    if (
      existingRequest.customerAccountId !== accountId ||
      existingRequest.equipmentModelId !== equipmentModelId
    ) {
      throw ownershipViolation(
        helper,
        'sentinel',
        `哨兵申请(id=${existingRequest.id}) 已存在但归属不服（账号 ${existingRequest.customerAccountId} / 型号 ${existingRequest.equipmentModelId}）`,
      );
    }
  }
  const repairRequestId =
    existingRequest?.id ??
    (
      await requestRepo.save(
        requestRepo.create({
          requestNo: markers.sentinelRequestNo,
          customerAccountId: accountId,
          equipmentModelId,
          errorCode: 'E-SENTINEL',
          faultDescription: 'R5 哨兵：夹具外独立链，精确清理不得误删',
          contentMd: '# E2E-ADM-DOCDB-PROD-SENTINEL-REQ',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        }),
      )
    ).id;

  const sentinelIds = ownership.createdSentinelIds;
  if (!sentinelIds.accountIds.includes(accountId)) {
    sentinelIds.accountIds.push(accountId);
  }
  if (!sentinelIds.equipmentModelIds.includes(equipmentModelId)) {
    sentinelIds.equipmentModelIds.push(equipmentModelId);
  }
  if (!sentinelIds.repairRequestIds.includes(repairRequestId)) {
    sentinelIds.repairRequestIds.push(repairRequestId);
  }

  return { accountId, equipmentModelId, repairRequestId };
};

/** 哨兵链快照（ID、字段、行数；null 表示不存在） */
export type ProductionSentinelSnapshot = {
  account: AccountEntity | null;
  userInfo: UserInfoEntity | null;
  model: EquipmentModelEntity | null;
  request: RepairRequestEntity | null;
};

/**
 * 读取哨兵链完整快照（用于「运行前后完全一致」的深比较断言）。
 * 只按**调用方持有的 ID** 读取：不再依赖固定主键（否则断言本身就是固定 ID 假设）。
 */
export const readProductionSentinelSnapshot = async (
  ds: DataSource,
  ids: { accountId: number; equipmentModelId: number; repairRequestId: number },
): Promise<ProductionSentinelSnapshot> => {
  const [account, model, request] = await Promise.all([
    ds.getRepository(AccountEntity).findOne({ where: { id: ids.accountId } }),
    ds.getRepository(EquipmentModelEntity).findOne({ where: { id: ids.equipmentModelId } }),
    ds.getRepository(RepairRequestEntity).findOne({ where: { id: ids.repairRequestId } }),
  ]);
  const userInfo = account
    ? await ds.getRepository(UserInfoEntity).findOne({ where: { accountId: account.id } })
    : null;
  return { account, userInfo, model, request };
};

/**
 * 回收哨兵链：只按调用方持有的 ID（存在即删，不存在 no-op；先子后父，守卫先行）。
 * 空集合为 no-op（连哨兵账号 ID 都没有时不执行任何守卫/DELETE）。
 */
export const cleanupProductionSentinelChain = async (
  ds: DataSource,
  ids: { accountId?: number; equipmentModelId?: number; repairRequestId?: number },
): Promise<void> => {
  const requestIds = uniquePositiveIds(ids.repairRequestId ? [ids.repairRequestId] : []);
  const modelIds = uniquePositiveIds(ids.equipmentModelId ? [ids.equipmentModelId] : []);
  const accountIds = uniquePositiveIds(ids.accountId ? [ids.accountId] : []);
  if (requestIds.length === 0 && modelIds.length === 0 && accountIds.length === 0) {
    return;
  }
  await assertWritableTarget(ds, 'cleanupProductionSentinelChain');
  await deleteOwnedRows(ds, {
    repairRequestIds: requestIds,
    equipmentModelIds: modelIds,
    accountIds,
  });
};
