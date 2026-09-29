// e2e/helpers/pr5-real-flow.ts
//
// PR5 S5「真实权限与业务闭环」的共享基建（专用隔离库 lithography_e2e + 专用后端 3100）：
//
// 1. 环境预检：只允许在专用隔离库上执行，且物理清理必须显式 opt-in
//    （复用 real-backend.assertPhysicalCleanupAllowed，不自建平行安全门）；
// 2. Mock Seed 前置数据就绪断言（账号 / 型号 / 预置申请 / 预置资料），
//    让「前置数据不齐」以硬失败暴露，而不是靠用例逐个 skip 掩盖；
// 3. 「DB 生成 ID」证据：创建前快照主键集合，创建后断言新 ID 不在快照内——
//    直接证明本轮写入没有复用任何既有主键（含 Mock Seed 的固定主键）；
// 4. 归属核验后的物理清理：维修申请按 id + request_no + customer_account_id 三因子绑定，
//    参考资料按 id + created_by_account_id + 本轮标题关键字三因子绑定；绑定断言与
//    DELETE + 残留核对在同一个事务内完成，绑定不匹配即中止（连接关闭触发回滚），
//    不存在「绑定失败仍按 ID 继续删除」的路径。
//
// 所有进入 SQL 的字符串都先过白名单校验；密码经 MYSQL_PWD 注入（见 real-backend.mysqlQuery）。

import { DEDICATED_E2E_DB_NAME } from '../../e2e-real/dedicated-e2e-environment';

import {
  assertPhysicalCleanupAllowed,
  deleteE2EReferenceDocumentStorageFileByReference,
  mysqlQuery,
  readBackendEnv,
  REQUEST_NO_PATTERN,
  STORAGE_REFERENCE_PATTERN,
} from './real-backend';

/** Mock Seed（backend/scripts/seed-mock.ts）预置账号：S5 各角色真实链路使用 */
export const PR5_SEED_LOGIN_NAMES = [
  'mock_super_admin',
  'mock_engineer_chen',
  'mock_engineer_li',
  'mock_customer_alpha',
  'mock_customer_beta',
] as const;

/** Mock Seed 预置的「客户甲已接单且已有回复」申请：只读断言目标 */
export const PR5_SEED_ACCEPTED_REQUEST_NO = 'MOCK-RR-2026-0003';

/** Mock Seed 预置的未软删资料（970001~970003）与已软删资料（970004） */
export const PR5_SEED_VISIBLE_DOCUMENT_IDS = [970001, 970002, 970003] as const;
export const PR5_SEED_SOFT_DELETED_DOCUMENT_ID = 970004;

/** 本轮自建资料标题前缀（与开发库 e2e 的前缀区分，互不干扰） */
export const PR5_DOC_TITLE_PREFIX = 'PR5真实链路验收行';

/** 运行级唯一标识并入标题后的完整关键字白名单 */
export const PR5_DOC_KEYWORD_PATTERN = /^PR5真实链路验收行·[a-z0-9]{8,32}$/;

/**
 * 本轮资料标题前缀白名单：关键字 + 中文括号后缀（用于 S5-5 越权前缀计数）。
 * 禁止 `%` / `_` / 引号 / 反斜杠 / 空白，杜绝 LIKE 通配符与 SQL 注入面。
 */
const PR5_DOC_TITLE_PREFIX_PATTERN = /^PR5真实链路验收行·[a-z0-9]{8,32}（[^%_\\'"\s]{0,32}$/;

/** 资料行快照列白名单（代码内静态；任何列变更须同步阅读端前后比对断言） */
const PR5_REFERENCE_DOCUMENT_SNAPSHOT_COLUMNS = [
  'title',
  'document_type',
  'equipment_model_id',
  'description',
  'content_text',
  'original_filename',
  'mime_type',
  'deprecated',
] as const;

export function buildPr5DocKeyword(runId: string): string {
  return `${PR5_DOC_TITLE_PREFIX}·${runId}`;
}

type Pr5SnapshotTable = 'repair_request' | 'reference_document';

const PR5_SNAPSHOT_TABLES: readonly Pr5SnapshotTable[] = ['repair_request', 'reference_document'];

/**
 * 专用环境预检：物理清理授权 + 目标库必须是专用隔离库 lithography_e2e，
 * 且 SQL helper 实际连接的库与之完全一致。任何一条不满足都直接抛错（不 skip 掩盖）。
 */
export function assertPr5DedicatedEnvironment(env = readBackendEnv()): void {
  assertPhysicalCleanupAllowed(env);

  if (env.DB_NAME !== DEDICATED_E2E_DB_NAME) {
    throw new Error(
      `PR5 真实链路只允许跑在专用隔离库 ${DEDICATED_E2E_DB_NAME} 上，当前 DB_NAME=${JSON.stringify(env.DB_NAME)}`,
    );
  }

  const actualDatabase = mysqlQuery('SELECT DATABASE()');

  if (actualDatabase !== DEDICATED_E2E_DB_NAME) {
    throw new Error(
      `SQL helper 实际连接的库与专用隔离库不一致：实际 ${JSON.stringify(actualDatabase)}`,
    );
  }
}

function readSingleCount(sql: string, context: string): number {
  const value = Number(mysqlQuery(sql));

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context} 计数结果异常：${JSON.stringify(value)}`);
  }

  return value;
}

/**
 * Mock Seed 前置数据就绪断言（S5-8）：账号、型号、预置申请状态、预置资料可见性
 * 全部按 SQL 事实核对；缺任何一项直接抛错，禁止用 skip 掩盖。
 */
export function assertPr5SeedDataReady(): void {
  const accountList = PR5_SEED_LOGIN_NAMES.map((loginName) => `'${loginName}'`).join(', ');
  const accountCount = readSingleCount(
    `SELECT COUNT(*) FROM base_user_account WHERE login_name IN (${accountList})`,
    'Mock Seed 账号',
  );

  if (accountCount !== PR5_SEED_LOGIN_NAMES.length) {
    throw new Error(
      `Mock Seed 账号不齐：期望 ${PR5_SEED_LOGIN_NAMES.length} 个，实际 ${accountCount} 个`,
    );
  }

  const enabledModelCount = readSingleCount(
    'SELECT COUNT(*) FROM equipment_model WHERE enabled = 1',
    '启用设备型号',
  );

  if (enabledModelCount < 10) {
    throw new Error(`启用设备型号不足：期望至少 10 个，实际 ${enabledModelCount} 个`);
  }

  const acceptedCount = readSingleCount(
    `SELECT COUNT(*) FROM repair_request WHERE request_no = '${PR5_SEED_ACCEPTED_REQUEST_NO}' AND is_accepted = 1 AND deprecated = 0`,
    'Mock Seed 已接单申请',
  );

  if (acceptedCount !== 1) {
    throw new Error('Mock Seed 已接单申请不齐：缺少 MOCK-RR-2026-0003 或状态不符');
  }

  const acceptedResponseCount = readSingleCount(
    `SELECT COUNT(*) FROM engineer_response WHERE request_id = (SELECT id FROM repair_request WHERE request_no = '${PR5_SEED_ACCEPTED_REQUEST_NO}')`,
    'Mock Seed 已接单申请回复',
  );

  if (acceptedResponseCount < 1) {
    throw new Error('Mock Seed 已接单申请缺少工程师回复，无法覆盖「有回复」真实数据');
  }

  const visibleDocumentIds = PR5_SEED_VISIBLE_DOCUMENT_IDS.join(', ');
  const visibleDocumentCount = readSingleCount(
    `SELECT COUNT(*) FROM reference_document WHERE id IN (${visibleDocumentIds}) AND deprecated = 0`,
    'Mock Seed 可见资料',
  );

  if (visibleDocumentCount !== PR5_SEED_VISIBLE_DOCUMENT_IDS.length) {
    throw new Error(
      `Mock Seed 可见资料不齐：期望 ${PR5_SEED_VISIBLE_DOCUMENT_IDS.length} 行，实际 ${visibleDocumentCount} 行`,
    );
  }

  const softDeletedDocumentCount = readSingleCount(
    `SELECT COUNT(*) FROM reference_document WHERE id = ${PR5_SEED_SOFT_DELETED_DOCUMENT_ID} AND deprecated = 1`,
    'Mock Seed 已软删资料',
  );

  if (softDeletedDocumentCount !== 1) {
    throw new Error('Mock Seed 已软删资料不齐：缺少 970004 或未标记软删');
  }
}

/** 创建前主键快照：用于证明本轮写入行使用了数据库生成的新主键 */
export function readPr5PrimaryKeySnapshot(table: Pr5SnapshotTable): ReadonlySet<number> {
  if (!PR5_SNAPSHOT_TABLES.includes(table)) {
    throw new Error(`主键快照目标表未通过白名单校验，拒绝查询：${JSON.stringify(table)}`);
  }

  const rows = mysqlQuery(`SELECT id FROM ${table}`)
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  const snapshot = new Set<number>();

  for (const row of rows) {
    const id = Number(row);

    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`主键快照解析异常：${JSON.stringify(row)}`);
    }

    snapshot.add(id);
  }

  return snapshot;
}

/** 断言本轮创建行的 ID 由数据库生成（不命中创建前主键快照，即未复用任何既有主键） */
export function assertPr5GeneratedId(
  rowId: number,
  snapshot: ReadonlySet<number>,
  label: string,
): void {
  if (!Number.isSafeInteger(rowId) || rowId <= 0) {
    throw new Error(`${label} 的 ID 未通过正整数校验：${JSON.stringify(rowId)}`);
  }

  if (snapshot.has(rowId)) {
    throw new Error(
      `${label} 的 ID ${rowId} 命中创建前主键快照：复用了既有主键（禁止固定主键或种子主键）`,
    );
  }
}

/**
 * SQL 字符串字面量白名单（P1-1）：完整字段绑定要内联进 WHERE，值来自 ledger / 数据库回读，
 * 拒绝引号、反斜杠、LIKE 通配符与换行，杜绝字面量逃逸。空串非法（本轮所有绑定字段均非空）。
 */
export const PR5_SQL_LITERAL_PATTERN = /^[^'\\%\r\n]{1,300}$/;

function assertPr5SqlLiteral(label: string, value: string): void {
  if (!PR5_SQL_LITERAL_PATTERN.test(value)) {
    throw new Error(`${label}未通过 SQL 字面量白名单校验：${JSON.stringify(value)}`);
  }
}

function buildPr5NullableTextCondition(column: string, value: string | null): string {
  if (value === null || value === 'NULL') {
    return `${column} IS NULL`;
  }

  assertPr5SqlLiteral(`完整绑定字段 ${column}`, value);

  return `${column} = '${value}'`;
}

function buildPr5NullableIntegerCondition(column: string, value: number | null): string {
  if (value === null) {
    return `${column} IS NULL`;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`完整绑定字段 ${column} 未通过正整数校验：${JSON.stringify(value)}`);
  }

  return `${column} = ${value}`;
}

/**
 * 维修申请的**完整字段预期**（P1-1）：提供后，只读预检与事务内 DELETE 都会按这些字段
 * 精确匹配（等同 `AND` 追加到 where），任一字段被外部改写即精确命中 0 行 → 零写入失败关闭；
 * 同时也关闭「只读预检通过、DELETE 前字段被改写」的 TOCTOU 窗口。
 */
export interface Pr5RepairRequestExpectation {
  readonly equipmentModelId: number | null;
  readonly errorCode: string;
  readonly faultDescription: string;
  readonly contentMd: string;
}

function buildPr5RepairRequestFullConditions(expectation: Pr5RepairRequestExpectation): string {
  assertPr5SqlLiteral('维修申请完整绑定故障码', expectation.errorCode);
  assertPr5SqlLiteral('维修申请完整绑定故障描述', expectation.faultDescription);
  assertPr5SqlLiteral('维修申请完整绑定正文', expectation.contentMd);

  return [
    buildPr5NullableIntegerCondition('equipment_model_id', expectation.equipmentModelId),
    `error_code = '${expectation.errorCode}'`,
    `fault_description = '${expectation.faultDescription}'`,
    `content_md = '${expectation.contentMd}'`,
  ].join(' AND ');
}

export interface Pr5RepairRequestBinding {
  /** 数据库生成的维修申请主键 */
  readonly id: number;
  readonly requestNo: string;
  readonly customerAccountId: number;
  /** 本轮为该申请创建的工程师回复 ID（清理时按此集合精确绑定子行，不扩大删除外部回复） */
  readonly responseIds: readonly number[];
  /** 完整字段预期（可选）：ledger 回收 / 残留恢复必须提供；提供后预检与 DELETE 都按全字段精确匹配 */
  readonly expectation?: Pr5RepairRequestExpectation;
}

/** 维修申请绑定 where 子句（三因子必选 + 可选完整字段预期；预检与 DELETE 共用同一口径） */
function buildPr5RepairRequestWhere(binding: Pr5RepairRequestBinding): string {
  const { id, requestNo, customerAccountId } = binding;
  const base = `id = ${id} AND request_no = '${requestNo}' AND customer_account_id = ${customerAccountId}`;

  return binding.expectation === undefined
    ? base
    : `${base} AND ${buildPr5RepairRequestFullConditions(binding.expectation)}`;
}

/**
 * 归属核验后物理删除本轮自建维修申请（含其本轮工程师回复）。
 *
 * 事务内顺序：父行三因子绑定唯一断言 → 子行集合精确断言（实际回复集合必须与本轮
 * responseIds 完全一致，多一条外部回复即失败关闭）→ 按 request_id + id IN (...) 精确删子行
 * → 再按同一三因子删主行 → 残留核对为 0。任一绑定断言失败会让 MySQL 客户端在 DELETE
 * 之前报错退出，事务自动回滚（连接关闭触发回滚）。
 */
/** 三因子 + 回复集合绑定参数白名单校验（删除原语与只读预检共用同一口径，杜绝两套校验漂移） */
function assertPr5RepairRequestBindingParams(binding: Pr5RepairRequestBinding): void {
  const { id, requestNo, customerAccountId, responseIds } = binding;

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`维修申请清理目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  if (!REQUEST_NO_PATTERN.test(requestNo)) {
    throw new Error(`维修申请清理目标编号未通过白名单校验：${JSON.stringify(requestNo)}`);
  }

  if (!Number.isSafeInteger(customerAccountId) || customerAccountId <= 0) {
    throw new Error(
      `维修申请清理目标客户账号未通过正整数校验：${JSON.stringify(customerAccountId)}`,
    );
  }

  for (const responseId of responseIds) {
    if (!Number.isSafeInteger(responseId) || responseId <= 0) {
      throw new Error(`维修申请清理目标回复 ID 未通过正整数校验：${JSON.stringify(responseId)}`);
    }
  }

  // 完整字段预期若存在，先行校验（内联进 where 前的白名单门槛，杜绝字面量逃逸）
  if (binding.expectation !== undefined) {
    buildPr5RepairRequestFullConditions(binding.expectation);
  }
}

export function deletePr5RepairRequestBound(binding: Pr5RepairRequestBinding): void {
  const { id, responseIds } = binding;

  assertPr5RepairRequestBindingParams(binding);

  assertPhysicalCleanupAllowed(readBackendEnv());

  const where = buildPr5RepairRequestWhere(binding);
  // 无回复时以 0 占位：IN (0) 不匹配任何行，等价于「本轮允许的回复集合为空」
  const expectedResponseIds = responseIds.length === 0 ? '0' : responseIds.join(', ');

  mysqlQuery(
    [
      'START TRANSACTION',
      `SET @pr5_rr_bound = (SELECT COUNT(*) FROM repair_request WHERE ${where})`,
      "SET @pr5_rr_binding = IF(@pr5_rr_bound = 1, 'SELECT 1', 'SELECT pr5_repair_request_binding_id_request_no_customer_must_match_exactly_one')",
      'PREPARE pr5_rr_binding_check FROM @pr5_rr_binding',
      'EXECUTE pr5_rr_binding_check',
      'DEALLOCATE PREPARE pr5_rr_binding_check',
      `SET @pr5_rr_child_total = (SELECT COUNT(*) FROM engineer_response WHERE request_id = ${id})`,
      `SET @pr5_rr_child_matched = (SELECT COUNT(*) FROM engineer_response WHERE request_id = ${id} AND id IN (${expectedResponseIds}))`,
      `SET @pr5_rr_child_binding = IF(@pr5_rr_child_total = ${responseIds.length} AND @pr5_rr_child_matched = ${responseIds.length}, 'SELECT 1', 'SELECT pr5_engineer_response_child_binding_must_match_this_run')`,
      'PREPARE pr5_rr_child_check FROM @pr5_rr_child_binding',
      'EXECUTE pr5_rr_child_check',
      'DEALLOCATE PREPARE pr5_rr_child_check',
      `DELETE FROM engineer_response WHERE request_id = ${id} AND id IN (${expectedResponseIds})`,
      `DELETE FROM repair_request WHERE ${where}`,
      `SET @pr5_rr_residue = (SELECT COUNT(*) FROM repair_request WHERE id = ${id}) + (SELECT COUNT(*) FROM engineer_response WHERE request_id = ${id})`,
      "SET @pr5_rr_assertion = IF(@pr5_rr_residue = 0, 'SELECT 1', 'SELECT pr5_repair_request_residue_must_be_zero')",
      'PREPARE pr5_rr_residue_check FROM @pr5_rr_assertion',
      'EXECUTE pr5_rr_residue_check',
      'DEALLOCATE PREPARE pr5_rr_residue_check',
      'COMMIT',
    ].join('; '),
  );
}

/**
 * 只读预检维修申请的三因子绑定与「本轮回复集合精确一致」（**不写库**）。
 * 供清理编排在**任何 DELETE 之前**整体预检：发现未知子行 / 同标识异主即抛错，
 * 保证「发现冲突后零写入失败关闭」；与 deletePr5RepairRequestBound 共用同一 where 口径。
 */
export function assertPr5RepairRequestBindingBound(binding: Pr5RepairRequestBinding): void {
  assertPr5RepairRequestBindingParams(binding);

  const { id, responseIds } = binding;
  const where = buildPr5RepairRequestWhere(binding);
  const expectedResponseIds = responseIds.length === 0 ? '0' : responseIds.join(', ');
  const raw = mysqlQuery(
    'SELECT CONCAT(' +
      `(SELECT COUNT(*) FROM repair_request WHERE ${where}), '|', ` +
      `(SELECT COUNT(*) FROM engineer_response WHERE request_id = ${id}), '|', ` +
      `(SELECT COUNT(*) FROM engineer_response WHERE request_id = ${id} AND id IN (${expectedResponseIds})))`,
  ).trim();
  const columns = raw.split('|');

  if (columns.length !== 3) {
    throw new Error(`维修申请只读预检结果异常：${JSON.stringify(raw)}`);
  }

  const [bound, childTotal, childMatched] = columns.map(Number);

  if (bound !== 1) {
    throw new Error(
      `pr5_repair_request_binding_id_request_no_customer_must_match_exactly_one：维修申请三因子绑定未精确命中 1 行（实际 ${JSON.stringify(columns[0])}）：${JSON.stringify(binding)}`,
    );
  }

  if (childTotal !== responseIds.length || childMatched !== responseIds.length) {
    throw new Error(
      `pr5_engineer_response_child_binding_must_match_this_run：本轮回复集合与父申请子行不一致（子行 ${childTotal} / 命中 ${childMatched} / 期望 ${responseIds.length}）：${JSON.stringify(binding)}`,
    );
  }
}

/** 只读读取维修申请状态三要素：用于「拒绝删除后数据不变」的前后快照比对（按编号 + 客户双重绑定） */
export function readPr5RepairRequestState(
  requestNo: string,
  customerAccountId: number,
): {
  isAccepted: string;
  deprecated: string;
  deletedAtIsNotNull: string;
} {
  if (!REQUEST_NO_PATTERN.test(requestNo)) {
    throw new Error(`维修申请状态读取编号未通过白名单校验：${JSON.stringify(requestNo)}`);
  }

  if (!Number.isSafeInteger(customerAccountId) || customerAccountId <= 0) {
    throw new Error(
      `维修申请状态读取客户账号未通过正整数校验：${JSON.stringify(customerAccountId)}`,
    );
  }

  const [row] = mysqlQuery(
    `SELECT is_accepted, deprecated, deleted_at IS NOT NULL FROM repair_request WHERE request_no = '${requestNo}' AND customer_account_id = ${customerAccountId}`,
  )
    .split('\n')
    .map((value) => value.trim());

  const columns = row?.split('\t');

  if (columns === undefined || columns.length !== 3) {
    throw new Error(`维修申请状态读取结果异常：${JSON.stringify(row)}`);
  }

  return { deletedAtIsNotNull: columns[2], deprecated: columns[1], isAccepted: columns[0] };
}

export interface Pr5ReferenceDocumentBinding {
  /** 数据库生成的参考资料主键 */
  readonly id: number;
  readonly createdByAccountId: number;
  /** 本轮运行唯一标题关键字（并入三因子绑定，避免误删他人同 ID 数据） */
  readonly titleKeyword: string;
  /** 完整字段预期（可选）：ledger 回收 / 残留恢复必须提供；提供后预检与 DELETE 都按全字段精确匹配 */
  readonly expectation?: Pr5ReferenceDocumentExpectation;
}

/**
 * 参考资料（除三因子外）的**完整字段预期**（P1-1）：提供后，只读预检与事务内 DELETE 都会按
 * 这些字段精确匹配，任一字段被外部改写即零写入失败关闭，同时关闭 TOCTOU 窗口。
 */
export interface Pr5ReferenceDocumentExpectation {
  readonly title: string;
  readonly documentType: string;
  readonly contentText: string;
  readonly storageBackend: string | null;
  readonly storageReference: string | null;
  readonly equipmentModelId: number | null;
}

function buildPr5ReferenceDocumentFullConditions(
  expectation: Pr5ReferenceDocumentExpectation,
): string {
  assertPr5SqlLiteral('资料完整绑定标题', expectation.title);
  assertPr5SqlLiteral('资料完整绑定类型', expectation.documentType);
  assertPr5SqlLiteral('资料完整绑定正文', expectation.contentText);

  if (expectation.storageBackend !== null && expectation.storageBackend !== 'local') {
    throw new Error(
      `资料完整绑定存储后端未通过白名单校验：${JSON.stringify(expectation.storageBackend)}`,
    );
  }

  if (
    expectation.storageReference !== null &&
    !STORAGE_REFERENCE_PATTERN.test(expectation.storageReference)
  ) {
    throw new Error(
      `资料完整绑定存储引用未通过白名单校验：${JSON.stringify(expectation.storageReference)}`,
    );
  }

  return [
    `title = '${expectation.title}'`,
    `document_type = '${expectation.documentType}'`,
    `content_text = '${expectation.contentText}'`,
    buildPr5NullableTextCondition('storage_backend', expectation.storageBackend),
    buildPr5NullableTextCondition('storage_reference', expectation.storageReference),
    buildPr5NullableIntegerCondition('equipment_model_id', expectation.equipmentModelId),
  ].join(' AND ');
}

/** 资料绑定 where 子句（三因子必选 + 可选完整字段预期；预检、引用读取与 DELETE 共用同一口径） */
function buildPr5ReferenceDocumentWhere(binding: Pr5ReferenceDocumentBinding): string {
  const { id, createdByAccountId, titleKeyword } = binding;
  const base = `id = ${id} AND created_by_account_id = ${createdByAccountId} AND title LIKE '%${titleKeyword}%'`;

  return binding.expectation === undefined
    ? base
    : `${base} AND ${buildPr5ReferenceDocumentFullConditions(binding.expectation)}`;
}

/** 三因子绑定参数白名单校验（删除与只读核验共用同一口径，杜绝两套校验漂移） */
function assertPr5ReferenceDocumentBinding(binding: Pr5ReferenceDocumentBinding): void {
  const { id, createdByAccountId, titleKeyword } = binding;

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`参考资料清理目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  if (!Number.isSafeInteger(createdByAccountId) || createdByAccountId <= 0) {
    throw new Error(
      `参考资料清理目标创建人账号未通过正整数校验：${JSON.stringify(createdByAccountId)}`,
    );
  }

  if (!PR5_DOC_KEYWORD_PATTERN.test(titleKeyword)) {
    throw new Error(`参考资料清理目标标题关键字未通过白名单校验：${JSON.stringify(titleKeyword)}`);
  }

  // 完整字段预期若存在，先行校验（内联进 where 前的白名单门槛，杜绝字面量逃逸）
  if (binding.expectation !== undefined) {
    buildPr5ReferenceDocumentFullConditions(binding.expectation);
  }
}

/**
 * 归属核验并读取本行精确存储引用（P1-2）：调用方必须先经本函数核验三因子绑定唯一命中，
 * 再按返回的精确引用删除物理文件——绑定不唯一或引用非法即抛错（失败关闭），
 * 绝不删除未完成归属核验的文件。无存储引用（纯文本资料）返回 null。
 */
export function readPr5ReferenceDocumentStorageReferenceBound(
  binding: Pr5ReferenceDocumentBinding,
): string | null {
  assertPr5ReferenceDocumentBinding(binding);

  const where = buildPr5ReferenceDocumentWhere(binding);

  // COUNT 与引用用 '|' 拼接成单列返回：mysql -N -B 的空列是行尾制表符，读回后被 trim 吃掉，
  // 无法区分「引用为空」与「列缺失」；'|' 不可能出现在引用白名单（hex + 扩展名）内，天然安全。
  const raw = mysqlQuery(
    `SELECT CONCAT(COUNT(*), '|', IFNULL(MAX(storage_reference), '')) FROM reference_document WHERE ${where}`,
  ).trim();
  const columns = raw.split('|');

  if (columns.length !== 2) {
    throw new Error(`参考资料存储引用读取结果异常：${JSON.stringify(raw)}`);
  }

  const boundCount = Number(columns[0]);

  if (!Number.isSafeInteger(boundCount) || boundCount !== 1) {
    throw new Error(
      `参考资料归属核验未精确命中 1 行（实际 ${JSON.stringify(columns[0])} 行），拒绝删除物理文件：${JSON.stringify(binding)}`,
    );
  }

  const reference = columns[1];

  if (reference === '' || reference === 'NULL') {
    return null;
  }

  if (!STORAGE_REFERENCE_PATTERN.test(reference)) {
    throw new Error(`参考资料存储引用未通过白名单校验，拒绝删除：${JSON.stringify(reference)}`);
  }

  return reference;
}

/**
 * 归属核验后物理删除本轮自建参考资料行。
 *
 * 事务内顺序：三因子绑定唯一断言（id + 创建人账号 + 本轮标题关键字）→ 精确删除 → 残留核对为 0。
 * 物理文件删除必须以 readPr5ReferenceDocumentStorageReferenceBound 事先取到的精确引用为准，
 * 且必须先于删行取引用（删行后反查将空转）；顺序由 spec 的清理编排保证。
 */
export function deletePr5ReferenceDocumentBound(binding: Pr5ReferenceDocumentBinding): void {
  assertPr5ReferenceDocumentBinding(binding);

  const { id } = binding;

  assertPhysicalCleanupAllowed(readBackendEnv());

  const where = buildPr5ReferenceDocumentWhere(binding);

  mysqlQuery(
    [
      'START TRANSACTION',
      `SET @pr5_rd_bound = (SELECT COUNT(*) FROM reference_document WHERE ${where})`,
      "SET @pr5_rd_binding = IF(@pr5_rd_bound = 1, 'SELECT 1', 'SELECT pr5_reference_document_binding_id_creator_keyword_must_match_exactly_one')",
      'PREPARE pr5_rd_binding_check FROM @pr5_rd_binding',
      'EXECUTE pr5_rd_binding_check',
      'DEALLOCATE PREPARE pr5_rd_binding_check',
      `DELETE FROM reference_document WHERE ${where}`,
      `SET @pr5_rd_residue = (SELECT COUNT(*) FROM reference_document WHERE id = ${id})`,
      "SET @pr5_rd_assertion = IF(@pr5_rd_residue = 0, 'SELECT 1', 'SELECT pr5_reference_document_residue_must_be_zero')",
      'PREPARE pr5_rd_residue_check FROM @pr5_rd_assertion',
      'EXECUTE pr5_rd_residue_check',
      'DEALLOCATE PREPARE pr5_rd_residue_check',
      'COMMIT',
    ].join('; '),
  );
}

/**
 * 按本轮标题关键字反查资料 ID（兜底清理用；只匹配本轮运行的自建行）。
 * 不按 deprecated 过滤：软删行同样属于本轮自建行，兜底必须能回收（D4-1）。
 */
export function findPr5ReferenceDocumentIdsByKeyword(titleKeyword: string): number[] {
  if (!PR5_DOC_KEYWORD_PATTERN.test(titleKeyword)) {
    throw new Error(`资料反查关键字未通过白名单校验：${JSON.stringify(titleKeyword)}`);
  }

  return mysqlQuery(`SELECT id FROM reference_document WHERE title LIKE '%${titleKeyword}%'`)
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

/**
 * 按本轮标题前缀统计资料行数（S5-5「越权新建未落库」只读计数）。
 * 前缀须过白名单（禁止 % / _ / 引号 / 反斜杠 / 空白），杜绝运行关键字直接拼 SQL。
 */
export function countPr5ReferenceDocumentsByTitlePrefix(titlePrefix: string): number {
  if (!PR5_DOC_TITLE_PREFIX_PATTERN.test(titlePrefix)) {
    throw new Error(`资料标题前缀未通过白名单校验：${JSON.stringify(titlePrefix)}`);
  }

  return readSingleCount(
    `SELECT COUNT(*) FROM reference_document WHERE title LIKE '${titlePrefix}%'`,
    '资料标题前缀',
  );
}

/** 按精确 ID 读取软删标记（「软删后不可见」的 DB 级证据；无行返回 null） */
export function readPr5ReferenceDocumentDeprecatedById(id: number): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`资料软删标记查询目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  const value = mysqlQuery(`SELECT deprecated FROM reference_document WHERE id = ${id}`);

  return value.length > 0 ? value : null;
}

/**
 * 按精确 ID 读取资料行完整字段快照（P2-3/D2-1）：用于「越权写被拒后目标行未被改写」的前后比对。
 * 列集合为代码内静态白名单，不拼接外部输入；无行返回 null。
 */
export function readPr5ReferenceDocumentSnapshot(id: number): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`资料快照查询目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  const value = mysqlQuery(
    `SELECT ${PR5_REFERENCE_DOCUMENT_SNAPSHOT_COLUMNS.join(', ')} FROM reference_document WHERE id = ${id}`,
  );

  return value.length > 0 ? value : null;
}

/** 回复正文白名单：非空、无引号/反斜杠/通配符/换行（正文同时是本轮正文绑定因子） */
export const PR5_RESPONSE_TEXT_PATTERN = /^[^'\\%\r\n]{1,200}$/;

export interface Pr5EngineerResponseBinding {
  /** 工程师回复主键 */
  readonly id: number;
  /** 父维修申请主键 */
  readonly requestId: number;
  readonly engineerAccountId: number;
  readonly customerAccountId: number;
  /** 本轮写入的回复正文（白名单内；同时作为运行级正文绑定因子，按精确相等核验） */
  readonly responseText: string;
}

/** 回复完整 binding 参数白名单校验（删除原语与只读预检共用，杜绝两套校验漂移） */
function assertPr5EngineerResponseBindingParams(binding: Pr5EngineerResponseBinding): void {
  const { id, requestId, engineerAccountId, customerAccountId, responseText } = binding;

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`工程师回复清理目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    throw new Error(`工程师回复父申请 ID 未通过正整数校验：${JSON.stringify(requestId)}`);
  }

  if (!Number.isSafeInteger(engineerAccountId) || engineerAccountId <= 0) {
    throw new Error(`工程师回复工程师账号未通过正整数校验：${JSON.stringify(engineerAccountId)}`);
  }

  if (!Number.isSafeInteger(customerAccountId) || customerAccountId <= 0) {
    throw new Error(`工程师回复客户账号未通过正整数校验：${JSON.stringify(customerAccountId)}`);
  }

  if (!PR5_RESPONSE_TEXT_PATTERN.test(responseText)) {
    throw new Error(`工程师回复正文未通过白名单校验：${JSON.stringify(responseText)}`);
  }
}

/** 回复完整绑定 where 子句（删除与只读预检共用同一口径） */
function buildPr5EngineerResponseBindingWhere(binding: Pr5EngineerResponseBinding): string {
  const { id, requestId, engineerAccountId, customerAccountId, responseText } = binding;

  return (
    `id = ${id} AND request_id = ${requestId} AND engineer_account_id = ${engineerAccountId}` +
    ` AND customer_account_id = ${customerAccountId} AND response_text = '${responseText}'`
  );
}

/**
 * 只读核验回复的完整 binding（**不写库**）：五因子必须精确命中 1 行，否则失败关闭。
 * 供清理编排在**任何 DELETE 之前**做整体预检；发现同 ID 异主 / 正文不符即零写入抛错。
 */
export function assertPr5EngineerResponseBindingBound(binding: Pr5EngineerResponseBinding): void {
  assertPr5EngineerResponseBindingParams(binding);

  const where = buildPr5EngineerResponseBindingWhere(binding);
  const raw = mysqlQuery(`SELECT COUNT(*) FROM engineer_response WHERE ${where}`).trim();
  const matched = Number(raw);

  if (!Number.isSafeInteger(matched) || matched !== 1) {
    throw new Error(
      `pr5_engineer_response_binding_must_match_exactly_one：回复完整绑定核验未精确命中 1 行（实际 ${JSON.stringify(raw)}）：${JSON.stringify(binding)}`,
    );
  }
}

/**
 * 回复删除按**完整 binding** 绑定（id + request_id + engineer_account_id + customer_account_id
 * + 本轮正文），事务内先断言精确命中 1 行，再删除并核对精确影响行数为 1；任一不符即失败关闭
 * （无 DELETE 发生，连接关闭触发回滚）。**已不存在**（父行删除时已连带删除）视为幂等跳过。
 * 拒绝任何「仅凭 ID」的兜底删除。
 */
export function deletePr5EngineerResponseRowsBound(binding: Pr5EngineerResponseBinding): void {
  assertPr5EngineerResponseBindingParams(binding);

  assertPhysicalCleanupAllowed(readBackendEnv());

  const { id } = binding;
  const where = buildPr5EngineerResponseBindingWhere(binding);

  mysqlQuery(
    [
      'START TRANSACTION',
      `SET @pr5_er_present = (SELECT COUNT(*) FROM engineer_response WHERE id = ${id})`,
      `SET @pr5_er_bound = (SELECT COUNT(*) FROM engineer_response WHERE ${where})`,
      "SET @pr5_er_binding = IF(@pr5_er_present = 0 OR @pr5_er_bound = 1, 'SELECT 1', 'SELECT pr5_engineer_response_binding_must_match_exactly_one')",
      'PREPARE pr5_er_binding_check FROM @pr5_er_binding',
      'EXECUTE pr5_er_binding_check',
      'DEALLOCATE PREPARE pr5_er_binding_check',
      `DELETE FROM engineer_response WHERE ${where}`,
      // 预检已保证 bound ∈ {0,1}，删除后按 id 残留必须为 0 ⇒ 精确影响行数等于 bound
      `SET @pr5_er_residue = (SELECT COUNT(*) FROM engineer_response WHERE id = ${id})`,
      "SET @pr5_er_assertion = IF(@pr5_er_residue = 0, 'SELECT 1', 'SELECT pr5_engineer_response_residue_must_be_zero')",
      'PREPARE pr5_er_residue_check FROM @pr5_er_assertion',
      'EXECUTE pr5_er_residue_check',
      'DEALLOCATE PREPARE pr5_er_residue_check',
      'COMMIT',
    ].join('; '),
  );
}

/** 物理文件删除器：显式注入，使「文件删除失败只留可回收孤儿」可被失败注入与断言 */
export type Pr5StorageFileDeleter = (reference: string) => void;

/**
 * 可恢复残留回执（S4）：精确记录本轮清理中「已删 / 残留」的行与文件引用。
 * 只含本轮 ID 与存储引用，不含连接串、账号、密码等任何凭据。
 */
export interface Pr5CleanupReceipt {
  readonly deletedRowIds: readonly number[];
  readonly deletedFileReferences: readonly string[];
  readonly residualRowIds: readonly number[];
  readonly residualFileReferences: readonly string[];
  /** 逐项失败原因（来自受保护 helper 的脱敏错误文本），供调用方诊断且不吞错误 */
  readonly failureMessages: readonly string[];
}

export interface Pr5DocumentCleanupOptions {
  /** 行删除器（默认受保护的三因子绑定删除）；注入后可对指定行制造删除失败 */
  readonly deleteRow?: (binding: Pr5ReferenceDocumentBinding) => void;
  /** 文件删除器（默认真实存储文件删除）；注入后可对指定引用制造删除失败 */
  readonly deleteFile?: Pr5StorageFileDeleter;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 本轮自建参考资料的统一清理编排（S4）：**全量预检 → 精确删行 → 按已核验引用删文件**。
 *
 * 1. 先对全部绑定做三因子归属核验并取精确存储引用：任一不唯一 / 引用非法即抛错，
 *    此时行与文件均未改动（失败发生在任何 DELETE 之前）；
 * 2. 再逐行精确删除，逐文件按已核验引用删除；
 * 3. 任一行删除失败：该行计入残留，**并跳过其文件删除**（行未删即不得删文件），
 *    不扩大删除范围；任一文件删除失败：该引用计入残留，只留下可被下一轮精确回收的孤儿文件；
 * 4. 返回可恢复残留回执，绝不吞掉任何失败（调用方据回执或 assertPr5CleanupReceiptClean 判红）。
 */
export function cleanupPr5ReferenceDocumentsBound(
  bindings: readonly Pr5ReferenceDocumentBinding[],
  options: Pr5DocumentCleanupOptions = {},
): Pr5CleanupReceipt {
  const deleteRow = options.deleteRow ?? deletePr5ReferenceDocumentBound;
  const deleteFile = options.deleteFile ?? deleteE2EReferenceDocumentStorageFileByReference;

  // 第一步：全量预检（不通过即抛错，未删任何行/文件）
  const resolved = bindings.map((binding) => ({
    binding,
    reference: readPr5ReferenceDocumentStorageReferenceBound(binding),
  }));

  const deletedRowIds: number[] = [];
  const deletedFileReferences: string[] = [];
  const residualRowIds: number[] = [];
  const residualFileReferences: string[] = [];
  const failureMessages: string[] = [];

  // 第二步：逐行精确删行；第三步：按已核验引用删文件（只删成功删行的那一行文件）
  for (const { binding, reference } of resolved) {
    try {
      deleteRow(binding);
      deletedRowIds.push(binding.id);
    } catch (error) {
      residualRowIds.push(binding.id);
      failureMessages.push(`删行失败 id=${binding.id}：${failureMessage(error)}`);
      continue;
    }

    if (reference === null) {
      continue;
    }

    try {
      deleteFile(reference);
      deletedFileReferences.push(reference);
    } catch (error) {
      residualFileReferences.push(reference);
      failureMessages.push(`删文件失败 reference=${reference}：${failureMessage(error)}`);
    }
  }

  return {
    deletedFileReferences,
    deletedRowIds,
    failureMessages,
    residualFileReferences,
    residualRowIds,
  };
}

/** 回执断言：存在任何行/文件残留即抛错（残留必须可观测，绝不静默通过） */
export function assertPr5CleanupReceiptClean(receipt: Pr5CleanupReceipt): void {
  if (receipt.residualRowIds.length === 0 && receipt.residualFileReferences.length === 0) {
    return;
  }

  throw new Error(
    `PR5 清理存在残留：行=${JSON.stringify(receipt.residualRowIds)} 文件=${JSON.stringify(receipt.residualFileReferences)}` +
      (receipt.failureMessages.length === 0
        ? ''
        : `；失败原因：${receipt.failureMessages.join('；')}`),
  );
}
