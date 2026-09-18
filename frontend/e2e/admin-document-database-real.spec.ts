// e2e/admin-document-database-real.spec.ts
// 管理员文档数据库真实后端 e2e（PR3 S4 计划表 S4.5）。
//
// 数据基础：backend seed 预置数据（只读断言）——维修申请 920001~920005
//（920004 已软删不可见）、AI 会话 930001~930003（930002 进行中，含消息
// 940006~940011，SYSTEM/USER/ASSISTANT/TOOL 三轮完整覆盖）、AI 报告
// 950001~950002、参考资料 970001~970003（970002 含下载入口）。
// 分页用例以本次运行唯一故障码（RUN_ID）自建 12 行跑满两页，清理经
// deleteMyRepairRequest 逐 ID 软删（幂等成功后行对列表/详情不可见），
// 共享开发库不做物理删除（与 reference-document-real.spec 同一安全边界）。
// 前提不满足（无本地后端 / 无 env / 无前端真实通道）时用例自动跳过，不阻塞。
//
// 断言作用域注意：Tabs 非激活面板保持挂载（仅隐藏），因此所有标签内
// 定位一律收口到 .ant-tabs-tabpane-active（激活面板），Drawer 内容经
// portal 渲染在面板外，单独用 .ant-drawer-content 收口。

import { expect, test, type Page } from '@playwright/test';

import {
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
  realGraphqlCall,
} from './helpers/real-backend';

const PAGE_PATH = '/admin/document-database';

// ---- seed 行（backend/scripts/seed-mock.ts，只读断言） ----

/** 申请编号筛选关键字：只命中 5 行 seed（后端生成编号格式不同，不可能撞） */
const SEED_REQUEST_KEYWORD = 'MOCK-RR-2026';
const SEED_VISIBLE_REQUEST_NOS = [
  'MOCK-RR-2026-0001',
  'MOCK-RR-2026-0002',
  'MOCK-RR-2026-0003',
  'MOCK-RR-2026-0005',
] as const;
const SEED_DELETED_REQUEST_NO = 'MOCK-RR-2026-0004';
const SEED_ACTIVE_CONVERSATION_REQUEST_NO = 'MOCK-RR-2026-0003'; // 会话 930002（ACTIVE）
const SEED_FAULT_DIAGNOSIS_REPORT_TITLE = 'E-LASER-207 故障诊断报告'; // 950001
const SEED_INTERIM_REPORT_TITLE = '扫描台位置误差阶段性分析'; // 950002

// ---- 分页夹具（本次运行唯一，清理以它为反查边界） ----

/** 本次运行唯一标识：并入故障码，跨运行/并行执行永不撞名 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const RUN_ERROR_CODE = `E2EADM-${RUN_ID}`;
const RUN_REQUEST_COUNT = 12; // pageSize 10 → 第 1 页 10 行 + 第 2 页 2 行

// ---- GraphQL（Node 侧夹具准备 / 清理 / 对照） ----

const STATS_QUERY = `
  query AdminDocumentDatabaseStatsE2E {
    adminDocumentDatabaseStats {
      repairRequestTotal
      referenceDocumentTotal
      aiConversationTotal
      aiReportTotal
    }
  }
`;

const ADMIN_REPAIR_LIST_QUERY = `
  query AdminRepairRequestsE2E($pagination: PaginationArgs!, $filter: AdminRepairRequestFilterInput) {
    adminRepairRequests(pagination: $pagination, filter: $filter) {
      items { id requestNo }
      total
    }
  }
`;

const EQUIPMENT_MODELS_QUERY = `
  query EquipmentModelsForE2E {
    equipmentModels { id modelCode }
  }
`;

const CREATE_REQUEST_MUTATION = `
  mutation CreateRepairRequestE2E($input: CreateRepairRequestInput!) {
    createRepairRequest(input: $input) { id requestNo }
  }
`;

/** 客户软删自己的未接单申请（幂等成功）——分页夹具的清理通道 */
const DELETE_MY_REQUEST_MUTATION = `
  mutation DeleteMyRepairRequestE2E($id: Int!) {
    deleteMyRepairRequest(id: $id) { id }
  }
`;

// ---- helpers ----

function activePane(page: Page) {
  return page.locator('.ant-tabs-tabpane-active');
}

// AntD v6 的 Drawer 无 .ant-drawer-content 内容类，portal 内同时只有一个 dialog，用角色定位收口
function detailDrawer(page: Page) {
  return page.getByRole('dialog');
}

async function loginAs(
  page: Page,
  env: Record<string, string>,
  loginName: string,
  landingPath: RegExp,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('账号或邮箱').fill(loginName);
  await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).toHaveURL(landingPath);
}

/** 按唯一故障码反查本次运行自建行的精确 ID 列表（管理员视角） */
async function listRunRequestIds(env: Record<string, string>): Promise<number[]> {
  const { body } = await realGraphqlCall(
    env,
    ADMIN_REPAIR_LIST_QUERY,
    {
      filter: { errorCode: RUN_ERROR_CODE },
      pagination: { mode: 'OFFSET', page: 1, pageSize: 50, withTotal: true },
    },
    'mock_super_admin',
  );
  const items = (body as { data?: { adminRepairRequests?: { items?: Array<{ id: number }> } } })
    .data?.adminRepairRequests?.items;

  return (items ?? []).map((item) => item.id);
}

/**
 * 兜底清理（无条件逐 ID 幂等软删；失败仅告警不抛出，避免掩盖主链路原始错误；
 * 残留行已软删不可见，由库策略另行清理——与 reference-document-real.spec 同边界）。
 */
async function cleanupRunRequests(env: Record<string, string>): Promise<void> {
  const ids = await listRunRequestIds(env);

  for (const id of ids) {
    try {
      await realGraphqlCall(env, DELETE_MY_REQUEST_MUTATION, { id }, 'mock_customer_alpha');
    } catch (error) {
      console.warn(`[e2e] 自建申请 ${id} 软删失败：${(error as Error).message}`);
    }
  }

  const remaining = await listRunRequestIds(env);

  if (remaining.length > 0) {
    console.warn(`[e2e] 清理后仍有可见自建行（需人工核查）：${remaining.join(',')}`);
  }
}

test.describe('real backend admin document database', () => {
  test.beforeEach(async () => {
    const env = readBackendEnvOrNull();
    test.skip(
      env === null,
      'backend/env/.env.development 缺失（本地文件，不入库），跳过真实后端用例',
    );
    test.skip(
      !hasFrontendGraphQLEndpoint(),
      '前端真实通道不可达（未配置 VITE_GRAPHQL_ENDPOINT 且 vite dev server 无 /graphql 转发），跳过真实后端用例',
    );
    test.skip(
      !(await isRealBackendAvailable(env as Record<string, string>)),
      '本地后端不可用或不可登录，跳过真实后端用例',
    );
  });

  // 计划表 S4.5 主链路：四标签真实渲染 + 真实统计入卡 + seed 行 + 会话消息详情 +
  // 报告正文 + 参考资料下载入口 + 刷新恢复（seed 只读，无数据写入）
  test('super admin 四标签主链路：真实统计、seed 行、会话消息、报告正文与下载入口', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const env = readBackendEnv();

    // Node 侧先读真实统计：页面四张卡片必须与 API 一致（不硬编码共享库数字）
    const statsResponse = await realGraphqlCall(env, STATS_QUERY, {}, 'mock_super_admin');
    const stats = (
      statsResponse.body as {
        data: { adminDocumentDatabaseStats: Record<string, number> };
      }
    ).data.adminDocumentDatabaseStats;

    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();

    const expectStatCard = (label: string, value: number) =>
      expect(page.locator('.stat-card', { hasText: label }).locator('.stat-card-value')).toHaveText(
        String(value),
      );
    expectStatCard('维修申请', stats.repairRequestTotal);
    expectStatCard('参考资料', stats.referenceDocumentTotal);
    expectStatCard('AI 会话', stats.aiConversationTotal);
    expectStatCard('AI 报告', stats.aiReportTotal);

    // 维修申请标签：编号前缀收窄到 seed 行，已软删的 920004 不可见，真实 total
    await page.getByRole('tab', { name: '维修申请' }).click();
    await activePane(page).getByPlaceholder('按申请编号搜索').fill(SEED_REQUEST_KEYWORD);
    for (const requestNo of SEED_VISIBLE_REQUEST_NOS) {
      await expect(activePane(page).getByRole('cell', { name: requestNo })).toBeVisible();
    }
    await expect(activePane(page).getByRole('cell', { name: SEED_DELETED_REQUEST_NO })).toHaveCount(
      0,
    );

    // AI 会话标签：组合筛选（关联申请编号 + 会话状态=进行中）唯一定位 seed 930002
    await page.getByRole('tab', { name: 'AI 会话' }).click();
    await activePane(page)
      .getByPlaceholder('按关联申请编号搜索')
      .fill(SEED_ACTIVE_CONVERSATION_REQUEST_NO);
    await activePane(page).getByRole('combobox').click();
    await page.locator('.ant-select-item-option', { hasText: '进行中' }).click();
    await expect(activePane(page).getByText('共 1 条')).toBeVisible();

    // 消息详情 Drawer：服务端 messageSeq ASC 稳定顺序，pageSize 50 单页放下 6 条 seed
    await activePane(page).getByRole('button', { name: '消息详情' }).click();
    await expect(detailDrawer(page).getByText('会话消息详情')).toBeVisible();
    await expect(detailDrawer(page).getByText('共 6 条')).toBeVisible();
    await expect(detailDrawer(page).getByText(/你是光刻机扫描台故障诊断助手/)).toBeVisible();
    await expect(detailDrawer(page).getByText(/NXT:2000i 高速扫描时/)).toBeVisible();
    // seed 覆盖四类角色标签（系统开场 / 工程师提问 / AI 回答 / 工具观测）；
    // 工程师/AI 助手标签各出现两轮，取首个断言可见性
    await expect(detailDrawer(page).getByText('系统', { exact: true })).toBeVisible();
    await expect(detailDrawer(page).getByText('工程师', { exact: true }).first()).toBeVisible();
    await expect(detailDrawer(page).getByText('AI 助手', { exact: true }).first()).toBeVisible();
    await expect(detailDrawer(page).getByText('工具', { exact: true })).toBeVisible();
    // 关闭 Drawer（遮罩会拦截后续 tab 点击），等 portal 移除后再切换
    await detailDrawer(page).getByRole('button', { name: 'Close' }).click();
    await expect(detailDrawer(page)).toHaveCount(0);

    // AI 报告标签：报告类型筛选唯一定位 seed 950001，正文 Drawer 含权威 requestNo
    await page.getByRole('tab', { name: 'AI 报告' }).click();
    await activePane(page).getByPlaceholder('按报告类型筛选').fill('FAULT_DIAGNOSIS');
    await expect(
      activePane(page).getByRole('cell', { name: SEED_FAULT_DIAGNOSIS_REPORT_TITLE }),
    ).toBeVisible();
    await expect(
      activePane(page).getByRole('cell', { name: SEED_INTERIM_REPORT_TITLE }),
    ).toHaveCount(0);
    await activePane(page).getByRole('button', { name: '正文' }).click();
    await expect(detailDrawer(page).getByText(/能量传感器窗口污染导致读数漂移/)).toBeVisible();
    await expect(detailDrawer(page).getByText(/关联申请 MOCK-RR-2026-0002/)).toBeVisible();
    await detailDrawer(page).getByRole('button', { name: 'Close' }).click();
    await expect(detailDrawer(page)).toHaveCount(0);

    // 参考资料标签：seed 行可达，含原始文件名的行进详情后下载入口可见（不点击下载，
    // 下载字节链路由 reference-document-real.spec 覆盖）
    await page.getByRole('tab', { name: '参考资料' }).click();
    await activePane(page).getByText('NXE:3400C 光源维护指南（Mock）').click();
    await expect(page).toHaveURL(/\/reference-documents\/\d+$/);
    await expect(page.getByRole('button', { name: /下载文件/ })).toBeVisible();

    // 刷新：只读聚合页恢复默认态（统计与默认标签重新加载）
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();
    expectStatCard('AI 报告', stats.aiReportTotal);
    await expect(page.getByRole('tab', { name: '参考资料' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  // 计划表 S4.5：组合筛选收窄、无命中空态、筛选清空恢复（seed 只读）
  test('组合筛选收窄、空态与清空恢复', async ({ page }) => {
    test.setTimeout(60_000);
    const env = readBackendEnv();

    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);

    // 维修申请：故障码等值筛选（后端 errorCode 契约为等值匹配，非 LIKE）+ 接单状态组合
    // seed 0001 = E-CHUCK-101 待接单，0002 = E-LASER-207 已接单
    await page.getByRole('tab', { name: '维修申请' }).click();
    await activePane(page).getByPlaceholder('按故障码搜索').fill('E-CHUCK-101');
    await expect(activePane(page).getByRole('cell', { name: 'MOCK-RR-2026-0001' })).toBeVisible();
    await activePane(page).getByRole('combobox').nth(0).click();
    await page.locator('.ant-select-item-option', { hasText: '待接单' }).click();
    await expect(activePane(page).getByRole('cell', { name: 'MOCK-RR-2026-0001' })).toBeVisible();
    await expect(activePane(page).getByRole('cell', { name: 'MOCK-RR-2026-0002' })).toHaveCount(0);

    // 无命中 → 正式空态文案（不报错、不残留旧数据）
    await activePane(page).getByPlaceholder('按故障码搜索').fill('E2E-无命中-999');
    await expect(activePane(page).getByText('没有符合筛选条件的维修申请。')).toBeVisible();

    // 清空故障码：恢复到「待接单 + 无故障码」的组合结果
    await activePane(page).getByPlaceholder('按故障码搜索').fill('');
    await expect(activePane(page).getByText('没有符合筛选条件的维修申请。')).toHaveCount(0);
    await expect(activePane(page).getByRole('cell', { name: 'MOCK-RR-2026-0001' })).toBeVisible();

    // 清除接单状态（AntD allowClear：hover 后出现清除按钮）→ 已接单行恢复可见
    await activePane(page).getByRole('combobox').nth(0).hover();
    await activePane(page).locator('.ant-select-clear').click();
    await expect(activePane(page).getByRole('cell', { name: 'MOCK-RR-2026-0002' })).toBeVisible();

    // AI 会话：状态筛选已完成 → 进行中标签消失；清空恢复
    await page.getByRole('tab', { name: 'AI 会话' }).click();
    await activePane(page).getByRole('combobox').click();
    await page.locator('.ant-select-item-option', { hasText: '已完成' }).click();
    await expect(activePane(page).getByText('进行中', { exact: true })).toHaveCount(0);
    await expect(
      activePane(page).getByRole('cell', { name: 'MOCK-RR-2026-0002' }).first(),
    ).toBeVisible();
    await activePane(page).getByRole('combobox').hover();
    await activePane(page).locator('.ant-select-clear').click();
    await expect(activePane(page).getByText('进行中', { exact: true })).toBeVisible();
  });

  // 计划表 S4.5 分页：共享库 seed 行数不足一页，用运行唯一故障码自建 12 行
  // 跑满两页断言翻页与真实 total；finally 按 API 反查的精确 ID 幂等软删清理
  test('分页：运行唯一故障码自建 12 行跑满两页（清理后筛选归零）', async ({ page }) => {
    test.setTimeout(120_000);
    const env = readBackendEnv();

    // 夹具准备：公开 equipmentModels 取型号；客户甲真实创建 12 条自建申请
    const modelsResponse = await realGraphqlCall(
      env,
      EQUIPMENT_MODELS_QUERY,
      {},
      'mock_super_admin',
    );
    const models = (modelsResponse.body as { data?: { equipmentModels?: Array<{ id: number }> } })
      .data?.equipmentModels;
    const modelId = models?.[0]?.id;
    expect(modelId).toBeDefined();

    for (let index = 0; index < RUN_REQUEST_COUNT; index += 1) {
      const created = await realGraphqlCall(
        env,
        CREATE_REQUEST_MUTATION,
        {
          input: {
            equipmentModelId: modelId,
            errorCode: RUN_ERROR_CODE,
            faultDescription: `PR3 S4 分页夹具 #${index + 1}`,
          },
        },
        'mock_customer_alpha',
      );
      expect((created.body as { errors?: unknown[] }).errors).toBeUndefined();
    }

    try {
      await loginAs(page, env, 'mock_super_admin', /\/admin$/);
      await page.goto(PAGE_PATH);
      await page.getByRole('tab', { name: '维修申请' }).click();
      await activePane(page).getByPlaceholder('按故障码搜索').fill(RUN_ERROR_CODE);

      // 第 1 页：真实 total 12，pageSize 10 → 10 行 + 两页指示
      await expect(activePane(page).getByText(`共 ${RUN_REQUEST_COUNT} 条`)).toBeVisible();
      await expect(activePane(page).locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(10);

      // 翻到第 2 页：余 2 行，total 不变，页码高亮
      await activePane(page).locator('.ant-pagination-item-2').click();
      await expect(activePane(page).locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(2);
      await expect(activePane(page).getByText(`共 ${RUN_REQUEST_COUNT} 条`)).toBeVisible();
      await expect(activePane(page).locator('.ant-pagination-item-2')).toHaveClass(
        /ant-pagination-item-active/,
      );
    } finally {
      await cleanupRunRequests(env);
    }
  });

  // 角色边界（与后端 e2e 角色矩阵呼应的浏览器侧口径）：
  // customer 无导航入口、直访被安全跳转回个人主页、越权直调 GraphQL FORBIDDEN
  test('customer 越权被拦截：无导航入口、页面重定向与 GraphQL FORBIDDEN', async ({ page }) => {
    const env = readBackendEnv();

    await loginAs(page, env, 'mock_customer_alpha', /\/customer$/);
    await expect(
      page.getByRole('navigation', { name: '主导航' }).getByText('文档数据库'),
    ).toHaveCount(0);

    await page.goto(PAGE_PATH);
    await expect(page).toHaveURL(/\/customer$/);

    const denied = await realGraphqlCall(
      env,
      ADMIN_REPAIR_LIST_QUERY,
      { pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true } },
      'mock_customer_alpha',
    );
    const errors = (denied.body as { errors?: Array<{ extensions?: { code?: string } }> }).errors;
    expect(errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  // 计划表 S4.5：1366×768 视口本页无横向滚动且退出登录可达
  test('1366×768 视口：文档数据库页无横向滚动且退出入口可达', async ({ page }) => {
    const env = readBackendEnv();

    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();
    await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible();

    // 表格列宽超出走 AntD 表格内部横向滚动（scroll.x），页面本体不得溢出视口
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(0);
  });
});
