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

export interface Pr5RepairRequestBinding {
  /** 数据库生成的维修申请主键 */
  readonly id: number;
  readonly requestNo: string;
  readonly customerAccountId: number;
  /** 本轮为该申请创建的工程师回复 ID（清理时按此集合精确绑定子行，不扩大删除外部回复） */
  readonly responseIds: readonly number[];
}

/**
 * 归属核验后物理删除本轮自建维修申请（含其本轮工程师回复）。
 *
 * 事务内顺序：父行三因子绑定唯一断言 → 子行集合精确断言（实际回复集合必须与本轮
 * responseIds 完全一致，多一条外部回复即失败关闭）→ 按 request_id + id IN (...) 精确删子行
 * → 再按同一三因子删主行 → 残留核对为 0。任一绑定断言失败会让 MySQL 客户端在 DELETE
 * 之前报错退出，事务自动回滚（连接关闭触发回滚）。
 */
export function deletePr5RepairRequestBound(binding: Pr5RepairRequestBinding): void {
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

  assertPhysicalCleanupAllowed(readBackendEnv());

  const where = `id = ${id} AND request_no = '${requestNo}' AND customer_account_id = ${customerAccountId}`;
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

  const { id, createdByAccountId, titleKeyword } = binding;
  const where = `id = ${id} AND created_by_account_id = ${createdByAccountId} AND title LIKE '%${titleKeyword}%'`;

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

  const { id, createdByAccountId, titleKeyword } = binding;

  assertPhysicalCleanupAllowed(readBackendEnv());

  const where = `id = ${id} AND created_by_account_id = ${createdByAccountId} AND title LIKE '%${titleKeyword}%'`;

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
