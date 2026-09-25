// e2e/helpers/real-backend.ts
//
// 真实后端 e2e 的共享工具（自 repair-request-create.spec.ts 提取，供多个 spec 复用）。
// 前提（不满足时用例应走 test.skip 而不是失败）：
// 1. 本地 dev 后端在 127.0.0.1:3000 运行，且启动时 APP_CORS_ORIGINS 运行时覆盖含 http://127.0.0.1:4173；
// 2. backend/env/.env.development 存在（本地文件，不入库）且本机可用 mysql CLI；
// 3. frontend/env/.env.development.local 提供 VITE_GRAPHQL_ENDPOINT，否则前端回退相对路径 /graphql，
//    浏览器侧请求到不了本地后端。
// 真实链路用例产生的数据由用例自行清理或恢复，不污染共享开发库基线。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEDICATED_BACKEND_ORIGIN,
  DEDICATED_E2E_DB_NAME,
  DEDICATED_E2E_PHYSICAL_CLEANUP_ENV,
} from '../../e2e-real/dedicated-e2e-environment';

// 后端源（origin）收口：默认仍指向本地 dev 后端 127.0.0.1:3000（既有真实链路 spec 口径不变）。
// 专用账号设置联调（playwright.account-settings-real.config.ts）经进程级环境变量
// E2E_BACKEND_ORIGIN 指向专用后端（http://127.0.0.1:3100），浏览器 / Node GraphQL helper /
// SQL helper 由此共享同一目标；来源必须是无路径的 http(s) origin，否则在连接前直接失败。
const BACKEND_ORIGIN_PATTERN = /^https?:\/\/[a-z0-9._-]+(:\d+)?$/i;

function resolveBackendOrigin(): string {
  const configured = process.env.E2E_BACKEND_ORIGIN?.trim();

  if (configured === undefined || configured === '') {
    return 'http://127.0.0.1:3000';
  }

  if (!BACKEND_ORIGIN_PATTERN.test(configured)) {
    throw new Error(
      `E2E_BACKEND_ORIGIN 不是合法的无路径 origin，拒绝连接：${JSON.stringify(configured)}`,
    );
  }

  return configured;
}

const BACKEND_ORIGIN = resolveBackendOrigin();

export const BACKEND_GRAPHQL = `${BACKEND_ORIGIN}/graphql`;
export const BACKEND_HEALTH = `${BACKEND_ORIGIN}/health`;
export const BACKEND_REST_UPLOAD = `${BACKEND_ORIGIN}/api/reference-documents/upload`;
export function backendRestDownloadUrl(id: number): string {
  return `${BACKEND_ORIGIN}/api/reference-documents/${id}/download`;
}

const BACKEND_ENV_FILE = fileURLToPath(
  new URL('../../../backend/env/.env.development', import.meta.url),
);
const FRONTEND_LOCAL_ENV_FILE = fileURLToPath(
  new URL('../../env/.env.development.local', import.meta.url),
);
const FRONTEND_VITE_CONFIG_FILE = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

// 后端生成的申请编号格式：RR + 14 位时间戳 + 6 位加密随机字符（与后端单测断言一致），
// 仅白名单匹配的编号才允许进入 SQL 拼接（由受保护 helper 强制，见下方守卫说明）。
export const REQUEST_NO_PATTERN = /^RR\d{14}[A-Z0-9]{6}$/;

// 数据库连接键允许进程级运行时覆盖（仅这 5 个键，其他键仍只读文件值）：
// 真实 E2E 需要在不改写任何 .env 文件的前提下，把 mysqlQuery / 物理清理安全门
// 与应用后端指向同一个独立测试库。空白值不覆盖，避免 `DB_NAME=` 误清空文件值；
// 覆盖后的 DB_NAME 依旧要过 assertPhysicalCleanupAllowed 的显式 opt-in + 测试库命名门。
const DB_CONNECTION_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME'] as const;

export function readBackendEnv(): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of readFileSync(BACKEND_ENV_FILE, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      entries[match[1]] = match[2];
    }
  }

  for (const key of DB_CONNECTION_KEYS) {
    const runtimeValue = process.env[key];

    if (runtimeValue !== undefined && runtimeValue.trim() !== '') {
      entries[key] = runtimeValue;
    }
  }

  return entries;
}

// env 文件缺失或不可读时返回 null，让用例走 skip 分支而不是直接失败（该文件是本地文件，不入库）。
export function readBackendEnvOrNull(): Record<string, string> | null {
  try {
    return readBackendEnv();
  } catch {
    return null;
  }
}

// 前端侧真实通道前提（两种任一成立即可）：
// 1. .env.development.local 配置 VITE_GRAPHQL_ENDPOINT（浏览器直连后端，需后端 CORS 放行）；
// 2. vite dev server 配置了 '/graphql' 同源转发（默认转发到 http://127.0.0.1:3000，
//    无跨域，端口映射域名亦可用，当前为本机默认模式）。
// 两者都不成立时浏览器侧请求落到相对路径 /graphql 且无转发，到不了后端。
// 两个通道必须独立探测：可选的本地 env 文件缺失只表示直连通道不存在，
// 不能短路 proxy 通道的判断（负责人 0909 修复要求；否则全新 clone 的
// 默认环境里真实后端用例会被错误跳过，报告绿但没有执行真实链路）。
export function hasFrontendGraphQLEndpoint(): boolean {
  try {
    if (/VITE_GRAPHQL_ENDPOINT\s*=\s*\S+/.test(readFileSync(FRONTEND_LOCAL_ENV_FILE, 'utf-8'))) {
      return true;
    }
  } catch {
    // 直连通道不存在（本地文件可缺失），继续探测 proxy 通道
  }

  try {
    // 同源转发通道：vite.config.ts 含 '/graphql' 键的 proxy 配置即视为可用
    return /['"]\/graphql['"]\s*:/.test(readFileSync(FRONTEND_VITE_CONFIG_FILE, 'utf-8'));
  } catch {
    return false;
  }
}

// 专用真实链路同一性检查（R4 复核修正轮 P2）：当 E2E_BACKEND_ORIGIN 指向专用后端时，
// SQL helper 的 DB_NAME 必须等于专用库，杜绝「浏览器/Node GraphQL 打到专用后端，
// SQL 清理却连接其他库」的错位。普通真实链路（默认 127.0.0.1:3000）不受影响。
function assertDedicatedLinkDatabaseConsistency(env: Record<string, string>): void {
  if (BACKEND_ORIGIN !== DEDICATED_BACKEND_ORIGIN) {
    return;
  }

  if (env.DB_NAME !== DEDICATED_E2E_DB_NAME) {
    throw new Error(
      `专用真实链路配置不一致：E2E_BACKEND_ORIGIN 指向专用后端，但 SQL helper DB_NAME=${JSON.stringify(env.DB_NAME)} ≠ ${JSON.stringify(DEDICATED_E2E_DB_NAME)}，拒绝访问数据库`,
    );
  }
}

export function mysqlQuery(sql: string): string {
  const env = readBackendEnv();
  assertDedicatedLinkDatabaseConsistency(env);

  return execFileSync(
    'mysql',
    ['-h', env.DB_HOST, '-P', env.DB_PORT, `-u${env.DB_USER}`, env.DB_NAME, '-N', '-B', '-e', sql],
    // 密码经 MYSQL_PWD 注入（不出现在进程参数列表），并抑制 stderr，
    // 避免 mysql CLI 的密码告警污染测试输出。
    {
      encoding: 'utf-8',
      env: { ...process.env, MYSQL_PWD: env.DB_PASS },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  ).trim();
}

// requestNo 白名单守卫：expect 断言不是安全边界，页面文本异常时断言抛错后 finally
// 仍会拿同一字符串执行 SQL。因此任何 requestNo 进入 SQL 前都必须在 helper 内部、
// 访问数据库之前强制校验；失败直接抛错且绝不启动 mysql 进程（含 finally 兜底路径）。
function assertWhitelistedRequestNo(requestNo: string): void {
  if (!REQUEST_NO_PATTERN.test(requestNo)) {
    throw new Error(`requestNo 未通过白名单校验，拒绝访问数据库：${JSON.stringify(requestNo)}`);
  }
}

/**
 * 按白名单 requestNo 查询维修申请行。
 * selectExpression 必须是代码内静态字面量（如 'id'、'COUNT(*)'），不得拼接外部输入。
 */
export function findRepairRequestByRequestNo(requestNo: string, selectExpression: string): string {
  assertWhitelistedRequestNo(requestNo);

  return mysqlQuery(
    `SELECT ${selectExpression} FROM repair_request WHERE request_no = '${requestNo}'`,
  );
}

// 参考资料 real spec 自建行标题前缀（与 reference-document-real.spec 创建标题共用）。
// 仅用于创建标题与列表定位断言；清理一律以本次运行记录的精确 ID 为边界，
// 禁止按标题前缀批量删除——固定前缀不是数据身份，共享库中他人数据可能碰巧同前缀，
// 并行运行也可能互删（负责人 0909 阻塞项 1）。
export const REFERENCE_DOCUMENT_E2E_TITLE_PREFIX = 'E2E 参考资料验收行';

// 服务端生成的存储引用格式（与 backend local-storage 实现同口径白名单）：
// 32 位小写 hex + 白名单扩展名，天然无路径语义；任何白名单外的引用都拒绝清理。
const STORAGE_REFERENCE_PATTERN = /^[0-9a-f]{32}\.[a-z0-9]{1,8}$/;

// 物理清理安全门：物理 DELETE 只允许发生在「显式 opt-in + 库名属测试库」的配置上。
// 共享开发库（DB_NAME 不含 e2e/test 标记）一律在启动 mysql 进程前拒绝；
// 宁可残留软删行（对列表/详情不可见，由库策略另行清理），也不按前缀物理删除。
// 授权变量与专用 E2E 配置模块共用同一常量，杜绝两套口径各自漂移。
export const PHYSICAL_CLEANUP_OPT_IN_ENV = DEDICATED_E2E_PHYSICAL_CLEANUP_ENV;
const TEST_DATABASE_NAME_PATTERN = /(^|[_-])(e2e|test)([_-]|\d|$)/i;

export function assertPhysicalCleanupAllowed(env: Record<string, string>): void {
  if (process.env[PHYSICAL_CLEANUP_OPT_IN_ENV] !== '1') {
    throw new Error(
      `物理清理被拒绝：缺少 ${PHYSICAL_CLEANUP_OPT_IN_ENV}=1 显式 opt-in，共享开发库禁止物理删除`,
    );
  }

  const dbName = env.DB_NAME ?? '';

  if (!TEST_DATABASE_NAME_PATTERN.test(dbName)) {
    throw new Error(
      `物理清理被拒绝：DB_NAME=${JSON.stringify(dbName)} 不属于测试库命名（需含 e2e/test 段），拒绝物理删除`,
    );
  }
}

/**
 * 物理清理是否可用于当前环境：目标库严格为专用隔离库 lithography_e2e 且执行者显式授权。
 * 调用方据此决定是否进入物理清理分支（共享开发库只走软删边界）；
 * 受保护 helper 仍会在访问数据库前独立复查，不依赖调用方或全局 setup 已经检查过。
 */
export function isPhysicalCleanupEnabled(env: Record<string, string>): boolean {
  return env.DB_NAME === DEDICATED_E2E_DB_NAME && process.env[PHYSICAL_CLEANUP_OPT_IN_ENV] === '1';
}

/**
 * 按本次运行记录的精确 ID 物理清理参考资料行（负责人 0909 修复要求）。
 *
 * - ID 列表为空时 no-op，不启动 mysql 进程；
 * - 每个 ID 必须是安全正整数（白名单校验先于任何 SQL 组装）；
 * - SQL 仅包含传入的精确 ID（IN 列表），绝不按标题前缀批量匹配；
 * - 安全门不通过时抛错，mysql 进程绝不启动（含 finally 兜底路径）。
 */
export function deleteE2EReferenceDocumentRowsByIds(ids: readonly number[]): void {
  if (ids.length === 0) {
    return;
  }

  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`物理清理目标 ID 未通过正整数校验，拒绝执行：${JSON.stringify(id)}`);
    }
  }

  assertPhysicalCleanupAllowed(readBackendEnv());

  mysqlQuery(`DELETE FROM reference_document WHERE id IN (${ids.join(',')})`);
}

// ---- 维修申请物理清理：统一安全入口（负责人最小修复计划 P1/P2） ----

/**
 * 物理清理目标：ID 必须是本次运行记录的精确 ID，expected 必须是本轮测试自身掌握的预期事实
 * （申请编号 / 客户账号 / 故障码 / 可选设备型号）——不接受「从目标行反读回来的值」充当预期，
 * 否则核验退化为自证。四处事实全部命中，该 ID 才允许进入删除语句。
 */
export interface RepairRequestCleanupTarget {
  readonly id: number;
  readonly expected: {
    readonly requestNo: string;
    readonly customerAccountId: number;
    readonly errorCode: string;
    readonly equipmentModelId?: number;
  };
}

// 故障码进 SQL 前必须命中白名单（列宽 varchar(100)，白名单只含无引号、无反斜杠的字符）；
// 白名单外的值直接抛错，绝不转义拼接；申请编号沿用 REQUEST_NO_PATTERN 同口径。
const CLEANUP_ERROR_CODE_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

// 事务内守卫表与约束名（脚本中 CREATE TEMPORARY TABLE，会话级，断开即消失，不触碰持久结构）。
// MySQL 8.0.16+ 真实强制 CHECK 约束（本项目 baseline Migration 亦依赖 CHECK）：
// 违例即 ERROR 3819 中止批处理，未 COMMIT 的事务随连接中止回滚（本机实测确认）。
const CLEANUP_GUARD_TABLE = 'e2e_repair_request_cleanup_guard';

/**
 * 严格库名门（在 assertPhysicalCleanupAllowed 的「测试库命名」之上再收紧一道）：
 * 维修申请物理清理只允许发生在专用隔离库 lithography_e2e。默认连共享开发库
 * （lithography_drill）时失败关闭、不执行删除，也不降级成在别的库上删除。
 */
function assertDedicatedRepairRequestCleanupDatabase(env: Record<string, string>): void {
  if (env.DB_NAME !== DEDICATED_E2E_DB_NAME) {
    throw new Error(
      `维修申请物理清理被拒绝：DB_NAME=${JSON.stringify(env.DB_NAME)} 不是专用隔离库 ${JSON.stringify(DEDICATED_E2E_DB_NAME)}，失败关闭，不执行删除`,
    );
  }
}

function assertRepairRequestCleanupTargets(targets: readonly RepairRequestCleanupTarget[]): void {
  const seenIds = new Set<number>();

  for (const { id, expected } of targets) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`物理清理目标 ID 未通过正整数校验，拒绝执行：${JSON.stringify(id)}`);
    }

    if (seenIds.has(id)) {
      throw new Error(`物理清理目标 ID 重复，拒绝执行：${id}`);
    }

    seenIds.add(id);

    if (!REQUEST_NO_PATTERN.test(expected.requestNo)) {
      throw new Error(
        `物理清理预期申请编号未通过白名单校验，拒绝访问数据库：${JSON.stringify(expected.requestNo)}`,
      );
    }

    if (!Number.isSafeInteger(expected.customerAccountId) || expected.customerAccountId <= 0) {
      throw new Error(
        `物理清理预期客户账号未通过正整数校验，拒绝执行：${JSON.stringify(expected.customerAccountId)}`,
      );
    }

    if (!CLEANUP_ERROR_CODE_PATTERN.test(expected.errorCode)) {
      throw new Error(
        `物理清理预期故障码未通过白名单校验，拒绝访问数据库：${JSON.stringify(expected.errorCode)}`,
      );
    }

    if (
      expected.equipmentModelId !== undefined &&
      (!Number.isSafeInteger(expected.equipmentModelId) || expected.equipmentModelId <= 0)
    ) {
      throw new Error(
        `物理清理预期设备型号未通过正整数校验，拒绝执行：${JSON.stringify(expected.equipmentModelId)}`,
      );
    }
  }
}

/**
 * 组装「同一连接、同一事务」的核验 + 删除脚本（本机实测结论）：
 * - 单次 mysql -e 多语句即同一连接，可 START TRANSACTION ... COMMIT；
 * - 守卫表 CHECK 违例让 CLI 在违例语句处中止（exit≠0），事务未 COMMIT 即回滚；
 * - CLI 已产出的 stdout（锁定行快照 + 诊断行）保留在错误的 stdout 中，作为失败诊断。
 */
function buildRepairRequestCleanupSql(targets: readonly RepairRequestCleanupTarget[]): string {
  const idList = targets.map(({ id }) => id).join(',');
  const idPredicate = `id IN (${idList})`;
  // 逐 ID 预期事实：每个 ID 绑定自己的编号/客户/故障码，设备型号按需参与
  const expectedFacts = targets
    .map(({ id, expected }) => {
      const modelFact =
        expected.equipmentModelId === undefined
          ? ''
          : ` AND equipment_model_id = ${expected.equipmentModelId}`;

      return `(id = ${id} AND request_no = '${expected.requestNo}' AND customer_account_id = ${expected.customerAccountId} AND error_code = '${expected.errorCode}'${modelFact})`;
    })
    .join(' OR ');
  const existingRows = `(SELECT COUNT(*) FROM repair_request WHERE ${idPredicate})`;
  const fieldMismatchRows = `(SELECT COUNT(*) FROM repair_request WHERE ${idPredicate} AND NOT (${expectedFacts}))`;
  // 会阻碍删除的外部引用：三张子表均以 ON DELETE RESTRICT 指向 repair_request，
  // 存在子记录时整批中止并交人工核对，绝不级联清理。
  const childRows = [
    `(SELECT COUNT(*) FROM engineer_response WHERE request_id IN (${idList}))`,
    `(SELECT COUNT(*) FROM ai_conversation WHERE request_id IN (${idList}))`,
    `(SELECT COUNT(*) FROM ai_report WHERE request_id IN (${idList}))`,
  ].join(' + ');
  const guardViolations = [
    `(DATABASE() <> '${DEDICATED_E2E_DB_NAME}')`,
    `(${targets.length} - ${existingRows})`,
    fieldMismatchRows,
    childRows,
  ].join(' + ');

  return [
    'START TRANSACTION',
    `CREATE TEMPORARY TABLE ${CLEANUP_GUARD_TABLE} (violations INT NOT NULL, CONSTRAINT e2e_repair_request_cleanup_must_be_zero CHECK (violations = 0))`,
    `SELECT id, request_no, customer_account_id, equipment_model_id, error_code FROM repair_request WHERE ${idPredicate} ORDER BY id FOR UPDATE`,
    `SELECT CONCAT('database=', DATABASE(), ' expected_rows=${targets.length}', ' existing_rows=', ${existingRows}, ' field_mismatch_rows=', ${fieldMismatchRows}, ' child_rows=', ${childRows})`,
    `INSERT INTO ${CLEANUP_GUARD_TABLE} (violations) SELECT ${guardViolations}`,
    `DELETE FROM repair_request WHERE ${idPredicate}`,
    `SELECT CONCAT('residue_rows=', ${existingRows})`,
    `INSERT INTO ${CLEANUP_GUARD_TABLE} (violations) SELECT ${existingRows}`,
    'COMMIT',
  ].join(';\n');
}

/**
 * 执行清理脚本（单次 mysql 进程 = 同一连接）。失败时抛出携带诊断的错误：
 * 密码只经 MYSQL_PWD 注入，既不在进程参数也不在诊断文本中；
 * 原始错误整条作 cause 会把完整 SQL 与 CLI 输出复制进异常链，故以副本作 cause。
 */
function runRepairRequestCleanupSql(env: Record<string, string>, sql: string): string {
  try {
    return execFileSync(
      'mysql',
      [
        '-h',
        env.DB_HOST,
        '-P',
        env.DB_PORT,
        `-u${env.DB_USER}`,
        env.DB_NAME,
        '-N',
        '-B',
        '-e',
        sql,
      ],
      {
        encoding: 'utf-8',
        env: { ...process.env, MYSQL_PWD: env.DB_PASS },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    const stderrLine = (failure.stderr ?? '').trim().split('\n')[0] ?? '';
    const diagnostics = (failure.stdout ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('='))
      .join(' | ');
    const message =
      `维修申请物理清理事务中止（已回滚，未执行删除）：${stderrLine === '' ? '未知错误' : stderrLine}` +
      (diagnostics === '' ? '' : `；核验诊断：${diagnostics}`);

    throw new Error(message, {
      // eslint-disable-next-line preserve-caught-error -- 原始错误含完整 SQL 与 CLI 输出，一律以副本作为 cause
      cause: new Error(message),
    });
  }
}

/**
 * 独立复查 CLI 回读的核验诊断（防御「CHECK 约束在旧版本 MySQL 上被静默忽略」的情形，
 * 也避免把「拿不到或读不懂诊断」当成清理成功）：库名 / 期望行数 / 实际行数 / 字段不符 /
 * 子记录 / 残留任一不达标即抛错。
 */
function assertRepairRequestCleanupDiagnostics(output: string, expectedRows: number): void {
  const diagnostics: Record<string, string> = {};

  for (const match of output.matchAll(/([a-z_]+)=(\S+)/g)) {
    diagnostics[match[1]] = match[2];
  }

  const expectedDiagnostics: Array<[string, string]> = [
    ['database', DEDICATED_E2E_DB_NAME],
    ['expected_rows', String(expectedRows)],
    ['existing_rows', String(expectedRows)],
    ['field_mismatch_rows', '0'],
    ['child_rows', '0'],
    ['residue_rows', '0'],
  ];
  const mismatched = expectedDiagnostics.filter(([key, value]) => diagnostics[key] !== value);

  if (mismatched.length > 0) {
    throw new Error(
      `维修申请物理清理核验失败：${mismatched
        .map(
          ([key, value]) => `${key} 期望 ${value} 实际 ${JSON.stringify(diagnostics[key] ?? null)}`,
        )
        .join('；')}`,
    );
  }
}

/**
 * 按本次运行记录的精确 ID 物理清理维修申请行（统一安全入口，创建 / 管理 / 分页夹具共用）。
 *
 * 安全性质（负责人最小修复计划 P1/P2）：
 * - 入口内独立执行「显式授权门 + 测试库命名门 + 严格 lithography_e2e 库名门」，
 *   任一门不通过即抛错且 mysql 进程绝不启动（不依赖调用方或全局 setup 已经检查过）；
 * - 目标 ID 与预期事实先过 Node 侧白名单（编号 / 客户账号 / 故障码 / 设备型号），
 *   先于任何 SQL 组装；不再有「仅凭编号格式直接 DELETE」的路径，也不按前缀/行数/猜测 ID 匹配；
 * - 同一连接、同一事务内完成：库名核验 → FOR UPDATE 锁定并读取目标行 → 逐项核对预期字段、
 *   客户账号、设备型号 → 核对子记录引用 → 全部门通过才 DELETE → 提交前残留核验为 0 → COMMIT；
 *   任一门不通过即中止回滚（删除作废）并让用例转红。
 * - ID 列表为空时 no-op，不启动 mysql 进程。
 */
export function deleteRepairRequestRowsByIds(targets: readonly RepairRequestCleanupTarget[]): void {
  if (targets.length === 0) {
    return;
  }

  assertRepairRequestCleanupTargets(targets);

  const env = readBackendEnv();

  assertPhysicalCleanupAllowed(env);
  assertDedicatedRepairRequestCleanupDatabase(env);

  const output = runRepairRequestCleanupSql(env, buildRepairRequestCleanupSql(targets));

  assertRepairRequestCleanupDiagnostics(output, targets.length);
}

/** 客户软删自己的未接单申请（幂等成功）——真实链路用例的统一清理通道（可逆，先于物理清理） */
const DELETE_MY_REPAIR_REQUEST_MUTATION = `
  mutation DeleteMyRepairRequestForCleanup($id: Int!) {
    deleteMyRepairRequest(id: $id) { id requestNo }
  }
`;

/**
 * 真实链路维修申请用例的统一清理入口（创建 / 管理两个 spec 共用，替代旧
 * deleteRepairRequestByRequestNo 的「仅凭编号格式直接 DELETE」路径）：
 * 1. 编号先过白名单（非法编号在任何数据库访问前被拒绝）；
 * 2. 按编号解析本次自建行的精确 ID（行已不存在则 no-op，幂等成立）；
 * 3. 经产品自身通道软删（可逆）：共享开发库与专用隔离库都执行，保持基线可见面干净；
 * 4. 仅当环境为专用隔离库 lithography_e2e 且执行者显式授权时，再按「精确 ID + 本轮预期事实」
 *    走受保护物理清理（同一连接同一事务核验后删除，残留非零即失败）；
 *    共享开发库保持既有软删边界，不做物理删除。
 * 任一环节失败即抛错：清理失败必须是可观测的失败，而不是静默残留。
 */
export async function cleanupE2ERepairRequest(options: {
  env: Record<string, string>;
  requestNo: string;
  customerAccountId: number;
  errorCode: string;
  customerLoginName?: string;
}): Promise<void> {
  assertWhitelistedRequestNo(options.requestNo);

  const id = findRepairRequestByRequestNo(options.requestNo, 'id');

  if (id === '') {
    return;
  }

  const numericId = Number(id);

  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error(`自建维修申请 ID 解析失败，拒绝清理：${JSON.stringify(id)}`);
  }

  const { body } = await realGraphqlCall(
    options.env,
    DELETE_MY_REPAIR_REQUEST_MUTATION,
    { id: numericId },
    options.customerLoginName ?? 'mock_customer_alpha',
  );

  if ((body as { errors?: unknown[] }).errors !== undefined) {
    throw new Error(`自建维修申请 ${options.requestNo} 软删失败，拒绝声称清理完成`);
  }

  if (!isPhysicalCleanupEnabled(options.env)) {
    return;
  }

  deleteRepairRequestRowsByIds([
    {
      id: numericId,
      expected: {
        requestNo: options.requestNo,
        customerAccountId: options.customerAccountId,
        errorCode: options.errorCode,
      },
    },
  ]);
}

// ---- 文件上传 / 下载 REST 链路（0909 第二轮阻塞项 1 的 e2e 支撑） ----

/** 以指定账号真实登录换取 accessToken（Node 侧 REST 调用复用 realLogin 收口） */
async function realAccessTokenOrThrow(
  env: Record<string, string>,
  loginName: string,
): Promise<string> {
  const { accessToken } = await realLogin(env, loginName);

  return accessToken;
}

/**
 * Node 侧真实 multipart 上传（绕过 UI 直接打 REST 边界，用于权限/错误分支断言；
 * UI 主链路走 setInputFiles 走浏览器真实通道）。返回完整响应体（统一信封）。
 */
export async function realRestUpload(
  env: Record<string, string>,
  file: { name: string; contentType: string; bytes: Uint8Array },
  fields: Record<string, string>,
  loginName = 'mock_super_admin',
): Promise<{ status: number; body: unknown }> {
  const accessToken = await realAccessTokenOrThrow(env, loginName);
  const formData = new FormData();

  formData.append(
    'file',
    new Blob([file.bytes as BlobPart], { type: file.contentType }),
    file.name,
  );
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  const response = await fetch(BACKEND_REST_UPLOAD, {
    body: formData,
    headers: { Authorization: `Bearer ${accessToken}` },
    method: 'POST',
  });

  return { status: response.status, body: await response.json().catch(() => null) };
}

/**
 * Node 侧真实流式下载（断言 Content-Type / Content-Disposition / 字节内容）。
 * 返回 buffer 而非 text：下载对象是二进制文件。
 */
export async function realRestDownload(
  env: Record<string, string>,
  id: number,
  loginName = 'mock_super_admin',
): Promise<{
  status: number;
  contentType: string | null;
  contentDisposition: string | null;
  buffer: ArrayBuffer;
  body: unknown;
}> {
  const accessToken = await realAccessTokenOrThrow(env, loginName);
  const response = await fetch(backendRestDownloadUrl(id), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const contentType = response.headers.get('content-type');
  const contentDisposition = response.headers.get('content-disposition');

  if (!response.ok) {
    return {
      status: response.status,
      contentType,
      contentDisposition,
      buffer: new ArrayBuffer(0),
      body: await response.json().catch(() => null),
    };
  }

  return {
    status: response.status,
    contentType,
    contentDisposition,
    buffer: await response.arrayBuffer(),
    body: null,
  };
}

/** 按精确 ID 读取存储引用（SELECT 只读，不涉及清理安全门；无引用/无行返回 null） */
export function findReferenceDocumentStorageReferenceById(id: number): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`存储引用查询目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
  }

  const value = mysqlQuery(
    `SELECT IFNULL(storage_reference, '') FROM reference_document WHERE id = ${id}`,
  );

  return value.length > 0 ? value : null;
}

/**
 * 按本次运行上传产生的精确 ID 清理存储物理文件（0909 计划要求：按精确引用路径，不扫描批量删）。
 * 引用必须命中服务端生成格式白名单，且解析后必须落在存储目录内，否则拒绝删除。
 */
export function deleteE2EReferenceDocumentStorageFilesByIds(ids: readonly number[]): void {
  if (ids.length === 0) {
    return;
  }

  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`存储文件清理目标 ID 未通过正整数校验：${JSON.stringify(id)}`);
    }
  }

  const env = readBackendEnv();
  const storageDir = path.resolve(
    fileURLToPath(new URL('../../../backend', import.meta.url)),
    env.REFERENCE_DOCUMENT_STORAGE_DIR || 'var/reference-documents',
  );

  for (const id of ids) {
    const reference = findReferenceDocumentStorageReferenceById(id);

    if (reference === null || !STORAGE_REFERENCE_PATTERN.test(reference)) {
      continue;
    }

    const filePath = path.resolve(storageDir, reference);

    // 双保险：断言解析后的精确路径仍在存储目录内（与后端 resolve 防御同口径）
    if (!filePath.startsWith(`${storageDir}${path.sep}`)) {
      throw new Error(`存储文件路径越界，拒绝删除：${JSON.stringify(filePath)}`);
    }

    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }
}

// 可用性探针：健康检查 + 用真实 Mock 账号登录（同时验证后端已种子且登录链路可用）。
// CORS 不在 Node 侧预检（fetch 不允许设置 Origin 等受限头），留给浏览器用例自身暴露。
export async function isRealBackendAvailable(env: Record<string, string>): Promise<boolean> {
  try {
    const health = await fetch(BACKEND_HEALTH);

    if (!health.ok) {
      return false;
    }

    await realLoginAccountId(env);

    return true;
  } catch {
    return false;
  }
}

// 真实登录（单一实现）：以真实 Mock 账号换取 accessToken 与 accountId。
// 所有需要登录态的 Node 侧调用都经此收口，登录契约变化只改这一处。
async function realLogin(
  env: Record<string, string>,
  loginName: string,
): Promise<{ accessToken: string; accountId: number }> {
  const response = await fetch(BACKEND_GRAPHQL, {
    body: JSON.stringify({
      query:
        'mutation LoginWithPassword($input: AuthLoginInput!) { login(input: $input) { accessToken accountId role } }',
      variables: {
        input: {
          audience: 'SSTSWEB',
          loginName,
          loginPassword: env.MOCK_SEED_PASSWORD,
          type: 'PASSWORD',
        },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  const body = (await response.json()) as {
    data?: { login?: { accountId: number; accessToken?: string } };
  };

  if (!body.data?.login?.accessToken) {
    throw new Error('real login failed in e2e setup');
  }

  return { accessToken: body.data.login.accessToken, accountId: body.data.login.accountId };
}

// 真实登录拿账号 ID：落库断言以真实后端返回的 accountId 为准，不硬编码种子 ID。
// loginName 缺省用客户甲（mock_customer_alpha）；密码统一取种子口令 env。
export async function realLoginAccountId(
  env: Record<string, string>,
  loginName = 'mock_customer_alpha',
): Promise<number> {
  const { accountId } = await realLogin(env, loginName);

  return accountId;
}

/** 以真实账号身份调用受保护 GraphQL（Node 侧，用于 API 级断言），返回完整响应体。 */
export async function realGraphqlCall(
  env: Record<string, string>,
  query: string,
  variables: Record<string, unknown>,
  loginName = 'mock_customer_alpha',
): Promise<{ status: number; body: unknown }> {
  const { accessToken } = await realLogin(env, loginName);

  const response = await fetch(BACKEND_GRAPHQL, {
    body: JSON.stringify({ query, variables }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return { status: response.status, body: await response.json() };
}
