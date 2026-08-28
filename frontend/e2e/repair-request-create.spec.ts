// e2e/repair-request-create.spec.ts

import { expect, type Page, type Route, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readStoredAuthSession, seedAuthSession } from './helpers/auth-session-seed';

const CREATE_PAGE_PATH = '/customer/repair-requests/new';
const LIST_PAGE_PATH = '/customer/repair-requests';

type GraphQLOperationPayload = {
  query?: string;
};

function fulfillModelsSuccess(route: Route) {
  return route.fulfill({
    body: JSON.stringify({
      data: {
        equipmentModels: [
          { id: 900301, modelCode: 'LS-100', modelName: '光刻机 A' },
          { id: 900302, modelCode: 'LS-200', modelName: '光刻机 B' },
        ],
      },
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillUnauthenticated(route: Route) {
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: { code: 'UNAUTHENTICATED' },
          message: 'internal auth detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

// 按操作名分派：型号查询放行，创建 Mutation 按测试预期处理。
async function routeGraphQL(page: Page, onCreate: (route: Route) => Promise<void>) {
  let createCount = 0;

  await page.route('**/graphql', async (route) => {
    const payload = route.request().postDataJSON() as GraphQLOperationPayload;

    if (payload.query?.includes('mutation CreateRepairRequest')) {
      createCount += 1;
      await onCreate(route);
      return;
    }

    if (payload.query?.includes('query EquipmentModels')) {
      await fulfillModelsSuccess(route);
      return;
    }

    await route.fulfill({ status: 500 });
  });

  return () => createCount;
}

async function fillAndSubmitForm(page: Page) {
  await page.getByRole('combobox').click();
  await page.getByText('光刻机 A（LS-100）').click();
  await page.getByLabel('设备错误码').fill('E-2001');
  await page.getByLabel('故障描述').fill('曝光对准异常，需现场检修');
  await page.getByRole('button', { name: '提交申请' }).click();
}

test('anonymous visit is redirected to login with returnTo', async ({ page }) => {
  await page.goto(CREATE_PAGE_PATH);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Frepair-requests%2Fnew$/);
});

test('engineer visit is redirected to the role home, not 403', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await page.goto(CREATE_PAGE_PATH);
  await expect(page).toHaveURL(/\/engineer$/);
});

test('super admin inherits customer route access and sees the form', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  await page.route('**/graphql', (route) => fulfillModelsSuccess(route));

  await page.goto(CREATE_PAGE_PATH);
  await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
  await expect(page.getByText('创建维修申请').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
});

test('super admin submission is rejected without clearing the session', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  const getCreateCount = await routeGraphQL(page, (route) =>
    route.fulfill({
      body: JSON.stringify({
        errors: [
          {
            // 与后端权限拒绝契约对齐：PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS → FORBIDDEN
            extensions: {
              code: 'FORBIDDEN',
              errorCode: 'INSUFFICIENT_PERMISSIONS',
              errorMessage: 'internal permission detail',
            },
            message: 'internal detail',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    }),
  );

  await page.goto(CREATE_PAGE_PATH);
  await fillAndSubmitForm(page);

  // 权限拒绝不归入业务拒绝：展示共享错误模型的兜底文案而非后端 errorMessage，
  // 不泄漏内部细节；会话不清除（FORBIDDEN 不触发 auth 失效链路）
  await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
  await expect(page.getByText('请求处理失败，请稍后重试。')).toBeVisible();
  await expect(page.getByText('internal permission detail')).toHaveCount(0);
  await expect(page.getByLabel('设备错误码')).toHaveValue('E-2001');
  expect(getCreateCount()).toBe(1);
  expect(await readStoredAuthSession(page)).not.toBeNull();
});

test('expired token on page load clears the session and returns to login once', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');

  let modelsRequests = 0;
  await page.route('**/graphql', async (route) => {
    modelsRequests += 1;
    await fulfillUnauthenticated(route);
  });

  await page.goto(CREATE_PAGE_PATH);
  await expect(page).toHaveURL(/\/login$/);
  // 一次失效周期只允许一次清理与一次跳转：请求不循环
  expect(modelsRequests).toBe(1);
  expect(await readStoredAuthSession(page)).toBeNull();
});

test('expired token on submit clears the session and returns to login without retry loop', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');
  const getCreateCount = await routeGraphQL(page, fulfillUnauthenticated);

  await page.goto(CREATE_PAGE_PATH);
  await fillAndSubmitForm(page);

  await expect(page).toHaveURL(/\/login$/);
  expect(getCreateCount()).toBe(1);
  expect(await readStoredAuthSession(page)).toBeNull();
});

test('business rejection keeps the form and shows the backend message', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');
  const getCreateCount = await routeGraphQL(page, (route) =>
    route.fulfill({
      body: JSON.stringify({
        errors: [
          {
            // 与后端真实 DomainError 输出对齐：码值见 domain-error.ts，文案见 create-repair-request.usecase.ts
            extensions: {
              code: 'NOT_FOUND',
              errorCode: 'REPAIR_REQUEST_EQUIPMENT_MODEL_NOT_FOUND',
              errorMessage: '设备型号不存在',
            },
            message: 'internal detail',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    }),
  );

  await page.goto(CREATE_PAGE_PATH);
  await fillAndSubmitForm(page);

  await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
  await expect(page.getByText('设备型号不存在')).toBeVisible();
  // 业务拒绝保留表单内容，便于修改后重试
  await expect(page.getByLabel('设备错误码')).toHaveValue('E-2001');
  expect(getCreateCount()).toBe(1);
});

test('client-side validation blocks empty submit without any request', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');

  let graphqlRequests = 0;
  await page.route('**/graphql', async (route) => {
    graphqlRequests += 1;
    await fulfillModelsSuccess(route);
  });

  await page.goto(CREATE_PAGE_PATH);
  await page.getByRole('button', { name: '提交申请' }).click();

  // 限定校验提示容器：避免与 Select 占位符同文案歧义（strict mode）
  await expect(
    page.locator('.ant-form-item-explain-error', { hasText: '请选择设备型号' }),
  ).toBeVisible();
  await expect(page.getByText('请输入设备错误码')).toBeVisible();
  await expect(page.getByText('请输入故障描述')).toBeVisible();
  // 仅初始型号查询一次，校验拦截不产生 Mutation
  expect(graphqlRequests).toBe(1);
});

test('double click sends exactly one mutation and shows the result', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');

  let releaseCreate: () => void = () => {};
  const createPending = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });

  const getCreateCount = await routeGraphQL(page, async (route) => {
    await createPending;
    await route.fulfill({
      body: JSON.stringify({
        data: {
          createRepairRequest: {
            createdAt: '2026-08-28T00:00:00.000Z',
            equipmentModelId: 900301,
            errorCode: 'E-2001',
            faultDescription: '曝光对准异常，需现场检修',
            id: 900401,
            isAccepted: false,
            requestNo: 'RR-2026-0001',
          },
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto(CREATE_PAGE_PATH);
  await page.getByRole('combobox').click();
  await page.getByText('光刻机 A（LS-100）').click();
  await page.getByLabel('设备错误码').fill('E-2001');
  await page.getByLabel('故障描述').fill('曝光对准异常，需现场检修');

  const submitButton = page.getByRole('button', { name: '提交申请' });
  await submitButton.click();
  await submitButton.click();

  releaseCreate();

  await expect(page.getByText('维修申请创建成功')).toBeVisible();
  await expect(page.getByText('申请编号：RR-2026-0001')).toBeVisible();
  expect(getCreateCount()).toBe(1);

  // 成功态跳转占位列表页（M-07 ③ 批复的真实落点）
  await page.getByRole('button', { name: '查看申请列表' }).click();
  await expect(page).toHaveURL(/\/customer\/repair-requests$/);
  await expect(page.getByText('列表功能正在建设中')).toBeVisible();
});

// ---------- 列表路由访问控制与占位内容 ----------

test('anonymous list visit is redirected to login with returnTo', async ({ page }) => {
  await page.goto(LIST_PAGE_PATH);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Frepair-requests$/);
});

test('engineer list visit is redirected to the role home, not 403', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await page.goto(LIST_PAGE_PATH);
  await expect(page).toHaveURL(/\/engineer$/);
});

test('customer sees the placeholder list on direct visit', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');
  await page.goto(LIST_PAGE_PATH);
  await expect(page).toHaveURL(new RegExp(LIST_PAGE_PATH));
  await expect(page.getByText('维修申请列表').first()).toBeVisible();
  await expect(page.getByText('列表功能正在建设中').first()).toBeVisible();
});

// ---------- 提交期 transport 失败（区别于业务拒绝与 UNAUTHENTICATED 的第三条错误路径） ----------

test('transport failure on submit keeps the form and must not clear the session', async ({
  page,
}) => {
  await seedAuthSession(page, 'CUSTOMER');
  // abort 模拟网络中断：映射为 network 类型错误，不是会话失效
  const getCreateCount = await routeGraphQL(page, (route) => route.abort('failed'));

  await page.goto(CREATE_PAGE_PATH);
  await fillAndSubmitForm(page);

  await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
  await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();
  // 与业务拒绝一致：保留表单内容便于重试；且只发了一次，无自动重试
  await expect(page.getByLabel('设备错误码')).toHaveValue('E-2001');
  expect(getCreateCount()).toBe(1);
  // transport 失败不得触发会话失效清理
  expect(await readStoredAuthSession(page)).not.toBeNull();
});

// ---------- 真实后端：真实登录 + 真实 Mutation + 落库验证 ----------
// 前提（任一不满足则用例自动跳过，不会以失败阻塞）：
// 1. 本地 dev 后端在 127.0.0.1:3000 运行，且启动时 APP_CORS_ORIGINS 运行时覆盖含 http://127.0.0.1:4173；
// 2. backend/env/.env.development 存在（本地文件，不入库）且本机可用 mysql CLI；
// 3. frontend/env/.env.development.local 提供 VITE_GRAPHQL_ENDPOINT，否则前端回退相对路径 /graphql，
//    浏览器侧请求到不了本地后端。
// 运行后自行清理产生的申请行，不污染共享开发库基线。

const BACKEND_GRAPHQL = 'http://127.0.0.1:3000/graphql';
const BACKEND_HEALTH = 'http://127.0.0.1:3000/health';
const BACKEND_ENV_FILE = fileURLToPath(
  new URL('../../backend/env/.env.development', import.meta.url),
);
const FRONTEND_LOCAL_ENV_FILE = fileURLToPath(
  new URL('../env/.env.development.local', import.meta.url),
);
// 后端生成的申请编号格式：RR + 14 位时间戳 + 6 位加密随机字符（与后端单测断言一致），
// 仅白名单匹配的编号才允许进入 SQL 拼接。
const REQUEST_NO_PATTERN = /^RR\d{14}[A-Z0-9]{6}$/;

function readBackendEnv(): Record<string, string> {
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
function readBackendEnvOrNull(): Record<string, string> | null {
  try {
    return readBackendEnv();
  } catch {
    return null;
  }
}

// 前端侧真实通道前提：本地 .env.development.local 必须配置 VITE_GRAPHQL_ENDPOINT，
// 否则 dev server 回退相对路径 /graphql，浏览器侧请求到不了本地后端。
function hasFrontendGraphQLEndpoint(): boolean {
  try {
    return /VITE_GRAPHQL_ENDPOINT\s*=\s*\S+/.test(readFileSync(FRONTEND_LOCAL_ENV_FILE, 'utf-8'));
  } catch {
    return false;
  }
}

function mysqlQuery(sql: string): string {
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
async function isRealBackendAvailable(env: Record<string, string>): Promise<boolean> {
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

// 真实登录拿账号 ID：落库断言以真实后端返回的 accountId 为准，不硬编码种子 ID。
async function realLoginAccountId(env: Record<string, string>): Promise<number> {
  const response = await fetch(BACKEND_GRAPHQL, {
    body: JSON.stringify({
      query:
        'mutation LoginWithPassword($input: AuthLoginInput!) { login(input: $input) { accessToken accountId role } }',
      variables: {
        input: {
          audience: 'SSTSWEB',
          loginName: 'mock_customer_alpha',
          loginPassword: env.MOCK_SEED_PASSWORD,
          type: 'PASSWORD',
        },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  const body = (await response.json()) as {
    data?: { login?: { accountId: number } };
  };

  if (!body.data?.login) {
    throw new Error('real login failed in e2e setup');
  }

  return body.data.login.accountId;
}

test.describe('real backend mutation', () => {
  test.beforeEach(async () => {
    const env = readBackendEnvOrNull();
    test.skip(
      env === null,
      'backend/env/.env.development 缺失（本地文件，不入库），跳过真实后端用例',
    );
    test.skip(
      !hasFrontendGraphQLEndpoint(),
      'frontend/env/.env.development.local 未配置 VITE_GRAPHQL_ENDPOINT，真实通道不可达，跳过真实后端用例',
    );
    // 走到这里 env 必非 null：test.skip 条件为真时会抛错终止用例。
    test.skip(
      !(await isRealBackendAvailable(env as Record<string, string>)),
      '本地后端不可用或不可登录，跳过真实后端用例',
    );
  });

  test('customer completes real login, creates a repair request and the row lands in db', async ({
    page,
  }) => {
    test.setTimeout(45_000);

    const env = readBackendEnv();
    const expectedAccountId = await realLoginAccountId(env);
    const mutationAuthorizations: string[] = [];

    // 只观察不拦截：记录真实受保护通道的 Authorization 头
    await page.route('**/graphql', (route) => {
      const payload = route.request().postDataJSON() as GraphQLOperationPayload;

      if (payload.query?.includes('mutation CreateRepairRequest')) {
        mutationAuthorizations.push(route.request().headers().authorization ?? '');
      }

      return route.continue();
    });

    // 真实登录（蔡的登录页 + 真实后端）
    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    // 真实创建：型号来自真实库，提交走真实受保护通道
    await page.goto(CREATE_PAGE_PATH);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
    await page.getByRole('combobox').click();
    await page.locator('.ant-select-item-option').first().click();
    await page.getByLabel('设备错误码').fill('E2E-REAL');
    await page.getByLabel('故障描述').fill('阶段五真实后端 e2e 用例');
    await page.getByRole('button', { name: '提交申请' }).click();

    await expect(page.getByText('维修申请创建成功')).toBeVisible();

    const requestNo = (await page.getByText(/申请编号：/).textContent())
      ?.replace('申请编号：', '')
      .trim();
    expect(requestNo).toBeTruthy();
    // 白名单校验：仅后端格式（RR + 14 位时间戳 + 6 位随机字符）的编号才允许进入下方 SQL 拼接。
    expect(requestNo).toMatch(REQUEST_NO_PATTERN);

    // 受保护通道证据：真实 Mutation 携带 Bearer
    expect(mutationAuthorizations.length).toBe(1);
    expect(mutationAuthorizations[0]).toMatch(/^Bearer .+/);

    // 落库证据：账号取自 JWT（customer_account_id 与 mock 客户一致），初始未接单未删除
    const row = mysqlQuery(
      `SELECT customer_account_id, is_accepted, deleted_at FROM repair_request WHERE request_no = '${requestNo}'`,
    );
    expect(row.split('\t')[0]).toBe(String(expectedAccountId));
    expect(row.split('\t')[1]).toBe('0');
    expect(row.split('\t')[2]).toMatch(/^NULL$/);

    // 清理：删除本用例产生的行，保持共享开发库基线干净（无删除接口，直连清理）
    mysqlQuery(`DELETE FROM repair_request WHERE request_no = '${requestNo}'`);
    expect(
      mysqlQuery(`SELECT COUNT(*) FROM repair_request WHERE request_no = '${requestNo}'`),
    ).toBe('0');
  });

  // 真实后端口径（2026-08-28 实测确认）：equipmentModels 查询 @Roles(CUSTOMER)（后端注释明确不提前放宽），
  // SUPER_ADMIN 真实登录后型号加载被拒（FORBIDDEN，不触发会话失效），表单不可用、无法发起 Mutation。
  // 基线口径「可进页面、提交被拒」中的提交环节已由 mock 用例覆盖；此处锁定真实链路下的防护行为：
  // 不产生 Mutation、不落库、会话保留。若后续后端放宽型号查询给继承角色，本用例需随之更新。
  test('super admin can open the page but models load is rejected so no mutation reaches the backend', async ({
    page,
  }) => {
    test.setTimeout(45_000);

    const env = readBackendEnv();
    const mutationAuthorizations: string[] = [];

    await page.route('**/graphql', (route) => {
      const payload = route.request().postDataJSON() as GraphQLOperationPayload;

      if (payload.query?.includes('mutation CreateRepairRequest')) {
        mutationAuthorizations.push(route.request().headers().authorization ?? '');
      }

      return route.continue();
    });

    // SUPER_ADMIN 真实登录：路由层角色继承允许进入创建页（第一版口径：可进页面）
    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(CREATE_PAGE_PATH);
    await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
    // 型号加载被后端拒绝：型号查询与提交均不可用，前端展示共享错误模型兜底文案而非内部细节；
    // FORBIDDEN 不触发 auth 失效链路，会话保留。
    await expect(page.getByRole('combobox')).toBeDisabled();
    await expect(page.getByRole('button', { name: '提交申请' })).toBeDisabled();
    await expect(page.getByText('请求处理失败，请稍后重试。')).toBeVisible();
    expect(await readStoredAuthSession(page)).not.toBeNull();

    // 反向链路证据：真实后端未收到任何创建 Mutation（防护发生在提交之前）
    expect(mutationAuthorizations).toHaveLength(0);
  });
});
