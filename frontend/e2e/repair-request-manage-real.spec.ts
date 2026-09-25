// e2e/repair-request-manage-real.spec.ts
// 客户「我的维修申请」真实后端数据流 e2e（阶段三 T-07/T-08）。
//
// 与 repair-request-manage.spec.ts 分工：本文件覆盖真实登录后的列表 / 详情 / 删除
// 全链路与越权、角色语义；守卫重定向与失效链路不依赖数据返回，留在前者。
//
// 数据基础：backend seed 预置维修申请与前端阶段一 Mock 数据同 ID 对齐——
// 920001/920005 客户甲（mock_customer_alpha）未接单可删、920003 客户甲已接单
// （李工，含一条 PENDING 回复）、920002 客户乙（mock_customer_beta）已接单、
// 920004 客户乙已软删除。seed 预置行只做只读断言与「必然拒绝」的 API 探测
// （条件更新未命中不改行状态）；删除流程用本用例自建的申请行，结束前清理，
// 不污染共享开发库基线。
// 前提不满足（无本地后端 / 无 env）时用例自动跳过，不会以失败阻塞。

import { expect, test } from '@playwright/test';

import {
  cleanupE2ERepairRequest,
  findRepairRequestByRequestNo,
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  mysqlQuery,
  readBackendEnv,
  readBackendEnvOrNull,
  realGraphqlCall,
  realLoginAccountId,
  REQUEST_NO_PATTERN,
} from './helpers/real-backend';

const LIST_PATH = '/customer/repair-requests';
const CREATE_PAGE_PATH = '/customer/repair-requests/new';
// 自建行的唯一故障码：既填进表单，也作为统一清理入口的预期事实之一（本轮测试自身掌握的值）
const MANAGE_ERROR_CODE = 'E2E-MANAGE';
// 故障描述同口径：填进表单的值即本轮预期事实，物理清理的同一事务内会逐字段核验
const MANAGE_FAULT_DESCRIPTION = '阶段三删除链路真实后端 e2e 用例';
const DELETE_MUTATION = `
  mutation DeleteMyRepairRequest($id: Int!) {
    deleteMyRepairRequest(id: $id) { id requestNo }
  }
`;

test.describe('real backend manage flow', () => {
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
    test.skip(
      !(await isRealBackendAvailable(env as Record<string, string>)),
      '本地后端不可用或不可登录，跳过真实后端用例',
    );
  });

  // T-07 主链路：登录 → 创建 → 成功页跳列表 → 列表可见 → 详情 → 删除未接单成功 →
  // 软删除落库证据。自建行经 try/finally 兜底清理：落库始于提交点击，之后任何断言
  // 失败都不得把真实行泄漏进共享开发库（requestNo 取到前失败的窗口无法定位行，可接受）。
  test('customer full journey: login, create, see it listed, open detail and delete it', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const env = readBackendEnv();

    // 真实登录（客户甲）
    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    // 客户账号 ID 在进入 try 前一次性取得（JWT 口径）：清理兜底不再依赖网络调用，
    // 也不会在清理阶段才失败而掩盖主断言原因。
    const customerAccountId = await realLoginAccountId(env);

    // 本轮自建行的预期事实之一：创建 Mutation 实际发送的设备型号（被动记录，不回读目标行）。
    // 只观察不拦截：不改写真实请求，仅在同一 route 回调里读取发送值后放行。
    // 初值 0 表示「尚未记录」：创建成功后必须已被记录（见下方齐备性断言），清理入口只接受正整数。
    let createdEquipmentModelId = 0;
    await page.route('**/graphql', (route) => {
      const payload = route.request().postDataJSON() as {
        query?: string;
        variables?: { input?: { equipmentModelId?: number } };
      };

      if (payload.query?.includes('mutation CreateRepairRequest')) {
        const modelId = payload.variables?.input?.equipmentModelId;

        if (typeof modelId === 'number') {
          createdEquipmentModelId = modelId;
        }
      }

      return route.continue();
    });

    let requestNo: string | undefined;
    try {
      // 真实创建：型号来自真实库，提交走真实受保护通道
      await page.goto(CREATE_PAGE_PATH);
      await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
      await page.getByRole('combobox').click();
      await page.locator('.ant-select-item-option').first().click();
      await page.getByLabel('设备错误码').fill(MANAGE_ERROR_CODE);
      await page.getByLabel('故障描述').fill(MANAGE_FAULT_DESCRIPTION);
      await page.getByRole('button', { name: '提交申请' }).click();

      // 成功页（T-05：创建成功跳列表真实路径）
      await expect(page.getByText('维修申请创建成功')).toBeVisible();
      requestNo = (await page.getByText(/申请编号：/).textContent())
        ?.replace('申请编号：', '')
        .trim();
      expect(requestNo).toBeTruthy();
      expect(requestNo).toMatch(REQUEST_NO_PATTERN);
      // 清理所需预期事实齐备性：创建成功即必须已被动记录到发送的设备型号，探针失效时用例转红
      expect(createdEquipmentModelId).toBeGreaterThan(0);
      await page.getByRole('button', { name: '查看维修申请' }).click();
      await expect(page).toHaveURL(new RegExp(LIST_PATH));

      // 列表可见：新申请按 createdAt DESC 置顶
      const firstRow = page.getByRole('row', { name: new RegExp(requestNo!) });
      await expect(firstRow).toBeVisible();
      await expect(firstRow.getByText('待接单')).toBeVisible();

      // 详情可达且字段来自后端
      await firstRow.getByRole('button', { name: '查看详情' }).click();
      // 用 heading role 精确断言：loading 态描述「正在加载维修申请详情…」含同文本子串
      await expect(page.getByRole('heading', { name: '维修申请详情' })).toBeVisible();
      await expect(page.getByText(requestNo!).first()).toBeVisible();
      // 故障描述同时出现在 Descriptions 表格与正文 markdown 区，取首个避免 strict mode violation
      await expect(page.getByText(MANAGE_FAULT_DESCRIPTION).first()).toBeVisible();

      // 回列表删除未接单申请
      await page.getByRole('button', { name: '返回列表' }).click();
      await expect(page).toHaveURL(new RegExp(LIST_PATH));
      await firstRow.getByRole('button', { name: /^删\s*除$/ }).click();
      await page.getByRole('button', { name: '确认删除' }).click();
      await expect(page.getByText('维修申请已删除。')).toBeVisible();
      await expect(page.getByRole('row', { name: new RegExp(requestNo!) })).toHaveCount(0);

      // 落库证据：软删除（deprecated=1 且 deleted_at 非空），非物理删除（受保护 helper，内部白名单校验）
      const row = findRepairRequestByRequestNo(
        requestNo!,
        'is_accepted, deprecated, deleted_at IS NOT NULL',
      );
      expect(row.split('\t')).toEqual(['0', '1', '1']);

      // 幂等（裁定 5）：API 重复删除同一申请仍成功
      const id = findRepairRequestByRequestNo(requestNo!, 'id');
      const repeat = await realGraphqlCall(env, DELETE_MUTATION, { id: Number(id) });
      expect(
        (repeat.body as { data?: { deleteMyRepairRequest?: { requestNo: string } } }).data
          ?.deleteMyRepairRequest?.requestNo,
      ).toBe(requestNo);
    } finally {
      // 清理兜底：统一入口先做编号白名单校验，再按解析出的精确 ID 经产品通道软删
      //（主路径已软删，重复软删幂等成功），保证断言中途失败也不留下可见行；
      // 仅当环境为专用隔离库 lithography_e2e 且显式授权时，才按「精确 ID + 本轮预期事实」
      // 走受保护物理清理（同一连接同一事务核验后删除，残留非零即抛错）；
      // 共享开发库保持既有软删边界，不做物理删除。
      // 预期事实（编号 / 客户账号 / 故障码 / 设备型号 / 故障描述）全部取本轮自有值：
      // 型号来自创建成功时已记录的被动探针，缺失即由入口的正整数白名单拒绝清理。
      if (requestNo) {
        await cleanupE2ERepairRequest({
          env,
          requestNo,
          customerAccountId,
          errorCode: MANAGE_ERROR_CODE,
          equipmentModelId: createdEquipmentModelId,
          faultDescription: MANAGE_FAULT_DESCRIPTION,
        });
      }
    }
  });

  // T-08：已接单详情呈现实时昵称回复时间线、无删除入口，且不含任何账号 ID 字样
  //（seed 920003：客户甲名下已接单，李工一条 PENDING 回复；只读，不改动 seed 行）
  test('accepted detail renders nickname timeline and hides delete', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    await page.goto(`${LIST_PATH}/920003`);
    await expect(page.getByText('MOCK-RR-2026-0003').first()).toBeVisible();
    await expect(page.getByText(/已接单（/)).toBeVisible();
    await expect(page.getByRole('button', { name: '删除申请' })).toHaveCount(0);
    // 回复时间线：李工实时昵称 + PENDING 标签；无任何账号 ID 字样（裁定 3）
    await expect(page.getByText('李工')).toBeVisible();
    await expect(page.getByText('处理中')).toBeVisible();
    await expect(page.getByText(/engineerAccountId|accountId|customerAccountId/)).toHaveCount(0);
  });

  // T-08：已接单拒绝（裁定 5 CONFLICT）。UI 无删除入口，走 API 直发探测；
  // 后端条件更新未命中不改行状态，seed 行无污染。
  test('deleting an accepted request is rejected with conflict via api', async () => {
    const env = readBackendEnv();

    const { body } = await realGraphqlCall(env, DELETE_MUTATION, { id: 920003 });
    const errors = (
      body as {
        errors?: Array<{ extensions?: { code?: string; errorCode?: string } }>;
      }
    ).errors;
    expect(errors?.[0]?.extensions?.code).toBe('CONFLICT');
    expect(errors?.[0]?.extensions?.errorCode).toBe('REPAIR_REQUEST_ALREADY_ACCEPTED');
    // 行状态未被改动
    expect(mysqlQuery('SELECT deprecated FROM repair_request WHERE id = 920003')).toBe('0');
  });

  // T-07/T-08：越权防探测（裁定 5）——改 URL 访问他人申请统一呈现 not-found 态，
  // 不泄露存在性（seed 920002 属客户乙，客户甲访问；只读）
  test('cross-account detail access is rejected with the unified not-found state', async ({
    page,
  }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    await page.goto(`${LIST_PATH}/920002`);
    await expect(page.getByText(/维修申请不存在/)).toBeVisible();
    await expect(page.getByText('MOCK-RR-2026-0002')).toHaveCount(0);
  });

  // T-07/T-08：已删除申请不可见（A-01 场景③）——seed 920004 属客户乙且已软删除：
  // 正常列表不含该行，改 URL 直访详情同样统一 not-found 态（读取侧防探测，不泄露存在性）
  test('deleted request is absent from list and detail shows the unified not-found state', async ({
    page,
  }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_beta');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    await page.goto(LIST_PATH);
    // 乙名下未删除的申请可见；已删除的 920004 不出现在正常列表
    await expect(page.getByText('MOCK-RR-2026-0002')).toBeVisible();
    await expect(page.getByText('MOCK-RR-2026-0004')).toHaveCount(0);

    await page.goto(`${LIST_PATH}/920004`);
    await expect(page.getByText(/维修申请不存在/)).toBeVisible();
    await expect(page.getByText('MOCK-RR-2026-0004')).toHaveCount(0);
  });

  // T-08 角色权限（裁定 2）：超管继承放行列表与详情，但仅见本人名下数据（空态），
  // 且不能以客户身份删除（后端 Guard 精确 CUSTOMER 拒绝）
  test('super admin enters the list with own empty data and cannot delete via api', async ({
    page,
  }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(LIST_PATH);
    await expect(page).toHaveURL(new RegExp(LIST_PATH));
    await expect(page.getByText('我的维修申请').first()).toBeVisible();
    await expect(page.getByText(/还没有维修申请/)).toBeVisible();

    const { body } = await realGraphqlCall(
      env,
      DELETE_MUTATION,
      { id: 920001 },
      'mock_super_admin',
    );
    const errors = (
      body as {
        errors?: Array<{ extensions?: { code?: string; errorCode?: string } }>;
      }
    ).errors;
    expect(errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    // 行状态未被改动
    expect(mysqlQuery('SELECT deprecated FROM repair_request WHERE id = 920001')).toBe('0');
  });

  // T-08 角色权限（裁定 2）：超管继承放行详情页，但本人名下无他人申请 → 后端
  // FORBIDDEN/ACCESS_DENIED 防探测文案经 adapter 双口径归并呈现统一 not-found 态
  //（seed 920002 属客户乙；只读）
  test('super admin accessing another customer detail sees the unified not-found state', async ({
    page,
  }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(`${LIST_PATH}/920002`);
    await expect(page.getByText(/维修申请不存在/)).toBeVisible();
    await expect(page.getByText('MOCK-RR-2026-0002')).toHaveCount(0);
  });
});
