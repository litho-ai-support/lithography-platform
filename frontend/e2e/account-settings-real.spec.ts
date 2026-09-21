// e2e/account-settings-real.spec.ts
// 账号设置定向真实页面 e2e（R3 测试安全收口）：
//
// 五条真实页面流程，全部以 DOM / URL / 后端权威视图断言，不把截图或录像当作
// 自动化断言（人工证据留到下一阶段）：
// 1. 三个角色都能在导航看到并进入「账号设置」；
// 2. 页面显示角色 / 状态 / 最近变更；
// 3. 修改一个资料字段成功并回显（含刷新后持久与后端权威值核对）；
// 4. 角色与状态没有编辑控件；
// 5. 改密成功后清理会话并跳转登录页。
//
// 共享开发库数据边界：资料用例只真改一处 Mock 数据——基础资料的电话字段，且在 finally
// 内按运行前快照恢复（走 updateMyAccountSettings 且只提交 `phone` 键，三态语义下其余
// 字段不修改），不触碰凭据与 seed 计数。真实改密用例（R3 修正轮）：
// - 专用账号在**独立 E2E 数据库**创建（DB_NAME 必须命中 e2e/test 段）；
// - 专用账号删除经单一事务包裹（START TRANSACTION → 精确 DELETE → 残留核对 → COMMIT），
//   任一步失败自动回滚；
// - 用例开始前预检：权限（E2E_ALLOW_PHYSICAL_CLEANUP）、目标库模式、连接连通性，
//   环境不满足时在写入前即 skip/失败；
// - 连续执行两次，每次结束后核对主记录 0 + 业务表 0 孤儿。
// 前提不满足（无本地后端 / 无 env / 无前端真实通道 / 非独立 E2E 库）时用例自动跳过，不以失败阻塞。

import { expect, type Page, test } from '@playwright/test';

import { readStoredAuthSession } from './helpers/auth-session-seed';
import {
  deleteE2EDedicatedAccountById,
  preflightDedicatedAccountCleanup,
  readDedicatedAccountCleanupResidue,
} from './helpers/dedicated-account-cleanup';
import {
  BACKEND_GRAPHQL,
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
  realGraphqlCall,
} from './helpers/real-backend';

const SETTINGS_PATH = '/account/settings';

/** 改密用例使用的账号：与其它真实链路 spec 及 real-backend 可用性探测账号都不重叠 */
const PASSWORD_TARGET = { homePath: '/engineer', loginName: 'mock_engineer_li' } as const;

/** 改密用例的新密码：满足后端策略（长度 8～128、含小写字母/数字/特殊字符、非黑名单弱密码） */
const NEW_PASSWORD = 'E2eTemp#2026Pass';

/** 后端 changeMyPassword 的固定安全提示（不声称服务端撤销了已签发 Token） */
const CHANGE_PASSWORD_NOTICE = '密码已更新，请使用新密码重新登录';

/** 资料字段修改目标账号与字段值（电话是自由文本，只受长度上限约束） */
const PROFILE_TARGET = { homePath: '/engineer', loginName: 'mock_engineer_chen' } as const;
const MODIFIED_PHONE = '13800000911';

const MY_ACCOUNT_SETTINGS_QUERY = `
  query MyAccountSettings {
    myAccountSettings {
      companyName
      contactEmail
      loginEmail
      loginName
      nickname
      phone
      role
      status
      updatedAt
    }
  }
`;

const UPDATE_MY_ACCOUNT_SETTINGS_MUTATION = `
  mutation UpdateMyAccountSettings($input: UpdateMyAccountSettingsInput!) {
    updateMyAccountSettings(input: $input) {
      isUpdated
    }
  }
`;

type AccountSettingsSnapshot = {
  companyName: string | null;
  contactEmail: string | null;
  loginEmail: string | null;
  loginName: string | null;
  nickname: string;
  phone: string | null;
  role: string;
  status: string;
  updatedAt: string;
};

const ROLE_CASES = [
  { homePath: '/admin', loginName: 'mock_super_admin', roleLabel: '管理员' },
  { homePath: '/engineer', loginName: 'mock_engineer_chen', roleLabel: '工程师' },
  { homePath: '/customer', loginName: 'mock_customer_alpha', roleLabel: '客户' },
] as const;

/** 后端权威设置快照（恢复前的原值来源，也是「页面展示与后端一致」的对照事实） */
async function readSettingsSnapshot(
  env: Record<string, string>,
  loginName: string,
): Promise<AccountSettingsSnapshot> {
  const { body } = await realGraphqlCall(env, MY_ACCOUNT_SETTINGS_QUERY, {}, loginName);
  const settings = (body as { data?: { myAccountSettings?: AccountSettingsSnapshot } }).data
    ?.myAccountSettings;

  if (!settings) {
    throw new Error(`myAccountSettings 快照读取失败：${JSON.stringify(body)}`);
  }

  return settings;
}

/**
 * 在 finally 内执行恢复动作并捕获失败。
 * 恢复失败必须被发现，但不能在 finally 中抛出：那会掩盖主链路的原始断言错误
 * （no-unsafe-finally 同款语义）。失败交给 finally 之后的 `expect(restoreFailure)` 报告。
 */
async function captureRestoreFailure(restore: () => Promise<void>): Promise<unknown> {
  try {
    await restore();

    return null;
  } catch (error) {
    return error;
  }
}

/** 真实 UI 登录并断言落到角色主页（与既有真实链路 spec 同一交互口径） */
async function loginViaUi(
  page: Page,
  loginName: string,
  password: string,
  homePath: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('账号或邮箱').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).toHaveURL(new RegExp(`${homePath}$`));
}

/** 经主导航进入账号设置页（不断言直达 URL，走真实用户路径） */
async function enterAccountSettingsFromNav(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '账号设置' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${SETTINGS_PATH}$`));
  await expect(page.getByRole('heading', { name: '账号设置' })).toBeVisible();
}

/** 按卡片标题定位三个区块（DataCard 渲染 section.data-card + h3.data-card-title） */
function cardByTitle(page: Page, title: string) {
  return page.locator('section.data-card', {
    has: page.locator('h3.data-card-title', { hasText: title }),
  });
}

test.describe('account settings real backend flow', () => {
  test.beforeEach(async () => {
    const env = readBackendEnvOrNull();

    test.skip(
      env === null,
      'backend/env/.env.development 缺失（本地文件，不入库），跳过真实后端用例',
    );
    test.skip(
      !hasFrontendGraphQLEndpoint(),
      '前端真实通道不可达（既无 VITE_GRAPHQL_ENDPOINT 也无 /graphql 同源转发），跳过真实后端用例',
    );
    test.skip(
      !(await isRealBackendAvailable(env as Record<string, string>)),
      '本地后端不可用或不可登录，跳过真实后端用例',
    );
  });

  // 三个角色各自独立 context：串行执行也要保证上一个角色的会话不泄漏到下一个
  test('三个角色都能在导航看到账号设置并进入页面', async ({ browser }) => {
    // 本用例含三次真实登录 + 三次导航进入，dev server 串行门禁下需要独立预算
    test.setTimeout(90_000);
    const env = readBackendEnv();

    for (const roleCase of ROLE_CASES) {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await loginViaUi(page, roleCase.loginName, env.MOCK_SEED_PASSWORD, roleCase.homePath);
        await expect(
          page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '账号设置' }),
        ).toBeVisible();

        await enterAccountSettingsFromNav(page);

        // 进入后页面确实按该角色身份加载：角色胶囊与后端 role 同口径
        const extra = cardByTitle(page, '账号信息').locator('div.data-card-extra');

        await expect(extra.locator('span.status-pill').first()).toHaveText(roleCase.roleLabel);
      } finally {
        await context.close();
      }
    }
  });

  test('账号信息区块显示角色、状态与最近变更时间', async ({ page }) => {
    // 含真实登录 + 导航 + 后端快照读取，dev server 串行门禁下需要独立预算
    test.setTimeout(60_000);
    const env = readBackendEnv();
    const loginName = 'mock_super_admin';

    await loginViaUi(page, loginName, env.MOCK_SEED_PASSWORD, '/admin');
    await enterAccountSettingsFromNav(page);

    const snapshot = await readSettingsSnapshot(env, loginName);
    const extra = cardByTitle(page, '账号信息').locator('div.data-card-extra');

    // 角色 / 状态以只读胶囊展示，标签与后端权威枚举一一对应
    expect(snapshot.role).toBe('SUPER_ADMIN');
    expect(snapshot.status).toBe('ACTIVE');
    await expect(extra).toContainText('角色');
    await expect(extra).toContainText('状态');
    await expect(extra.locator('span.status-pill')).toHaveText(['管理员', '正常']);

    // 最近变更：zh-CN 本地化时间，后端原始 ISO 串不得直接出现在页面正文
    await expect(cardByTitle(page, '账号信息').getByText(/^最近变更：\d{4}\//)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(snapshot.updatedAt);
  });

  test('角色与状态只读：页面不提供任何针对二者的编辑控件', async ({ page }) => {
    // 含真实登录 + 导航，dev server 串行门禁下需要独立预算
    test.setTimeout(60_000);
    const env = readBackendEnv();

    await loginViaUi(
      page,
      PROFILE_TARGET.loginName,
      env.MOCK_SEED_PASSWORD,
      PROFILE_TARGET.homePath,
    );
    await enterAccountSettingsFromNav(page);

    // 断言一律收敛到 main 内容区：页面外壳自带密度 Segmented 控件（ARIA 上是
    // radiogroup + 3 个 radio），与账号设置无关，全页断言会把它误判成本页的编辑控件
    const main = page.getByRole('main');

    // 先证明三个区块的表单确实渲染出来了（否则下面的「零控件」断言没有意义）
    await expect(main.getByLabel('登录名')).toBeVisible();
    await expect(main.getByLabel('昵称')).toBeVisible();
    await expect(main.getByLabel('当前密码')).toBeVisible();

    // 角色 / 状态没有同名表单项，也没有任何选择类控件
    await expect(main.getByLabel(/角色/)).toHaveCount(0);
    await expect(main.getByLabel(/状态/)).toHaveCount(0);
    await expect(main.getByRole('combobox')).toHaveCount(0);
    await expect(main.getByRole('listbox')).toHaveCount(0);
    await expect(main.getByRole('switch')).toHaveCount(0);
    await expect(main.getByRole('radio')).toHaveCount(0);
    await expect(main.getByRole('radiogroup')).toHaveCount(0);
    await expect(main.getByRole('checkbox')).toHaveCount(0);
    await expect(main.getByRole('spinbutton')).toHaveCount(0);

    // 不存在「切换角色」「停用 / 封禁 / 启用」一类以角色或状态为文案的操作入口
    await expect(main.getByRole('button', { name: /角色|状态|停用|启用|封禁/ })).toHaveCount(0);

    // 角色 / 状态只以只读胶囊文本出现，不是任何控件的可编辑值
    const extra = cardByTitle(page, '账号信息').locator('div.data-card-extra');

    await expect(extra.locator('span.status-pill')).toHaveText(['工程师', '正常']);
  });

  test('修改基础资料的电话字段：保存成功、页面回显、刷新后持久', async ({ page }) => {
    // 含真实登录 + 导航 + 提交写链路 + 刷新 + 恢复，dev server 串行门禁下需要独立预算
    test.setTimeout(90_000);
    const env = readBackendEnv();
    const { homePath, loginName } = PROFILE_TARGET;
    const original = await readSettingsSnapshot(env, loginName);

    // 目标值必须与原值不同，否则「已保存」与回显断言无法区分真实写入与未变化
    expect(original.phone).not.toBe(MODIFIED_PHONE);

    await loginViaUi(page, loginName, env.MOCK_SEED_PASSWORD, homePath);
    await enterAccountSettingsFromNav(page);

    const profileCard = cardByTitle(page, '基础资料');
    const phoneInput = profileCard.getByLabel('电话');
    let restoreFailure: unknown;

    try {
      await expect(phoneInput).toHaveValue(original.phone ?? '');

      await phoneInput.fill(MODIFIED_PHONE);
      await profileCard.getByRole('button', { name: /保\s*存/ }).click();

      await expect(page.getByText('基础资料已保存。')).toBeVisible();
      await expect(phoneInput).toHaveValue(MODIFIED_PHONE);

      // 刷新后仍是新值：证明落库，而不是只改了本地表单状态
      await page.reload();
      await expect(cardByTitle(page, '基础资料').getByLabel('电话')).toHaveValue(MODIFIED_PHONE);

      // 后端权威视图核对：只提交电话，其余资料字段与登录凭据一律不变
      const updated = await readSettingsSnapshot(env, loginName);

      expect(updated.phone).toBe(MODIFIED_PHONE);
      expect(updated.nickname).toBe(original.nickname);
      expect(updated.companyName).toBe(original.companyName);
      expect(updated.contactEmail).toBe(original.contactEmail);
      expect(updated.loginName).toBe(original.loginName);
      expect(updated.loginEmail).toBe(original.loginEmail);
    } finally {
      // 三态语义：只提交 phone 键即只恢复电话（原值为 null 时提交 null 表示清空）
      restoreFailure = await captureRestoreFailure(async () => {
        await realGraphqlCall(
          env,
          UPDATE_MY_ACCOUNT_SETTINGS_MUTATION,
          { input: { phone: original.phone } },
          loginName,
        );
      });
    }

    // finally 之后再做恢复核对：主链路断言失败时不会掩盖原始错误，恢复失败时必被发现
    expect(restoreFailure).toBeNull();
    expect((await readSettingsSnapshot(env, loginName)).phone).toBe(original.phone);
  });

  // 改密成功后跳转登录页：真实页面 + 真实登录 + 真实会话清理与路由跳转，只有
  // changeMyPassword 的**响应**在网络边界被拦截，其余 GraphQL 流量一律放行到真实后端。
  // 为什么不让改密真落库：seed 密码 MOCK_SEED_PASSWORD（lithoai）本身不满足现行密码策略
  // （8～128 位 + 小写字母 + 数字 + 特殊字符），changeMyPassword 会把它拒为 BAD_USER_INPUT，
  // 共享 Mock 账号一旦被真改密就无法经任何 API 改回原值——既污染基线，也让本用例失去
  // 可重复执行性（下一次运行用 seed 密码登不进去）。本用例只负责页面装配层的请求构造
  // 与会话收口契约（带真实 Token、入参只含两个密码字段、确认密码不外发）；完整真实
  // 改密链路（真落库 + 旧密码失效 + 新密码登录 + 受保护 Query）由本文件下方
  // 「真实改密链路」用例以 adminCreateUser 创建的专用账号覆盖。
  test('修改密码成功后清理会话并跳转登录页', async ({ page }) => {
    // 含真实登录 + 导航 + 提交 + 跳转，dev server 串行门禁下需要独立预算
    test.setTimeout(60_000);
    const env = readBackendEnv();
    const { homePath, loginName } = PASSWORD_TARGET;
    const seedPassword = env.MOCK_SEED_PASSWORD;

    type CapturedRequest = { authorization?: string; input?: Record<string, unknown> };
    const capturedRequests: CapturedRequest[] = [];

    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const payload = request.postDataJSON() as {
        query?: string;
        variables?: { input?: Record<string, unknown> };
      };

      if (!payload.query?.includes('mutation ChangeMyPassword')) {
        await route.continue();

        return;
      }

      capturedRequests.push({
        authorization: request.headers().authorization,
        input: payload.variables?.input,
      });
      await route.fulfill({
        body: JSON.stringify({
          data: { changeMyPassword: { isUpdated: true, notice: CHANGE_PASSWORD_NOTICE } },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await loginViaUi(page, loginName, seedPassword, homePath);
    await enterAccountSettingsFromNav(page);

    const securityCard = cardByTitle(page, '安全设置');

    // 「新密码」用 exact 匹配，否则会同时命中「确认新密码」触发 strict mode 冲突
    await securityCard.getByLabel('当前密码').fill(seedPassword);
    await securityCard.getByLabel('新密码', { exact: true }).fill(NEW_PASSWORD);
    await securityCard.getByLabel('确认新密码').fill(NEW_PASSWORD);
    await securityCard.getByRole('button', { name: /修\s*改\s*密\s*码/ }).click();

    // 请求侧是真实的：带真实会话 Token，入参只有两个密码字段（「确认新密码」不外发）
    expect(capturedRequests).toHaveLength(1);

    const [captured] = capturedRequests;

    expect(captured.authorization).toMatch(/^Bearer .+/);
    expect(captured.input).toEqual({
      currentPassword: seedPassword,
      newPassword: NEW_PASSWORD,
    });

    // 后端固定安全提示原样展示
    await expect(page.getByText(CHANGE_PASSWORD_NOTICE)).toBeVisible();

    // 会话收口：唯一会话真源被清理，随后跳转登录页（不依赖服务端撤销）
    await expect(page).toHaveURL(/\/login$/);
    expect(await readStoredAuthSession(page)).toBeNull();

    // 落地的是可用登录页，且没有任何密码内容被带进 URL
    await expect(page.getByLabel('账号或邮箱')).toBeVisible();
    expect(page.url()).not.toContain(NEW_PASSWORD);
  });

  // ---------------------------------------------------------------------------
  // 真实改密链路（零拦截）：专用账号端到端
  // ---------------------------------------------------------------------------

  const ADMIN_CREATE_USER_MUTATION = `
    mutation AdminCreateUser($input: AdminCreateUserInput!) {
      adminCreateUser(input: $input) { id loginName status }
    }
  `;

  const LOGIN_ATTEMPT_MUTATION = `
    mutation LoginAttempt($input: AuthLoginInput!) {
      login(input: $input) { accessToken }
    }
  `;

  type LoginAttemptResult = { accessToken: string | null; errorCode: string | null };

  /** Node 侧真实登录尝试：不抛错，返回是否拿到 Token 与首个错误大类（供断言用） */
  async function attemptRealLogin(
    env: Record<string, string>,
    loginName: string,
    loginPassword: string,
  ): Promise<LoginAttemptResult> {
    const response = await fetch(BACKEND_GRAPHQL, {
      body: JSON.stringify({
        query: LOGIN_ATTEMPT_MUTATION,
        variables: {
          input: { audience: 'SSTSWEB', loginName, loginPassword, type: 'PASSWORD' },
        },
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const body = (await response.json()) as {
      data?: { login?: { accessToken?: string } };
      errors?: Array<{ extensions?: { code?: string } }>;
    };

    return {
      accessToken: body.data?.login?.accessToken ?? null,
      errorCode: body.errors?.[0]?.extensions?.code ?? null,
    };
  }

  // 完整真实链路：登录 → 改密（真落库）→ 会话清理跳登录页 → 旧密码登录失败 →
  // 新密码登录成功 → 受保护 Query 成功。全部流量放行到真实后端，无任何 route 拦截。
  // 专用账号：共享 Mock 账号的 seed 密码不满足现行密码策略、真改密后无法改回，故经
  // adminCreateUser 以策略合规密码创建一次性 ENGINEER 账号；finally 内经
  // deleteE2EDedicatedAccountById 按本次 accountId 精确物理删除该账号及关联记录
  // （复用项目统一物理清理授权：显式 opt-in 且 DB_NAME 必须含 e2e/test 段）。创建前
  // 先预检授权、目标库与连接；清理后分别核对主记录、userInfo 与关联业务表均为 0。
  for (const run of [1, 2]) {
    test(`真实改密链路（第 ${run} 次）：专用账号改密后旧密码失效、新密码可登录受保护页`, async ({
      page,
    }) => {
      // 创建账号 + 两次真实登录 + 两次导航进入 + 改密 + 登录尝试，需独立预算
      test.setTimeout(120_000);
      const env = readBackendEnv();

      try {
        preflightDedicatedAccountCleanup();
      } catch (error) {
        test.skip(true, `专用账号创建前的清理预检未通过：${(error as Error).message}`);
      }

      // 登录名口径：4~30 位字母/数字/下划线/短横线；时间戳保证共享库内唯一
      const dedicatedLoginName = `e2e-pw-${Date.now()}`;
      // 两个密码均满足现行策略（8～128 位、含小写字母/数字/特殊字符、非黑名单、无连续序列）
      const INITIAL_PASSWORD = 'E2eInit#2026Pass';
      const NEW_PASSWORD = 'E2eChanged#2026Pass';
      let dedicatedAccountId: number | null = null;
      let restoreFailure: unknown;

      try {
        const created = await realGraphqlCall(
          env,
          ADMIN_CREATE_USER_MUTATION,
          {
            input: {
              initialPassword: INITIAL_PASSWORD,
              loginName: dedicatedLoginName,
              nickname: 'E2E 改密专用账号',
              role: 'ENGINEER',
            },
          },
          'mock_super_admin',
        );
        const createdBody = created.body as {
          data?: { adminCreateUser?: { id: number; status?: string } };
        };
        dedicatedAccountId = createdBody.data?.adminCreateUser?.id ?? null;

        if (dedicatedAccountId === null) {
          throw new Error(`专用账号创建失败：${JSON.stringify(created.body)}`);
        }

        // 初始密码真实 UI 登录 → 经导航进入账号设置 → 真实提交改密
        await loginViaUi(page, dedicatedLoginName, INITIAL_PASSWORD, '/engineer');
        await enterAccountSettingsFromNav(page);

        const securityCard = cardByTitle(page, '安全设置');

        // 「新密码」用 exact 匹配，否则会同时命中「确认新密码」触发 strict mode 冲突
        await securityCard.getByLabel('当前密码').fill(INITIAL_PASSWORD);
        await securityCard.getByLabel('新密码', { exact: true }).fill(NEW_PASSWORD);
        await securityCard.getByLabel('确认新密码').fill(NEW_PASSWORD);
        await securityCard.getByRole('button', { name: /修\s*改\s*密\s*码/ }).click();

        // 会话收口：唯一会话真源被清理，随后跳转登录页（不依赖服务端撤销）
        await expect(page).toHaveURL(/\/login$/);
        expect(await readStoredAuthSession(page)).toBeNull();

        // 旧密码经真实登录入口已失效
        const oldAttempt = await attemptRealLogin(env, dedicatedLoginName, INITIAL_PASSWORD);

        expect(oldAttempt.accessToken).toBeNull();
        expect(oldAttempt.errorCode).toBe('UNAUTHENTICATED');

        // 新密码经真实 UI 登录成功并落到受保护主页
        await loginViaUi(page, dedicatedLoginName, NEW_PASSWORD, '/engineer');

        // 受保护 Query 成功：新 Token 下 myAccountSettings 真实可达
        await enterAccountSettingsFromNav(page);
      } finally {
        const cleanupAccountId = dedicatedAccountId;

        if (cleanupAccountId !== null) {
          restoreFailure = await captureRestoreFailure(async () => {
            deleteE2EDedicatedAccountById(cleanupAccountId);

            expect(readDedicatedAccountCleanupResidue(cleanupAccountId)).toEqual({
              account: 0,
              relatedBusiness: 0,
              userInfo: 0,
            });
          });
        }
      }

      // finally 之后再核对回收结果：主链路失败时不掩盖原始错误，物理清理失败必被发现并使本用例失败
      expect(restoreFailure).toBeNull();
    });
  }
});
