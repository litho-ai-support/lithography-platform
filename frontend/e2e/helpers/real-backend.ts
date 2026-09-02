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

// 后端生成的申请编号格式：RR + 14 位时间戳 + 6 位加密随机字符（与后端单测断言一致），
// 仅白名单匹配的编号才允许进入 SQL 拼接。
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

// 前端侧真实通道前提：本地 .env.development.local 必须配置 VITE_GRAPHQL_ENDPOINT，
// 否则 dev server 回退相对路径 /graphql，浏览器侧请求到不了本地后端。
export function hasFrontendGraphQLEndpoint(): boolean {
  try {
    return /VITE_GRAPHQL_ENDPOINT\s*=\s*\S+/.test(readFileSync(FRONTEND_LOCAL_ENV_FILE, 'utf-8'));
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
