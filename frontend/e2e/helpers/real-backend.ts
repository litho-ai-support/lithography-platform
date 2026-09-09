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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BACKEND_GRAPHQL = 'http://127.0.0.1:3000/graphql';
export const BACKEND_HEALTH = 'http://127.0.0.1:3000/health';

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

export function readBackendEnv(): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of readFileSync(BACKEND_ENV_FILE, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      entries[match[1]] = match[2];
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

export function mysqlQuery(sql: string): string {
  const env = readBackendEnv();

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

/** 按白名单 requestNo 物理删除维修申请行（清理用；对不存在行是 no-op，幂等成立）。 */
export function deleteRepairRequestByRequestNo(requestNo: string): void {
  assertWhitelistedRequestNo(requestNo);
  mysqlQuery(`DELETE FROM repair_request WHERE request_no = '${requestNo}'`);
}

// 参考资料 real spec 自建行标题前缀（与 reference-document-real.spec 创建标题共用）。
// 仅用于创建标题与列表定位断言；清理一律以本次运行记录的精确 ID 为边界，
// 禁止按标题前缀批量删除——固定前缀不是数据身份，共享库中他人数据可能碰巧同前缀，
// 并行运行也可能互删（负责人 0909 阻塞项 1）。
export const REFERENCE_DOCUMENT_E2E_TITLE_PREFIX = 'E2E 参考资料验收行';

// 物理清理安全门：物理 DELETE 只允许发生在「显式 opt-in + 库名属测试库」的配置上。
// 共享开发库（DB_NAME 不含 e2e/test 标记）一律在启动 mysql 进程前拒绝；
// 宁可残留软删行（对列表/详情不可见，由库策略另行清理），也不按前缀物理删除。
const PHYSICAL_CLEANUP_OPT_IN_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';
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
