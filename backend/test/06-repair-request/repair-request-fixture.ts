// test/06-repair-request/repair-request-fixture.ts
//
// 维修申请 E2E 的专属安全夹具（read / accept / production 分类 spec 共用）：
// - 账号、型号与业务自然标记只用于定位，命中后必须逐字段、逐引用核验；
// - 申请正文（errorCode / faultDescription / contentMd / createdAt）以本文件导出的真源为准，
//   造数与归属核验共用同一份真源；接单/删除状态会被受测流程合法改写，故按实体不变量核验；
// - 所有主键由数据库生成，每步成功后立即记录本轮 ID；
// - 残留恢复与本轮收尾都在事务内完成全量预检，发现同名异主或外部引用即失败关闭；
// - 物理删除前必须依次通过「显式清理许可 E2E_ALLOW_PHYSICAL_CLEANUP=1」与「E2E 库名白名单」
//   两道互相独立的门禁；该开关必须由执行者显式设置，本夹具不提供默认值；
// - 删除只使用已经验证且记录在所有权上下文中的本轮 ID，绝不做无 WHERE 整表删除。

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
import { UserState } from '@app-types/models/user-info.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { EngineerResponseEntity } from '@src/modules/lithography/entities/engineer-response.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource, EntityManager, In } from 'typeorm';

import {
  assertDataSourceOnAllowedE2eDatabase,
  assertPhysicalCleanupConsent,
} from '../utils/e2e-db-guard';
import { createTestAccount, type TestAccountConfig } from '../utils/test-accounts';

export const REPAIR_REQUEST_FIXTURE_ACCOUNTS = {
  customerA: {
    loginName: 'testrrfixturecustomera',
    loginEmail: 'rr.fixture.customer.a@example.com',
    loginPassword: 'RrFixtureCustomerA@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.CUSTOMER],
    identityType: IdentityTypeEnum.CUSTOMER,
  },
  customerB: {
    loginName: 'testrrfixturecustomerb',
    loginEmail: 'rr.fixture.customer.b@example.com',
    loginPassword: 'RrFixtureCustomerB@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.CUSTOMER],
    identityType: IdentityTypeEnum.CUSTOMER,
  },
  engineerA: {
    loginName: 'testrrfixtureengineera',
    loginEmail: 'rr.fixture.engineer.a@example.com',
    loginPassword: 'RrFixtureEngineerA@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.ENGINEER],
    identityType: IdentityTypeEnum.ENGINEER,
  },
  engineerB: {
    loginName: 'testrrfixtureengineerb',
    loginEmail: 'rr.fixture.engineer.b@example.com',
    loginPassword: 'RrFixtureEngineerB@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.ENGINEER],
    identityType: IdentityTypeEnum.ENGINEER,
  },
  admin: {
    loginName: 'testrrfixtureadmin',
    loginEmail: 'rr.fixture.admin@example.com',
    loginPassword: 'RrFixtureAdmin@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.SUPER_ADMIN],
    identityType: IdentityTypeEnum.SUPER_ADMIN,
  },
  hybrid: {
    loginName: 'testrrfixturehybrid',
    loginEmail: 'rr.fixture.hybrid@example.com',
    loginPassword: 'RrFixtureHybrid@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.SUPER_ADMIN, IdentityTypeEnum.ENGINEER],
    identityType: IdentityTypeEnum.ENGINEER,
  },
} satisfies Record<
  'customerA' | 'customerB' | 'engineerA' | 'engineerB' | 'admin' | 'hybrid',
  TestAccountConfig
>;

export type RepairRequestFixtureAccountKey = keyof typeof REPAIR_REQUEST_FIXTURE_ACCOUNTS;

/** 唯一允许被本夹具清理的账号 loginName 集合（固定且专属） */
export const REPAIR_REQUEST_FIXTURE_LOGIN_NAMES: readonly string[] = Object.values(
  REPAIR_REQUEST_FIXTURE_ACCOUNTS,
).map((config) => config.loginName);

/**
 * 本夹具专属自然标记：型号 modelCode 与申请 requestNo。
 * 跨运行恢复残留的唯一依据；与业务编号规则不重叠，可安全用于精确定位。
 */
export const REPAIR_REQUEST_FIXTURE_MARKERS = {
  readRequestNos: [
    'E2E-RR-RD-111',
    'E2E-RR-RD-112',
    'E2E-RR-RD-113',
    'E2E-RR-RD-114',
    'E2E-RR-RD-115',
    'E2E-RR-RD-116',
    'E2E-RR-RD-117',
  ],
  acceptRequestNos: [
    'E2E-RR-AC-131',
    'E2E-RR-AC-132',
    'E2E-RR-AC-133',
    'E2E-RR-AC-134',
    'E2E-RR-AC-135',
    'E2E-RR-AC-136',
    'E2E-RR-AC-137',
    'E2E-RR-AC-138',
    'E2E-RR-AC-139',
    'E2E-RR-AC-140',
  ],
} as const;

/** 夹具专属型号的完整可验证字段（造数与归属核验共用同一真源） */
export const REPAIR_REQUEST_FIXTURE_MODELS = {
  read: {
    modelCode: 'E2E-RR-READ-MODEL',
    modelName: '维修申请读模型型号（夹具专属）',
    enabled: true,
    sortOrder: 531,
  },
  accept: {
    modelCode: 'E2E-RR-ACCEPT-MODEL',
    modelName: '维修申请接单型号（夹具专属）',
    enabled: true,
    sortOrder: 532,
  },
} as const;

export type RepairRequestFixtureModelKey = keyof typeof REPAIR_REQUEST_FIXTURE_MODELS;

type RepairRequestFixtureModelSpec =
  (typeof REPAIR_REQUEST_FIXTURE_MODELS)[RepairRequestFixtureModelKey];

/** 夹具申请的不可变内容真源条目（按 requestNo 精确定位） */
export type RepairRequestFixtureRequestSpec = {
  readonly requestNo: string;
  readonly errorCode: string;
  readonly faultDescription: string;
  readonly contentMd: string;
  readonly createdAt: Date;
  readonly initialState: RepairRequestFixtureRequestState;
  readonly postOperationStates: readonly RepairRequestFixtureRequestState[];
};

export type RepairRequestFixtureRequestState = {
  readonly isAccepted: boolean;
  readonly deprecated: boolean;
  readonly acceptedBy: 'none' | 'fixtureEngineer';
  readonly acceptedAt: 'empty' | 'present';
  readonly deletedAt: 'empty' | 'present';
};

const REQUEST_STATES = {
  available: {
    isAccepted: false,
    deprecated: false,
    acceptedBy: 'none',
    acceptedAt: 'empty',
    deletedAt: 'empty',
  },
  accepted: {
    isAccepted: true,
    deprecated: false,
    acceptedBy: 'fixtureEngineer',
    acceptedAt: 'present',
    deletedAt: 'empty',
  },
  deleted: {
    isAccepted: false,
    deprecated: true,
    acceptedBy: 'none',
    acceptedAt: 'empty',
    deletedAt: 'present',
  },
} as const satisfies Record<string, RepairRequestFixtureRequestState>;

const requestState = (
  initialState: RepairRequestFixtureRequestState,
  ...postOperationStates: RepairRequestFixtureRequestState[]
): Pick<RepairRequestFixtureRequestSpec, 'initialState' | 'postOperationStates'> => ({
  initialState,
  postOperationStates,
});

/**
 * 夹具申请的不可变内容真源：造数与归属核验共用同一份（按 requestNo 精确定位）。
 * 这些字段不会被任何受测流程改写，因此是「同标记但内容不同」的唯一判别指纹；
 * 状态字段（isAccepted / acceptedByEngineerAccountId / acceptedAt / deprecated / deletedAt）
 * 会被接单、删除流程合法改写，不进入静态指纹，改用实体不变量核验。
 */
export const REPAIR_REQUEST_FIXTURE_REQUEST_SPECS: readonly RepairRequestFixtureRequestSpec[] = [
  {
    requestNo: 'E2E-RR-RD-111',
    errorCode: 'E-1001',
    faultDescription: '未接单场景',
    contentMd: '# E2E-RR-111',
    createdAt: new Date('2026-08-25T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-RD-112',
    errorCode: 'E-1002',
    faultDescription: '本人接单场景',
    contentMd: '# E2E-RR-112',
    createdAt: new Date('2026-08-26T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.accepted),
  },
  {
    requestNo: 'E2E-RR-RD-113',
    errorCode: 'E-1003',
    faultDescription: '已删除场景',
    contentMd: '# E2E-RR-113',
    createdAt: new Date('2026-08-27T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.deleted),
  },
  {
    requestNo: 'E2E-RR-RD-114',
    errorCode: 'E-1004',
    faultDescription: '他人未接单场景',
    contentMd: '# E2E-RR-114',
    createdAt: new Date('2026-08-28T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-RD-115',
    errorCode: 'E-1005',
    faultDescription: '他人已接单场景',
    contentMd: '# E2E-RR-115',
    createdAt: new Date('2026-08-29T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.accepted),
  },
  {
    requestNo: 'E2E-RR-RD-116',
    errorCode: 'E-1006',
    faultDescription: '同刻排序场景一',
    contentMd: '# E2E-RR-116',
    createdAt: new Date('2026-08-29T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-RD-117',
    errorCode: 'E-1007',
    faultDescription: '同刻排序场景二',
    contentMd: '# E2E-RR-117',
    createdAt: new Date('2026-08-29T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-AC-131',
    errorCode: 'E-3001',
    faultDescription: '接单成功场景',
    contentMd: '# E2E-AC-131',
    createdAt: new Date('2026-08-30T01:00:00.000Z'),
    ...requestState(REQUEST_STATES.available, REQUEST_STATES.accepted),
  },
  {
    requestNo: 'E2E-RR-AC-132',
    errorCode: 'E-3002',
    faultDescription: '已被接单场景',
    contentMd: '# E2E-AC-132',
    createdAt: new Date('2026-08-30T02:00:00.000Z'),
    ...requestState(REQUEST_STATES.accepted),
  },
  {
    requestNo: 'E2E-RR-AC-133',
    errorCode: 'E-3003',
    faultDescription: '已删除场景',
    contentMd: '# E2E-AC-133',
    createdAt: new Date('2026-08-30T04:00:00.000Z'),
    ...requestState(REQUEST_STATES.deleted),
  },
  {
    requestNo: 'E2E-RR-AC-134',
    errorCode: 'E-3004',
    faultDescription: '权限拒绝场景',
    contentMd: '# E2E-AC-134',
    createdAt: new Date('2026-08-30T06:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-AC-135',
    errorCode: 'E-3005',
    faultDescription: '并发竞争场景',
    contentMd: '# E2E-AC-135',
    createdAt: new Date('2026-08-30T07:00:00.000Z'),
    ...requestState(REQUEST_STATES.available, REQUEST_STATES.accepted),
  },
  {
    requestNo: 'E2E-RR-AC-136',
    errorCode: 'E-3006',
    faultDescription: '删除与接单并发竞争场景',
    contentMd: '# E2E-AC-136',
    createdAt: new Date('2026-08-30T08:00:00.000Z'),
    ...requestState(REQUEST_STATES.available, REQUEST_STATES.accepted, REQUEST_STATES.deleted),
  },
  {
    requestNo: 'E2E-RR-AC-137',
    errorCode: 'E-3007',
    faultDescription: '混合角色 activeRole=SUPER_ADMIN 拒绝场景',
    contentMd: '# E2E-AC-137',
    createdAt: new Date('2026-08-30T09:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-AC-138',
    errorCode: 'E-3008',
    faultDescription: '混合角色 activeRole=ENGINEER 接单成功场景',
    contentMd: '# E2E-AC-138',
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    ...requestState(REQUEST_STATES.available, REQUEST_STATES.accepted),
  },
  {
    requestNo: 'E2E-RR-AC-139',
    errorCode: 'E-3009',
    faultDescription: '无 activeRole 兼容性 Token 拒绝场景',
    contentMd: '# E2E-AC-139',
    createdAt: new Date('2026-08-30T11:00:00.000Z'),
    ...requestState(REQUEST_STATES.available),
  },
  {
    requestNo: 'E2E-RR-AC-140',
    errorCode: 'E-3010',
    faultDescription: '失败方重读场景',
    contentMd: '# E2E-AC-140',
    createdAt: new Date('2026-08-30T12:00:00.000Z'),
    ...requestState(REQUEST_STATES.available, REQUEST_STATES.accepted),
  },
];

/**
 * 夹具工程师回复的正文真源：回复没有业务自然标记，正文即其内容指纹。
 * 造数必须先声明在真源内，归属核验再要求库中正文命中真源，二者共用同一份。
 */
export const REPAIR_REQUEST_FIXTURE_RESPONSE_SPECS = {
  pending: {
    requestNo: 'E2E-RR-RD-112',
    engineerAccountKey: 'engineerA',
    resolutionStatus: EngineerResolutionStatus.PENDING,
    responseText: '已受理，排查中',
    createdAt: new Date('2026-08-27T02:00:00.000Z'),
  },
  resolved: {
    requestNo: 'E2E-RR-RD-112',
    engineerAccountKey: 'engineerA',
    resolutionStatus: EngineerResolutionStatus.RESOLVED,
    responseText: '已更换部件，问题解决',
    createdAt: new Date('2026-08-27T03:00:00.000Z'),
  },
} as const;

export type RepairRequestFixtureResponseKey = keyof typeof REPAIR_REQUEST_FIXTURE_RESPONSE_SPECS;

const requestSpecByNo = new Map(
  REPAIR_REQUEST_FIXTURE_REQUEST_SPECS.map((spec) => [spec.requestNo, spec]),
);

const ALL_MARKER_REQUEST_NOS: readonly string[] = [
  ...REPAIR_REQUEST_FIXTURE_MARKERS.readRequestNos,
  ...REPAIR_REQUEST_FIXTURE_MARKERS.acceptRequestNos,
];

const expectedAccountByLoginName = new Map<string, TestAccountConfig>(
  Object.values(REPAIR_REQUEST_FIXTURE_ACCOUNTS).map((config) => [config.loginName, config]),
);

const expectedModelByCode = new Map<string, RepairRequestFixtureModelSpec>(
  Object.values(REPAIR_REQUEST_FIXTURE_MODELS).map((spec) => [spec.modelCode, spec]),
);

/** 本轮所有权上下文：只记录「本轮实际创建成功并拿到 ID」的行 */
export type RepairRequestFixtureOwnership = {
  accountIds: number[];
  equipmentModelIds: number[];
  repairRequestIds: number[];
  engineerResponseIds: number[];
};

export const createRepairRequestFixtureOwnership = (): RepairRequestFixtureOwnership => ({
  accountIds: [],
  equipmentModelIds: [],
  repairRequestIds: [],
  engineerResponseIds: [],
});

const uniquePositiveIds = (ids: readonly number[]): number[] => [
  ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
];

const ownershipError = (helper: string, detail: string): Error =>
  new Error(`[${helper}] 阶段=归属校验 拒绝删除：${detail}`);

/** helper 自保护：第一条写操作之前复用不可跳过的目标库白名单守卫 */
const assertFixtureTarget = async (ds: DataSource, helper: string): Promise<string> => {
  try {
    return await assertDataSourceOnAllowedE2eDatabase(ds);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[${helper}] 阶段=目标库守卫 拒绝执行写入/删除：${detail}`, { cause: error });
  }
};

/**
 * 物理删除双门禁：先要求显式清理许可，再校验实际连接库属于白名单。
 * 两道门禁互相独立：许可缺失时连 `SELECT DATABASE()` 都不会执行（零数据接触），
 * 库名守卫也不读取许可开关，因此许可绝不能替代或绕过库名检查。
 */
const assertFixtureDeleteTarget = async (ds: DataSource, helper: string): Promise<void> => {
  try {
    assertPhysicalCleanupConsent();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[${helper}] 阶段=清理许可门禁 拒绝执行删除：${detail}`, { cause: error });
  }
  await assertFixtureTarget(ds, helper);
};

const recordId = (ids: number[], id: number, helper: string): void => {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`[${helper}] 夹具创建未返回有效数据库主键：${String(id)}`);
  }
  ids.push(id);
};

const assertValue = (helper: string, label: string, actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw ownershipError(
      helper,
      `${label} 字段不一致（actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}）`,
    );
  }
};

/** 解析结果必须完全落在本轮已记录集合内（允许本轮已删除的子集，禁止出现未知行） */
const assertResolvedIdsAreOwned = (
  helper: string,
  label: string,
  resolved: readonly number[],
  expected: readonly number[],
): void => {
  const allowed = new Set(uniquePositiveIds(expected));
  for (const id of uniquePositiveIds(resolved)) {
    if (!allowed.has(id)) {
      throw ownershipError(
        helper,
        `${label} id=${id} 不在本轮已记录集合内（expected=${[...allowed].join(',') || '空'}）`,
      );
    }
  }
};

/**
 * 申请状态字段核验：受测流程会合法改写接单/删除状态，因此状态不进入静态内容指纹，
 * 但必须满足实体不变量（成组出现、接单与作废互斥），且接单人必须是本夹具中具备
 * ENGINEER 角色的账号（客户/超管账号即使属于夹具也不能成为接单人）。
 */
const assertRequestMatchesAllowedState = (
  helper: string,
  request: RepairRequestEntity,
  spec: RepairRequestFixtureRequestSpec,
  engineerAccountIdSet: ReadonlySet<number>,
): void => {
  const matchesState = (state: RepairRequestFixtureRequestState): boolean =>
    request.isAccepted === state.isAccepted && request.deprecated === state.deprecated;
  const allowedState = [spec.initialState, ...spec.postOperationStates].find(matchesState);
  if (!allowedState) {
    throw ownershipError(
      helper,
      `申请 ${request.requestNo}(id=${request.id}) 状态不属于该 requestNo 允许的初始/受测后状态`,
    );
  }
  if (
    (allowedState.acceptedBy === 'none' && request.acceptedByEngineerAccountId !== null) ||
    (allowedState.acceptedAt === 'empty' && request.acceptedAt !== null) ||
    (allowedState.deletedAt === 'empty' && request.deletedAt !== null)
  ) {
    throw ownershipError(
      helper,
      `申请 ${request.requestNo}(id=${request.id}) 的状态关联字段不符合真源`,
    );
  }
  if (
    (allowedState.acceptedBy === 'fixtureEngineer' &&
      request.acceptedByEngineerAccountId === null) ||
    (allowedState.acceptedAt === 'present' && request.acceptedAt === null) ||
    (allowedState.deletedAt === 'present' && request.deletedAt === null)
  ) {
    throw ownershipError(
      helper,
      `申请 ${request.requestNo}(id=${request.id}) 缺少状态要求的运行时关联字段`,
    );
  }
  const label = `申请 ${request.requestNo}(id=${request.id})`;
  if (request.isAccepted) {
    if (
      request.acceptedByEngineerAccountId === null ||
      !engineerAccountIdSet.has(request.acceptedByEngineerAccountId)
    ) {
      throw ownershipError(helper, `${label} 已接单但接单工程师不是本夹具的工程师账号`);
    }
    if (request.acceptedAt === null) {
      throw ownershipError(helper, `${label} 已接单但缺少 acceptedAt`);
    }
  } else if (request.acceptedByEngineerAccountId !== null || request.acceptedAt !== null) {
    throw ownershipError(helper, `${label} 未接单却存在接单字段`);
  }
  if (request.deprecated) {
    if (request.deletedAt === null) {
      throw ownershipError(helper, `${label} 已作废但缺少 deletedAt`);
    }
    if (request.isAccepted) {
      throw ownershipError(helper, `${label} 已作废却处于已接单状态`);
    }
  } else if (request.deletedAt !== null) {
    throw ownershipError(helper, `${label} 未作废却存在 deletedAt`);
  }
};

/**
 * 解析并验证完整夹具图。所有查询都发生在同一事务中；返回前不会执行 DELETE。
 * `expected` 为 null 时用于恢复上轮残留，并以验证通过的实际 ID 建立所有权集合。
 */
const resolveAndVerifyFixture = async (
  manager: EntityManager,
  helper: string,
  expected: RepairRequestFixtureOwnership | null,
): Promise<RepairRequestFixtureOwnership> => {
  const accountRepo = manager.getRepository(AccountEntity);
  const userInfoRepo = manager.getRepository(UserInfoEntity);
  const modelRepo = manager.getRepository(EquipmentModelEntity);
  const requestRepo = manager.getRepository(RepairRequestEntity);
  const responseRepo = manager.getRepository(EngineerResponseEntity);

  const accounts = await accountRepo.find({
    where: { loginName: In([...expectedAccountByLoginName.keys()]) },
  });
  /** 夹具内工程师角色账号：回复的工程师必须落在这里，而不只是「某个夹具账号」 */
  const engineerAccountIds: number[] = [];
  for (const account of accounts) {
    const config = account.loginName
      ? expectedAccountByLoginName.get(account.loginName)
      : undefined;
    if (!config) {
      throw ownershipError(helper, `账号 id=${account.id} 的 loginName 不属于本夹具`);
    }
    assertValue(
      helper,
      `账号 ${config.loginName}.loginEmail`,
      account.loginEmail,
      config.loginEmail,
    );
    assertValue(helper, `账号 ${config.loginName}.status`, account.status, config.status);
    assertValue(
      helper,
      `账号 ${config.loginName}.identityHint`,
      account.identityHint,
      config.identityType,
    );

    const userInfo = await userInfoRepo.findOne({ where: { accountId: account.id } });
    if (!userInfo) {
      throw ownershipError(helper, `账号 ${config.loginName}(id=${account.id}) 缺少 user_info`);
    }
    assertValue(
      helper,
      `账号 ${config.loginName}.nickname`,
      userInfo.nickname,
      `${config.loginName}_nickname`,
    );
    assertValue(helper, `账号 ${config.loginName}.email`, userInfo.email, config.loginEmail);
    assertValue(
      helper,
      `账号 ${config.loginName}.accessGroup`,
      userInfo.accessGroup,
      config.accessGroup,
    );
    assertValue(
      helper,
      `账号 ${config.loginName}.metaDigest`,
      userInfo.metaDigest,
      config.accessGroup,
    );
    assertValue(helper, `账号 ${config.loginName}.userState`, userInfo.userState, UserState.ACTIVE);
    if (config.accessGroup.includes(IdentityTypeEnum.ENGINEER)) {
      engineerAccountIds.push(account.id);
    }
  }
  const accountIds = accounts.map((row) => row.id);
  const accountIdSet = new Set(accountIds);
  const engineerAccountIdSet = new Set(engineerAccountIds);

  const models = await modelRepo.find({
    where: { modelCode: In([...expectedModelByCode.keys()]) },
  });
  for (const model of models) {
    const spec = expectedModelByCode.get(model.modelCode);
    if (!spec) {
      throw ownershipError(helper, `型号 id=${model.id} 的 modelCode 不属于本夹具`);
    }
    assertValue(helper, `型号 ${model.modelCode}.modelName`, model.modelName, spec.modelName);
    assertValue(helper, `型号 ${model.modelCode}.enabled`, model.enabled, spec.enabled);
    assertValue(helper, `型号 ${model.modelCode}.sortOrder`, model.sortOrder, spec.sortOrder);
  }
  const equipmentModelIds = models.map((row) => row.id);
  const modelIdSet = new Set(equipmentModelIds);

  const requestWhere = [
    { requestNo: In([...ALL_MARKER_REQUEST_NOS]) },
    ...(equipmentModelIds.length > 0 ? [{ equipmentModelId: In(equipmentModelIds) }] : []),
    ...(accountIds.length > 0
      ? [{ customerAccountId: In(accountIds) }, { acceptedByEngineerAccountId: In(accountIds) }]
      : []),
  ];
  const requests = await requestRepo.find({ where: requestWhere });
  for (const request of requests) {
    const spec = requestSpecByNo.get(request.requestNo);
    if (!spec) {
      throw ownershipError(
        helper,
        `申请 ${request.requestNo}(id=${request.id}) 的 requestNo 不属于本夹具（外部申请引用了本夹具账号/型号）`,
      );
    }
    // 内容指纹逐字段比对：同标记但正文不同的记录必须零删除、失败关闭
    assertValue(helper, `申请 ${request.requestNo}.errorCode`, request.errorCode, spec.errorCode);
    assertValue(
      helper,
      `申请 ${request.requestNo}.faultDescription`,
      request.faultDescription,
      spec.faultDescription,
    );
    assertValue(helper, `申请 ${request.requestNo}.contentMd`, request.contentMd, spec.contentMd);
    assertValue(helper, `申请 ${request.requestNo}.createdAt`, request.createdAt, spec.createdAt);
    if (!accountIdSet.has(request.customerAccountId)) {
      throw ownershipError(
        helper,
        `申请 ${request.requestNo}(id=${request.id}) 的客户账号 ${request.customerAccountId} 归属不符`,
      );
    }
    if (!modelIdSet.has(request.equipmentModelId)) {
      throw ownershipError(
        helper,
        `申请 ${request.requestNo}(id=${request.id}) 的型号 ${request.equipmentModelId} 归属不符`,
      );
    }
    assertRequestMatchesAllowedState(helper, request, spec, engineerAccountIdSet);
  }
  const repairRequestIds = requests.map((row) => row.id);
  const requestById = new Map(requests.map((row) => [row.id, row]));

  const responseWhere = [
    ...(repairRequestIds.length > 0 ? [{ requestId: In(repairRequestIds) }] : []),
    ...(accountIds.length > 0
      ? [{ engineerAccountId: In(accountIds) }, { customerAccountId: In(accountIds) }]
      : []),
  ];
  const responses =
    responseWhere.length > 0 ? await responseRepo.find({ where: responseWhere }) : [];
  for (const response of responses) {
    const parent = requestById.get(response.requestId);
    if (!parent) {
      throw ownershipError(
        helper,
        `回复 id=${response.id} 的申请 ${response.requestId} 不属于本夹具`,
      );
    }
    if (!engineerAccountIdSet.has(response.engineerAccountId)) {
      throw ownershipError(
        helper,
        `回复 id=${response.id} 的工程师账号 ${response.engineerAccountId} 不是本夹具的工程师账号`,
      );
    }
    // 回复客户必须与父申请客户字段一致，而不只是「落在夹具账号集合内」
    assertValue(
      helper,
      `回复 id=${response.id}.customerAccountId`,
      response.customerAccountId,
      parent.customerAccountId,
    );
    const responseSpec = Object.values(REPAIR_REQUEST_FIXTURE_RESPONSE_SPECS).find(
      (candidate) =>
        candidate.requestNo === parent.requestNo &&
        candidate.resolutionStatus === response.resolutionStatus &&
        candidate.responseText === response.responseText &&
        candidate.createdAt.getTime() === response.createdAt.getTime(),
    );
    if (!responseSpec) {
      throw ownershipError(
        helper,
        `回复 id=${response.id} 的正文、状态、时间或父申请不属于本夹具真源`,
      );
    }
    // 工程师身份按 loginName 与真源指定账号 key 比对：命中真源但登记在其他工程师名下同样拒绝
    const engineerLoginName = accounts.find(
      (account) => account.id === response.engineerAccountId,
    )?.loginName;
    const expectedEngineerLoginName =
      REPAIR_REQUEST_FIXTURE_ACCOUNTS[responseSpec.engineerAccountKey].loginName;
    if (engineerLoginName !== expectedEngineerLoginName) {
      throw ownershipError(
        helper,
        `回复 id=${response.id} 的工程师账号(loginName=${String(engineerLoginName)})不是真源 ${responseSpec.engineerAccountKey} 对应的工程师`,
      );
    }
  }
  const engineerResponseIds = responses.map((row) => row.id);

  const resolved: RepairRequestFixtureOwnership = {
    accountIds,
    equipmentModelIds,
    repairRequestIds,
    engineerResponseIds,
  };

  if (expected) {
    assertResolvedIdsAreOwned(helper, '账号', resolved.accountIds, expected.accountIds);
    assertResolvedIdsAreOwned(
      helper,
      '型号',
      resolved.equipmentModelIds,
      expected.equipmentModelIds,
    );
    assertResolvedIdsAreOwned(helper, '申请', resolved.repairRequestIds, expected.repairRequestIds);
    assertResolvedIdsAreOwned(
      helper,
      '工程师回复',
      resolved.engineerResponseIds,
      expected.engineerResponseIds,
    );
  }

  return resolved;
};

/** 按外键 RESTRICT 反向精确删除：回复 → 申请 → 型号 → user_info → account */
const deleteVerifiedFixture = async (
  manager: EntityManager,
  verified: RepairRequestFixtureOwnership,
): Promise<void> => {
  if (verified.engineerResponseIds.length > 0) {
    await manager
      .getRepository(EngineerResponseEntity)
      .delete({ id: In(verified.engineerResponseIds) });
  }
  if (verified.repairRequestIds.length > 0) {
    await manager.getRepository(RepairRequestEntity).delete({ id: In(verified.repairRequestIds) });
  }
  if (verified.equipmentModelIds.length > 0) {
    await manager
      .getRepository(EquipmentModelEntity)
      .delete({ id: In(verified.equipmentModelIds) });
  }
  if (verified.accountIds.length > 0) {
    await manager.getRepository(UserInfoEntity).delete({ accountId: In(verified.accountIds) });
    await manager.getRepository(AccountEntity).delete({ id: In(verified.accountIds) });
  }
};

const hasOwnershipIds = (ownership: RepairRequestFixtureOwnership): boolean =>
  Object.values(ownership).some((ids) => ids.length > 0);

/** 恢复上轮崩溃残留：专属标记定位 → 全图归属核验 → 事务内精确回收 */
export const cleanupRepairRequestFixtureResidue = async (
  ds: DataSource,
): Promise<RepairRequestFixtureOwnership> => {
  const helper = 'cleanupRepairRequestFixtureResidue';
  await assertFixtureDeleteTarget(ds, helper);
  return ds.transaction(async (manager) => {
    const verified = await resolveAndVerifyFixture(manager, helper, null);
    await deleteVerifiedFixture(manager, verified);
    return verified;
  });
};

/** 本轮收尾：只接受运行时记录 ID，并在事务内重新核验完整归属后删除 */
export const cleanupRepairRequestFixtureByIds = async (
  ds: DataSource,
  ownership: RepairRequestFixtureOwnership,
): Promise<void> => {
  if (!hasOwnershipIds(ownership)) {
    return;
  }
  const helper = 'cleanupRepairRequestFixtureByIds';
  await assertFixtureDeleteTarget(ds, helper);
  await ds.transaction(async (manager) => {
    const verified = await resolveAndVerifyFixture(manager, helper, ownership);
    await deleteVerifiedFixture(manager, verified);
  });
};

/** 逐个创建专属账号并记录成功 ID（串行保证记录确定性；失败即抛出，已成功的行可由收尾回收） */
export const seedRepairRequestFixtureAccounts = async (opts: {
  dataSource: DataSource;
  ownership: RepairRequestFixtureOwnership;
  createAccountUsecase?: CreateAccountUsecase | null;
  includeKeys?: RepairRequestFixtureAccountKey[];
}): Promise<Record<RepairRequestFixtureAccountKey, number>> => {
  const helper = 'seedRepairRequestFixtureAccounts';
  await assertFixtureTarget(opts.dataSource, helper);
  const result = {} as Record<RepairRequestFixtureAccountKey, number>;
  const keys =
    opts.includeKeys ??
    (Object.keys(REPAIR_REQUEST_FIXTURE_ACCOUNTS) as RepairRequestFixtureAccountKey[]);
  for (const key of keys) {
    try {
      const created = await createTestAccount(
        opts.dataSource,
        opts.createAccountUsecase ?? null,
        REPAIR_REQUEST_FIXTURE_ACCOUNTS[key],
      );
      recordId(opts.ownership.accountIds, created.accountId, helper);
      result[key] = created.accountId;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[${helper}] 专属账号创建失败 ${key}(${REPAIR_REQUEST_FIXTURE_ACCOUNTS[key].loginName})：${detail}`,
        { cause: error },
      );
    }
  }
  return result;
};

/** 创建夹具专属型号（主键由数据库生成，成功即记录） */
export const createRepairRequestFixtureModel = async (opts: {
  dataSource: DataSource;
  ownership: RepairRequestFixtureOwnership;
  key: RepairRequestFixtureModelKey;
}): Promise<number> => {
  const helper = 'createRepairRequestFixtureModel';
  await assertFixtureTarget(opts.dataSource, helper);
  const repo = opts.dataSource.getRepository(EquipmentModelEntity);
  const spec = REPAIR_REQUEST_FIXTURE_MODELS[opts.key];
  const model = await repo.save(repo.create({ ...spec }));
  recordId(opts.ownership.equipmentModelIds, model.id, helper);
  return model.id;
};

export type RepairRequestFixtureRequestSeed = {
  requestNo: string;
  customerAccountId: number;
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
  contentMd: string;
  createdAt: Date;
  isAccepted: boolean;
  acceptedByEngineerAccountId: number | null;
  acceptedAt: Date | null;
  deprecated: boolean;
  deletedAt: Date | null;
};

/** 创建夹具申请（主键由数据库生成，成功即记录）；内容指纹必须与真源逐字段一致 */
export const createRepairRequestFixtureRequest = async (opts: {
  dataSource: DataSource;
  ownership: RepairRequestFixtureOwnership;
  seed: RepairRequestFixtureRequestSeed;
}): Promise<number> => {
  const helper = 'createRepairRequestFixtureRequest';
  await assertFixtureTarget(opts.dataSource, helper);
  const spec = requestSpecByNo.get(opts.seed.requestNo);
  if (!spec) {
    throw new Error(`[${helper}] 造数拒绝：requestNo=${opts.seed.requestNo} 不属于本夹具真源`);
  }
  // 内容指纹与真源不一致时，归属核验必然对不上；在此失败关闭，避免造出清理不掉的残留
  assertValue(helper, `申请 ${opts.seed.requestNo}.errorCode`, opts.seed.errorCode, spec.errorCode);
  assertValue(
    helper,
    `申请 ${opts.seed.requestNo}.faultDescription`,
    opts.seed.faultDescription,
    spec.faultDescription,
  );
  assertValue(helper, `申请 ${opts.seed.requestNo}.contentMd`, opts.seed.contentMd, spec.contentMd);
  assertValue(helper, `申请 ${opts.seed.requestNo}.createdAt`, opts.seed.createdAt, spec.createdAt);
  const initial = spec.initialState;
  if (
    opts.seed.isAccepted !== initial.isAccepted ||
    opts.seed.deprecated !== initial.deprecated ||
    (initial.acceptedBy === 'none' && opts.seed.acceptedByEngineerAccountId !== null) ||
    (initial.acceptedAt === 'empty' && opts.seed.acceptedAt !== null) ||
    (initial.deletedAt === 'empty' && opts.seed.deletedAt !== null) ||
    (initial.acceptedBy === 'fixtureEngineer' && opts.seed.acceptedByEngineerAccountId === null) ||
    (initial.acceptedAt === 'present' && opts.seed.acceptedAt === null) ||
    (initial.deletedAt === 'present' && opts.seed.deletedAt === null)
  ) {
    throw new Error(`[${helper}] 造数拒绝：申请 ${opts.seed.requestNo} 状态不符合真源初始状态`);
  }
  const repo = opts.dataSource.getRepository(RepairRequestEntity);
  const saved = await repo.save(repo.create({ ...opts.seed }));
  recordId(opts.ownership.repairRequestIds, saved.id, helper);
  return saved.id;
};

export type RepairRequestFixtureResponseSeed = {
  key: RepairRequestFixtureResponseKey;
  requestId: number;
  engineerAccountId: number;
  customerAccountId: number;
  resolutionStatus: EngineerResolutionStatus;
  responseText: string;
  createdAt: Date;
};

/** 创建夹具工程师回复（主键由数据库生成，成功即记录）；正文必须先声明在真源内 */
export const createRepairRequestFixtureResponse = async (opts: {
  dataSource: DataSource;
  ownership: RepairRequestFixtureOwnership;
  seed: RepairRequestFixtureResponseSeed;
}): Promise<number> => {
  const helper = 'createRepairRequestFixtureResponse';
  await assertFixtureTarget(opts.dataSource, helper);
  const { key, ...responseSeed } = opts.seed;
  const spec = REPAIR_REQUEST_FIXTURE_RESPONSE_SPECS[key];
  const parent = await opts.dataSource
    .getRepository(RepairRequestEntity)
    .findOneByOrFail({ id: opts.seed.requestId });
  const engineer = await opts.dataSource
    .getRepository(AccountEntity)
    .findOneByOrFail({ id: opts.seed.engineerAccountId });
  if (
    parent.requestNo !== spec.requestNo ||
    engineer.loginName !== REPAIR_REQUEST_FIXTURE_ACCOUNTS[spec.engineerAccountKey].loginName ||
    opts.seed.customerAccountId !== parent.customerAccountId ||
    opts.seed.resolutionStatus !== spec.resolutionStatus ||
    opts.seed.responseText !== spec.responseText ||
    opts.seed.createdAt.getTime() !== spec.createdAt.getTime()
  ) {
    throw new Error(`[${helper}] 造数拒绝：回复与真源 ${key} 不一致`);
  }
  const repo = opts.dataSource.getRepository(EngineerResponseEntity);
  const saved = await repo.save(repo.create(responseSeed));
  recordId(opts.ownership.engineerResponseIds, saved.id, helper);
  return saved.id;
};

/** afterAll 收尾所需的窄接口（便于 mock app/dataSource，不引入 Nest 类型耦合） */
export type RepairRequestFixtureTeardownParams = {
  app?: { close: () => Promise<void> } | null;
  dataSource?: DataSource | null;
  targetValidated: boolean;
  cleanup: (ds: DataSource) => Promise<void>;
};

export const shouldRunRepairRequestFixtureCleanup = (params: {
  dataSource?: DataSource | null;
  targetValidated: boolean;
}): boolean => Boolean(params.targetValidated && params.dataSource?.isInitialized);

export const runRepairRequestFixtureTeardown = async (
  params: RepairRequestFixtureTeardownParams,
): Promise<void> => {
  let cleanupError: Error | undefined;
  let closeError: Error | undefined;

  try {
    if (shouldRunRepairRequestFixtureCleanup(params) && params.dataSource) {
      await params.cleanup(params.dataSource);
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (params.app) {
      try {
        await params.app.close();
      } catch (error) {
        closeError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }
  if (closeError) {
    throw closeError;
  }
};
