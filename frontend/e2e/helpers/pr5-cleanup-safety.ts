// e2e/helpers/pr5-cleanup-safety.ts
//
// PR5 清理安全集成组的共享基建（Codex 结束报告复验计划 P2-2 / S3）。
//
// 目标：为「清理 helper 的真实数据安全」提供**真实 MySQL** 反例证据，而不是用
// mock SQL 字符串或「先清空全表再 Seed」的绿色 E2E 代替。
//
// 硬边界（见计划 §4.2）：
// 1. 只允许 `DB_NAME=lithography_e2e`，且必须 `E2E_ALLOW_PHYSICAL_CLEANUP=1` 显式 opt-in；
// 2. SQL 实际连接库必须与配置库一致（复用 assertPr5DedicatedEnvironment）；
// 3. 只检查现有 schema，**不执行 TRUNCATE / Migration / 全量 Seed**；schema 缺失直接失败；
// 4. 获取与既有真实 E2E 同名的数据库执行锁，禁止与全表 drill 并行；
// 5. 密码只经 MYSQL_PWD 注入（见 real-backend.mysqlQuery）；ledger / 回执 / 错误均不含凭据。
//
// 造数与所有权（见计划 §4.3）：
// - 所有主键由数据库生成（INSERT 后立即读回 LAST_INSERT_ID）；
// - 运行级不可猜标识同时写入多个可核验字段（标题关键字 / 故障描述 / 故障码 / 回复正文）；
// - FK 只引用既有专用 Seed 账号与型号（只读快照，测试绝不改写这些共享行）；
// - 每创建一层即追加 ledger；回收只按「ledger ID + 完整字段绑定 + 引用闭包」。

import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DEDICATED_E2E_DB_NAME } from '../../e2e-real/dedicated-e2e-environment';

import { acquireExecutionLock } from './execution-lock';
import {
  assertPr5DedicatedEnvironment,
  buildPr5DocKeyword,
  deletePr5EngineerResponseRowsByIds,
  deletePr5ReferenceDocumentBound,
  deletePr5RepairRequestBound,
  findPr5ReferenceDocumentIdsByKeyword,
  PR5_DOC_KEYWORD_PATTERN,
  PR5_SEED_LOGIN_NAMES,
  type Pr5ReferenceDocumentBinding,
  type Pr5RepairRequestBinding,
  readPr5ReferenceDocumentStorageReferenceBound,
} from './pr5-real-flow';
import {
  deleteE2EReferenceDocumentStorageFileByReference,
  mysqlQuery,
  REQUEST_NO_PATTERN,
} from './real-backend';

/** 本组读取的现有 schema 表（只读检查；缺失即失败并给出初始化说明，绝不 TRUNCATE/Migration） */
export const PR5_CLEANUP_SAFETY_REQUIRED_TABLES = [
  'base_user_account',
  'base_user_info',
  'equipment_model',
  'repair_request',
  'engineer_response',
  'reference_document',
  'ai_conversation',
  'ai_report',
  'migrations',
] as const;

/** 运行级标识白名单：只含小写字母数字，天然无引号 / 通配符 / 路径语义 */
export const PR5_CLEANUP_SAFETY_RUN_ID_PATTERN = /^[a-z0-9]{8,32}$/;

/** 只读计数 / 反查允许的表白名单 */
const PR5_CLEANUP_SAFETY_TABLES = [
  'repair_request',
  'engineer_response',
  'reference_document',
] as const;
type Pr5CleanupSafetyTable = (typeof PR5_CLEANUP_SAFETY_TABLES)[number];

/** 生成运行级不可猜标识（[a-z0-9]{8,32}，可安全并入 SQL 字符串字面量） */
export function createPr5CleanupSafetyRunId(): string {
  return `${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
}

/** 本轮资料标题关键字（清理的唯一绑定因子之一），复用 S5 同一前缀与白名单 */
export function buildPr5CleanupSafetyKeyword(runId: string): string {
  assertRunId(runId);

  const keyword = buildPr5DocKeyword(runId);

  if (!PR5_DOC_KEYWORD_PATTERN.test(keyword)) {
    throw new Error(`清理安全组关键字未通过白名单校验：${JSON.stringify(keyword)}`);
  }

  return keyword;
}

/** 本轮故障标记（写入 fault_description / content_md，供残留按标识定位） */
export function buildPr5CleanupSafetyFaultTag(runId: string): string {
  assertRunId(runId);

  return `PR5清理安全组·${runId}`;
}

function assertRunId(runId: string): void {
  if (!PR5_CLEANUP_SAFETY_RUN_ID_PATTERN.test(runId)) {
    throw new Error(`清理安全组运行标识未通过白名单校验：${JSON.stringify(runId)}`);
  }
}

function assertCleanupSafetyTable(table: string): asserts table is Pr5CleanupSafetyTable {
  if (!(PR5_CLEANUP_SAFETY_TABLES as readonly string[]).includes(table)) {
    throw new Error(`清理安全组查询目标表未通过白名单校验，拒绝查询：${JSON.stringify(table)}`);
  }
}

function readSingleCountOrThrow(sql: string, context: string): number {
  const value = Number(mysqlQuery(sql));

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context}计数结果异常：${JSON.stringify(value)}`);
  }

  return value;
}

/**
 * 环境门（计划 §4.2 第 1/2/3/5 项）：复用 S5 的专用环境断言（库名 + 显式授权 + 实际连接库一致），
 * 再只读检查现有 schema。**不执行任何 TRUNCATE / Migration / Seed**。
 */
export function assertPr5CleanupSafetyEnvironment(): void {
  assertPr5DedicatedEnvironment();

  const placeholders = PR5_CLEANUP_SAFETY_REQUIRED_TABLES.map((table) => `'${table}'`).join(', ');
  const found = readSingleCountOrThrow(
    `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
    '专用隔离库 schema',
  );

  if (found !== PR5_CLEANUP_SAFETY_REQUIRED_TABLES.length) {
    throw new Error(
      `专用隔离库 ${DEDICATED_E2E_DB_NAME} schema 不完整：期望 ${PR5_CLEANUP_SAFETY_REQUIRED_TABLES.length} 张表，实际 ${found} 张。` +
        '本组不执行 TRUNCATE/Migration/Seed，请先在专用库上初始化后重试：' +
        `\n  cd backend && DB_NAME=${DEDICATED_E2E_DB_NAME} npm run migration:drill:empty-db && DB_NAME=${DEDICATED_E2E_DB_NAME} npm run seed:mock`,
    );
  }
}

/** 数据库执行锁（计划 §4.2 第 4 项）：与既有真实 E2E 同名，禁止与全表 drill 并行 */
export function acquirePr5CleanupSafetyExecutionLock(): () => void {
  return acquireExecutionLock(DEDICATED_E2E_DB_NAME);
}

export interface Pr5CleanupSafetySeedContext {
  readonly adminAccountId: number;
  readonly customerAccountId: number;
  readonly customerBetaAccountId: number;
  readonly engineerAccountId: number;
  readonly equipmentModelId: number;
}

function readAccountIdByLoginName(loginName: (typeof PR5_SEED_LOGIN_NAMES)[number]): number {
  const value = Number(
    mysqlQuery(`SELECT id FROM base_user_account WHERE login_name = '${loginName}'`),
  );

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Mock Seed 账号未就绪：${loginName} 的 id 读取异常 ${JSON.stringify(value)}`);
  }

  return value;
}

/** 只读解析本组依赖的既有 Seed 账号与启用型号 ID（不创建、不改写这些共享行） */
export function resolvePr5CleanupSafetySeedContext(): Pr5CleanupSafetySeedContext {
  const equipmentModelId = Number(
    mysqlQuery('SELECT id FROM equipment_model WHERE enabled = 1 ORDER BY id LIMIT 1'),
  );

  if (!Number.isSafeInteger(equipmentModelId) || equipmentModelId <= 0) {
    throw new Error(`启用设备型号读取异常：${JSON.stringify(equipmentModelId)}`);
  }

  return {
    adminAccountId: readAccountIdByLoginName('mock_super_admin'),
    customerAccountId: readAccountIdByLoginName('mock_customer_alpha'),
    customerBetaAccountId: readAccountIdByLoginName('mock_customer_beta'),
    engineerAccountId: readAccountIdByLoginName('mock_engineer_chen'),
    equipmentModelId,
  };
}

/**
 * 外部哨兵完整快照：对本组可能触及的三张表做**整行全字段快照**（`SELECT *`，按主键排序）
 * + 账号/型号计数。任意外部行发生字段改动 / 新增 / 删除都会让前后快照不等
 * （用于「外部哨兵前后完整快照相等」断言，而非只比对部分列）。
 */
export function snapshotPr5CleanupSafetyExternalSentinel(): string {
  const repairRequests = mysqlQuery('SELECT * FROM repair_request ORDER BY id');
  const engineerResponses = mysqlQuery('SELECT * FROM engineer_response ORDER BY id');
  const referenceDocuments = mysqlQuery('SELECT * FROM reference_document ORDER BY id');
  const accountCount = readSingleCountOrThrow(
    'SELECT COUNT(*) FROM base_user_account',
    '外部哨兵账号',
  );
  const enabledModelCount = readSingleCountOrThrow(
    'SELECT COUNT(*) FROM equipment_model WHERE enabled = 1',
    '外部哨兵型号',
  );

  return JSON.stringify({
    accountCount,
    enabledModelCount,
    engineerResponses,
    referenceDocuments,
    repairRequests,
  });
}

// ---- 本轮造数与 ledger ----

export interface Pr5CleanupSafetyLedgerRequest {
  readonly id: number;
  readonly requestNo: string;
  readonly customerAccountId: number;
  /** 本轮为该申请创建的回复精确 ID（回收时按此集合绑定子行） */
  readonly responseIds: number[];
}

export interface Pr5CleanupSafetyLedger {
  readonly runId: string;
  readonly keyword: string;
  readonly ownerAccountId: number;
  readonly repairRequests: Pr5CleanupSafetyLedgerRequest[];
  readonly engineerResponseIds: number[];
  readonly documents: Array<{ readonly id: number; readonly createdByAccountId: number }>;
}

export function createPr5CleanupSafetyLedger(
  runId: string,
  ownerAccountId: number,
): Pr5CleanupSafetyLedger {
  assertRunId(runId);

  if (!Number.isSafeInteger(ownerAccountId) || ownerAccountId <= 0) {
    throw new Error(
      `清理安全组 ledger 归属账号未通过正整数校验：${JSON.stringify(ownerAccountId)}`,
    );
  }

  return {
    documents: [],
    engineerResponseIds: [],
    keyword: buildPr5CleanupSafetyKeyword(runId),
    ownerAccountId,
    repairRequests: [],
    runId,
  };
}

function buildCleanupSafetyRequestNo(): string {
  const digits = String(Date.now()).padStart(14, '0');
  const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  const requestNo = `RR${digits}${suffix}`;

  if (!REQUEST_NO_PATTERN.test(requestNo)) {
    throw new Error(`清理安全组申请编号生成异常：${JSON.stringify(requestNo)}`);
  }

  return requestNo;
}

/** 真实 INSERT 本轮自建维修申请（主键由数据库生成，读回后立即记入 ledger） */
export function insertPr5CleanupSafetyRepairRequest(
  ledger: Pr5CleanupSafetyLedger,
  input: { customerAccountId: number; equipmentModelId: number; faultTag: string },
): Pr5CleanupSafetyLedgerRequest {
  const { customerAccountId, equipmentModelId, faultTag } = input;

  if (!Number.isSafeInteger(customerAccountId) || customerAccountId <= 0) {
    throw new Error(`清理安全组申请客户账号未通过正整数校验：${JSON.stringify(customerAccountId)}`);
  }

  if (!Number.isSafeInteger(equipmentModelId) || equipmentModelId <= 0) {
    throw new Error(`清理安全组申请型号未通过正整数校验：${JSON.stringify(equipmentModelId)}`);
  }

  const requestNo = buildCleanupSafetyRequestNo();
  const errorCode = `CS-${ledger.runId}`;
  // INSERT 与 VALUES 必须是同一条语句，不能以 '; ' 分隔；随后再用 '; ' 追加读回主键
  const id = Number(
    mysqlQuery(
      'INSERT INTO repair_request (request_no, customer_account_id, equipment_model_id, error_code, fault_description, content_md)' +
        ` VALUES ('${requestNo}', ${customerAccountId}, ${equipmentModelId}, '${errorCode}', '${faultTag}', '${faultTag}');` +
        ' SELECT LAST_INSERT_ID()',
    ),
  );

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`清理安全组申请主键读取异常：${JSON.stringify(id)}`);
  }

  const entry: Pr5CleanupSafetyLedgerRequest = {
    customerAccountId,
    id,
    requestNo,
    responseIds: [],
  };

  ledger.repairRequests.push(entry);

  return entry;
}

/** 真实 INSERT 本轮自建工程师回复（主键由数据库生成；同时记入 ledger 与父申请的回复集合） */
export function insertPr5CleanupSafetyEngineerResponse(
  ledger: Pr5CleanupSafetyLedger,
  input: {
    request: Pr5CleanupSafetyLedgerRequest;
    engineerAccountId: number;
    customerAccountId: number;
    resolutionStatus?: 'PENDING' | 'RESOLVED';
    responseText?: string;
    /**
     * 是否记入 ledger（默认 true）。
     * 置 false 用于 C3 反例：插入一条**未记录的本轮外回复**，模拟另一进程 / 另一轮写入
     * 的子行；此时 ledger 的父子集合核验必须失败关闭，绝不随之扩大删除范围。
     */
    record?: boolean;
  },
): number {
  const { request, engineerAccountId, customerAccountId } = input;
  const resolutionStatus = input.resolutionStatus ?? 'PENDING';
  const responseText = input.responseText ?? `清理安全组回复·${ledger.runId}`;

  const id = Number(
    mysqlQuery(
      'INSERT INTO engineer_response (request_id, engineer_account_id, customer_account_id, resolution_status, response_text)' +
        ` VALUES (${request.id}, ${engineerAccountId}, ${customerAccountId}, '${resolutionStatus}', '${responseText}');` +
        ' SELECT LAST_INSERT_ID()',
    ),
  );

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`清理安全组回复主键读取异常：${JSON.stringify(id)}`);
  }

  if (input.record !== false) {
    request.responseIds.push(id);
    ledger.engineerResponseIds.push(id);
  }

  return id;
}

/** 真实 INSERT 本轮自建参考资料（主键由数据库生成；storage_reference 可空，需命中白名单才用于删文件） */
export function insertPr5CleanupSafetyReferenceDocument(
  ledger: Pr5CleanupSafetyLedger,
  input: {
    label: string;
    createdByAccountId: number;
    storageReference?: string | null;
    equipmentModelId?: number | null;
  },
): Pr5ReferenceDocumentBinding {
  const { label, createdByAccountId } = input;
  const title = `${ledger.keyword}（${label}）`;
  const storageReference = input.storageReference ?? null;
  const modelExpression =
    input.equipmentModelId === undefined || input.equipmentModelId === null
      ? 'NULL'
      : String(input.equipmentModelId);
  // 库表约束 chk_reference_document_storage_pair 要求 storage_backend 与 storage_reference
  // 必须同时为空或同时非空；有存储引用时按后端生产口径写入 'local'（见 create-reference-document.usecase）。
  const referenceExpression = storageReference === null ? 'NULL' : `'${storageReference}'`;
  const backendExpression = storageReference === null ? 'NULL' : "'local'";

  const id = Number(
    mysqlQuery(
      'INSERT INTO reference_document (title, document_type, equipment_model_id, content_text, storage_backend, storage_reference, created_by_account_id)' +
        ` VALUES ('${title}', 'CHECKLIST', ${modelExpression}, '${ledger.runId}', ${backendExpression}, ${referenceExpression}, ${createdByAccountId});` +
        ' SELECT LAST_INSERT_ID()',
    ),
  );

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`清理安全组资料主键读取异常：${JSON.stringify(id)}`);
  }

  ledger.documents.push({ createdByAccountId, id });

  return { createdByAccountId, id, titleKeyword: ledger.keyword };
}

export function toPr5RepairRequestBinding(
  entry: Pr5CleanupSafetyLedgerRequest,
): Pr5RepairRequestBinding {
  return {
    customerAccountId: entry.customerAccountId,
    id: entry.id,
    requestNo: entry.requestNo,
    responseIds: [...entry.responseIds],
  };
}

function cleanupSafetyRowExists(table: string, id: number): boolean {
  assertCleanupSafetyTable(table);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`清理安全组行存在性查询 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  return Number(mysqlQuery(`SELECT COUNT(*) FROM ${table} WHERE id = ${id}`)) > 0;
}

/**
 * ledger 回收：只回收 ledger 内已记录的本轮对象。
 *
 * 顺序（关键）：先按「三因子 + 本轮回复集合」删维修申请——该绑定删除会**一并**删掉本轮
 * 记录的回复子行并核对残留；再按 ledger 精确回复 ID 兜底删「父行已不在但回复仍残留」
 * 的子行（若先删子行再删父行，父行的子行集合核验会因集合已空而失败，故顺序不可颠倒）；
 * 最后按三因子删资料并删已核验文件。
 *
 * 已不存在的行自动跳过（幂等）；任一失败进入 AggregateError，绝不静默吞掉。
 */
export function reclaimPr5CleanupSafetyLedger(ledger: Pr5CleanupSafetyLedger): void {
  const failures: Error[] = [];

  for (const entry of ledger.repairRequests) {
    if (!cleanupSafetyRowExists('repair_request', entry.id)) {
      continue;
    }

    try {
      deletePr5RepairRequestBound(toPr5RepairRequestBinding(entry));
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  for (const responseId of ledger.engineerResponseIds) {
    if (!cleanupSafetyRowExists('engineer_response', responseId)) {
      continue;
    }

    try {
      deletePr5EngineerResponseRowsByIds([responseId]);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  for (const document of ledger.documents) {
    if (!cleanupSafetyRowExists('reference_document', document.id)) {
      continue;
    }

    const binding: Pr5ReferenceDocumentBinding = {
      createdByAccountId: document.createdByAccountId,
      id: document.id,
      titleKeyword: ledger.keyword,
    };

    try {
      const reference = readPr5ReferenceDocumentStorageReferenceBound(binding);

      deletePr5ReferenceDocumentBound(binding);

      if (reference !== null) {
        deleteE2EReferenceDocumentStorageFileByReference(reference);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      '清理安全组 ledger 回收失败（残留必须人工核对，不得静默通过）',
    );
  }
}

/** 按运行标识统计三表中的本轮残留行数（运行标识同时写入标题 / 故障描述 / 回复正文） */
export function countPr5CleanupSafetyRunRows(runId: string): {
  documents: number;
  requests: number;
  responses: number;
} {
  assertRunId(runId);

  return {
    documents: readSingleCountOrThrow(
      `SELECT COUNT(*) FROM reference_document WHERE title LIKE '%${runId}%'`,
      '本轮资料残留',
    ),
    requests: readSingleCountOrThrow(
      `SELECT COUNT(*) FROM repair_request WHERE fault_description LIKE '%${runId}%'`,
      '本轮维修申请残留',
    ),
    responses: readSingleCountOrThrow(
      `SELECT COUNT(*) FROM engineer_response WHERE response_text LIKE '%${runId}%'`,
      '本轮回复残留',
    ),
  };
}

/** 断言本轮无任何残留（三表计数全 0） */
export function assertPr5CleanupSafetyNoRunResidue(runId: string): void {
  const residue = countPr5CleanupSafetyRunRows(runId);

  if (residue.documents !== 0 || residue.requests !== 0 || residue.responses !== 0) {
    throw new Error(
      `清理安全组检测到本轮残留：资料 ${residue.documents} / 申请 ${residue.requests} / 回复 ${residue.responses}（运行标识 ${runId}）`,
    );
  }
}

/**
 * 残留按专属标识定位 + 逐字段核验归属（计划 §4.3）：
 * 同标识异主（资料创建人 / 申请客户与预期不符）立即失败关闭，绝不凭名称 / 关键字 / 固定 ID 删除。
 * 返回通过核验的残留精确 ID 集合，供调用方按绑定精确回收。
 */
export function locatePr5CleanupSafetyResidueByRunId(
  runId: string,
  expected: { documentOwnerAccountId: number; requestCustomerAccountId: number },
): { documentIds: number[]; requestIds: number[] } {
  assertRunId(runId);

  const keyword = buildPr5CleanupSafetyKeyword(runId);
  const documentIds = findPr5ReferenceDocumentIdsByKeyword(keyword);

  for (const id of documentIds) {
    const owner = Number(
      mysqlQuery(`SELECT created_by_account_id FROM reference_document WHERE id = ${id}`),
    );

    if (owner !== expected.documentOwnerAccountId) {
      throw new Error(
        `残留资料 ${id} 创建人与预期不符（同标识异主），失败关闭，拒绝删除：期望 ${expected.documentOwnerAccountId} 实际 ${owner}`,
      );
    }
  }

  const requestIds = mysqlQuery(
    `SELECT id FROM repair_request WHERE fault_description LIKE '%${runId}%'`,
  )
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);

  for (const id of requestIds) {
    const owner = Number(
      mysqlQuery(`SELECT customer_account_id FROM repair_request WHERE id = ${id}`),
    );

    if (owner !== expected.requestCustomerAccountId) {
      throw new Error(
        `残留维修申请 ${id} 归属客户与预期不符（同标识异主），失败关闭，拒绝删除：期望 ${expected.requestCustomerAccountId} 实际 ${owner}`,
      );
    }
  }

  return { documentIds, requestIds };
}

// ---- C5 用：隔离临时目录中的存储文件（不触碰后端真实存储目录） ----

export interface Pr5CleanupSafetyTempStorage {
  readonly dir: string;
  readonly references: readonly string[];
  readonly sentinelReference: string;
  filePath: (reference: string) => string;
  exists: (reference: string) => boolean;
  remove: (reference: string) => void;
  cleanup: () => void;
}

/**
 * 在独立临时目录建立本组专用的「存储文件」与外部哨兵文件
 * （与后端真实存储目录完全隔离，绝不触碰他人的物理文件）。
 */
export function createPr5CleanupSafetyTempStorage(fileCount: number): Pr5CleanupSafetyTempStorage {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr5-cleanup-safety-storage-'));
  const references: string[] = [];

  for (let index = 0; index < fileCount; index += 1) {
    const reference = `${randomBytes(16).toString('hex')}.md`;

    writeFileSync(path.join(dir, reference), `cleanup-safety-${index}`);
    references.push(reference);
  }

  const sentinelReference = `${randomBytes(16).toString('hex')}.md`;

  writeFileSync(path.join(dir, sentinelReference), 'external-sentinel');

  const filePath = (reference: string): string => path.join(dir, reference);

  return {
    cleanup: () => {
      rmSync(dir, { force: true, recursive: true });
    },
    dir,
    exists: (reference: string) => existsSync(filePath(reference)),
    filePath,
    references,
    remove: (reference: string) => {
      rmSync(filePath(reference), { force: true });
    },
    sentinelReference,
  };
}
