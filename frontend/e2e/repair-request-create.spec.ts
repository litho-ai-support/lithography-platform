// e2e/repair-request-create.spec.ts

import { expect, type Page, type Route, test } from '@playwright/test';

import { readStoredAuthSession, seedAuthSession } from './helpers/auth-session-seed';
import {
  deleteRepairRequestByRequestNo,
  findRepairRequestByRequestNo,
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
  realLoginAccountId,
  REQUEST_NO_PATTERN,
} from './helpers/real-backend';

const CREATE_PAGE_PATH = '/customer/repair-requests/new';
const CUSTOMER_HOME_PATH = '/customer';

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

test('super admin visit is redirected to the admin home, like engineer', async ({ page }) => {
  // 2026-08-29 负责人裁定：SUPER_ADMIN 第一版不代客户创建（后端精确仅接受 CUSTOMER），
  // 路由层与 ENGINEER 一致拒绝进入创建页，不保留「可进页面、后端全拒」的残缺中间态。
  await seedAuthSession(page, 'SUPER_ADMIN');

  // 客户首页可继承访问，但入口按钮置灰并附说明，避免「点了被弹回」的无提示体验。
  await page.goto(CUSTOMER_HOME_PATH);
  await expect(page.getByRole('button', { name: '发起维修申请' })).toBeDisabled();
  await expect(page.getByText('超管不能代客户发起维修申请')).toBeVisible();

  await page.goto(CREATE_PAGE_PATH);
  await expect(page).toHaveURL(/\/admin$/);
  expect(await readStoredAuthSession(page)).not.toBeNull();
});

test('customer reaches the create page by clicking the entry on the customer home', async ({
  page,
}) => {
  // 可发现性（负责人裁定）：不允许只能手输 URL 到达的页面，首页入口点击即达创建页。
  await seedAuthSession(page, 'CUSTOMER');
  await page.route('**/graphql', (route) => fulfillModelsSuccess(route));

  await page.goto(CUSTOMER_HOME_PATH);
  await page.getByRole('button', { name: '发起维修申请' }).click();

  await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
  await expect(page.getByText('创建维修申请').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
});

// ---------- 前端浏览器流程测试（GraphQL Mock）：用 page.route 模拟 Token 失效与重新登录响应，
// 不是真实 Token 自然过期联调 ----------

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
  // 失效跳转恒定携带固定原因与安全 returnTo，记录失效前的站内业务页
  await expect(page).toHaveURL(
    /\/login\?reason=session-expired&returnTo=%2Fcustomer%2Frepair-requests%2Fnew$/,
  );
  await expect(page.getByText('登录状态已失效，请重新登录')).toBeVisible();
  // 不展示后端原始错误内容（mock 故意携带 internal auth detail）
  await expect(page.getByText('internal auth detail')).toHaveCount(0);
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

  // 提交期失效与页面加载期失效行为一致：同样携带固定原因与安全 returnTo
  await expect(page).toHaveURL(
    /\/login\?reason=session-expired&returnTo=%2Fcustomer%2Frepair-requests%2Fnew$/,
  );
  await expect(page.getByText('登录状态已失效，请重新登录')).toBeVisible();
  expect(getCreateCount()).toBe(1);
  expect(await readStoredAuthSession(page)).toBeNull();
});

test('same-role re-login after expiry returns to the original business page', async ({ page }) => {
  await seedAuthSession(page, 'CUSTOMER');

  let modelsRequests = 0;
  let loginRequests = 0;
  await page.route('**/graphql', async (route) => {
    const payload = route.request().postDataJSON() as GraphQLOperationPayload;

    if (payload.query?.includes('mutation LoginWithPassword')) {
      loginRequests += 1;
      return route.fulfill({
        body: JSON.stringify({
          data: {
            login: {
              accessToken: 'renewed-access-token',
              accountId: 900201,
              role: 'CUSTOMER',
              userInfo: {
                accessGroup: ['CUSTOMER'],
                nickname: '测试会话',
              },
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    }

    if (payload.query?.includes('query EquipmentModels')) {
      modelsRequests += 1;
      // 首次型号查询命中失效；同角色重新登录后放行，验证返回原业务页。
      if (modelsRequests === 1) {
        return fulfillUnauthenticated(route);
      }

      return fulfillModelsSuccess(route);
    }

    return route.fulfill({ status: 500 });
  });

  await page.goto(CREATE_PAGE_PATH);
  await expect(page).toHaveURL(
    /\/login\?reason=session-expired&returnTo=%2Fcustomer%2Frepair-requests%2Fnew$/,
  );
  await expect(page.getByText('登录状态已失效，请重新登录')).toBeVisible();

  await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
  await page.getByLabel('密码').fill('test-only-password');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  // 同角色重新登录后安全返回失效前记录的原业务页，不出现重复跳转或请求循环。
  await expect(page).toHaveURL(new RegExp(CREATE_PAGE_PATH));
  await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
  expect(loginRequests).toBe(1);
  expect(modelsRequests).toBe(2);
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

  // T-05：创建成功页跳维修申请列表（本用例 route 已 mock 成 create 响应形状，
  // 列表页数据态不属本用例范围，仅断言导航路径；数据流断言见 manage 系列 spec）
  await page.getByRole('button', { name: '查看维修申请' }).click();
  await expect(page).toHaveURL(/\/customer\/repair-requests$/);
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
// 共享工具（env/探针/mysql/真实登录）见 ./helpers/real-backend；
// 前提不满足时用例自动跳过，不会以失败阻塞；运行后自行清理产生的申请行。

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

    // 自建行落库始于下方提交，之后任何断言失败都必须仍能清理（try/finally 兜底）
    let requestNo: string | undefined;
    try {
      // 真实创建：型号来自真实库，提交走真实受保护通道
      await page.goto(CREATE_PAGE_PATH);
      await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
      await page.getByRole('combobox').click();
      await page.locator('.ant-select-item-option').first().click();
      await page.getByLabel('设备错误码').fill('E2E-REAL');
      await page.getByLabel('故障描述').fill('阶段五真实后端 e2e 用例');
      await page.getByRole('button', { name: '提交申请' }).click();

      await expect(page.getByText('维修申请创建成功')).toBeVisible();

      requestNo = (await page.getByText(/申请编号：/).textContent())
        ?.replace('申请编号：', '')
        .trim();
      expect(requestNo).toBeTruthy();
      // 白名单校验：业务断言（受保护 helper 内部还有强制校验，见 real-backend.ts 守卫说明）。
      expect(requestNo).toMatch(REQUEST_NO_PATTERN);

      // 受保护通道证据：真实 Mutation 携带 Bearer
      expect(mutationAuthorizations.length).toBe(1);
      expect(mutationAuthorizations[0]).toMatch(/^Bearer .+/);

      // 落库证据：账号取自 JWT（customer_account_id 与 mock 客户一致），初始未接单未删除
      const row = findRepairRequestByRequestNo(
        requestNo!,
        'customer_account_id, is_accepted, deleted_at',
      );
      expect(row.split('\t')[0]).toBe(String(expectedAccountId));
      expect(row.split('\t')[1]).toBe('0');
      expect(row.split('\t')[2]).toMatch(/^NULL$/);

      // 清理：删除本用例产生的行，保持共享开发库基线干净（无删除接口，直连清理）
      deleteRepairRequestByRequestNo(requestNo!);
      expect(findRepairRequestByRequestNo(requestNo!, 'COUNT(*)')).toBe('0');
    } finally {
      // 清理兜底：断言中途失败时仍删除本用例产生的行；受保护 helper 内部先白名单校验，
      // 对不存在行是 no-op，幂等成立
      if (requestNo) {
        deleteRepairRequestByRequestNo(requestNo);
      }
    }
  });

  // 2026-08-29 负责人裁定：SUPER_ADMIN 第一版不代客户创建，路由层与 ENGINEER 一致拒绝。
  // 后端精确 CUSTOMER 约束保持不变（06 组 auth spec 已覆盖 FORBIDDEN）；此处锁定真实链路：
  // 超管真实登录后直输创建页路径被重定向回 /admin，会话保留，全程无创建 Mutation 到达后端。
  test('super admin is redirected to the admin home before any mutation reaches the backend', async ({
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

    // SUPER_ADMIN 真实登录：登录与默认入口不受本次策略调整影响
    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // 客户首页可继承访问，但创建入口置灰并附说明（与路由层拒绝同口径）
    await page.goto(CUSTOMER_HOME_PATH);
    await expect(page.getByRole('button', { name: '发起维修申请' })).toBeDisabled();
    await expect(page.getByText('超管不能代客户发起维修申请')).toBeVisible();

    // 直输创建页路径：路由层拒绝，跳回管理主页；会话保留（非 auth 失效）
    await page.goto(CREATE_PAGE_PATH);
    await expect(page).toHaveURL(/\/admin$/);
    expect(await readStoredAuthSession(page)).not.toBeNull();

    // 反向链路证据：真实后端全程未收到任何创建 Mutation（防护发生在进入页面之前）
    expect(mutationAuthorizations).toHaveLength(0);
  });
});
