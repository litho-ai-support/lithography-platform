// e2e/customer-visual.spec.ts
//
// PR5 S1 客户工作台首页视觉验收（无后端确定性版本）：会话由 helpers/auth-session-seed
// 预置，GraphQL 按 operationName 应答（首页 create 态工作台只发起两类查询：
// 左栏我的申请列表 + 表单设备型号），不依赖真实后端、开发库或 backend/env/.env.development，
// fresh clone 直接可跑。真实前后端链路（登录 + 完整客户闭环）由 repair-request-manage-real.spec.ts
// 承担，职责分离。
//
// 验收内容（PR5 计划表 S1 / §0 设计裁定）：
// - 四视口（375×667 窄视口 + 1366×768 / 1440×900 / 1920×1080）整页截图，
//   物理尺寸严格等于指定视口；窄视口用于保护任务书「长文本不破坏布局」在最小宽度下成立；
// - 页头固定：眉题 Customer Workspace 与基准蓝 #2563eb、标题恒为「客户页面」、
//   面向使用者的说明（不暴露实现细节）；四个客户 URL 复用同一页头；
// - 正式化：不存在「临时落地页」开发文案；
// - 整合工作台装配：create 态左栏「我的维修申请」列表上下文 + 右栏创建表单，
//   不含假统计卡片与演示数据（.stat-card 为统计卡片唯一落点）；
// - 工作台几何（PR5 计划 §0）：≥960px 双栏 minmax(280px, 320px) + 16px + minmax(0, 1fr)，
//   1440×900 左列 320px / 右列 = 容器 - 336；<960px 单面板（create 态隐藏左栏、
//   表单与「查看我的维修申请」窄屏入口可见）；
// - 主按钮半径为 8px（--radius-action，PR3 第三轮统一规则）；
// - 全部视口均无整页横向滚动。
//
// 遗留修复（2026-09-30 布局计划 S1/S2）：三模式左右卡片外边界等高（1440×900 高度/顶部/
// 底部差 ≤1px）、375/1366/1440/1920 四宽度布局实测 JSON、模式切换无跳动、深链刷新与
// 前进后退保态、兼容路由 /customer/repair-requests/new；截图一律经 helpers/visual-evidence
// 的 captureStableViewport 采集（截图前滚动复位到页面顶部 + 构图元数据随 JSON 落盘）。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR/PR5-证据（本地可追溯，不随 PR 提交）。

import { expect, type Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { seedAuthSession } from './helpers/auth-session-seed';
import {
  CUSTOMER_MOCK_ROUTES,
  installCustomerRepairRequestMocks,
  readUnregisteredOperations,
} from './helpers/customer-repair-request-mocks';
import {
  assertCleanWorkspaceForEvidence,
  buildEvidenceFileName,
  captureStableViewport,
  readPngDimensions,
  waitForFontsReady,
} from './helpers/visual-evidence';

const PAGE_PATH = '/customer';
const ROLE = 'CUSTOMER';
const EYEBROW_TEXT = 'Customer Workspace';
const EYEBROW_BLUE = 'rgb(37, 99, 235)'; // --eyebrow-text #2563eb
const ACTION_RADIUS = '8px'; // --radius-action

/** 960px 单双栏断点（index.css `.customer-workspace-grid` 媒体查询口径） */
const DUAL_PANE_MIN_WIDTH = 960;

/**
 * 视口清单。窄视口 375×667 排在最前：任务书要求「长文本不破坏布局」，
 * 最小宽度是唯一能暴露整页横滚的档位；1366/1440 为基准 §1 锁定视口，1920 为超宽兜底。
 */
const VIEWPORTS = [
  { height: 667, label: '375x667', width: 375 },
  { height: 1080, label: '1920x1080', width: 1920 },
  { height: 900, label: '1440x900', width: 1440 },
  { height: 768, label: '1366x768', width: 1366 },
] as const;

/**
 * GraphQL stub（按 operationName 分发）。create 态工作台只发起两类查询：
 * 左栏列表（MyRepairRequests）与表单型号（EquipmentModels）；
 * 未登记的 operation 留痕并在断言中失败关闭（不得用空 data 兜底）。
 */
const HOME_GRAPHQL_STUBS: Record<string, unknown> = {
  EquipmentModels: {
    equipmentModels: [
      { id: 900301, modelCode: 'LS-100', modelName: '光刻机 A' },
      { id: 900302, modelCode: 'LS-200', modelName: '光刻机 B' },
    ],
  },
  MyRepairRequests: { myRepairRequests: { items: [], page: 1, pageSize: 10, total: 0 } },
};

const unregisteredOperations: string[] = [];

test.beforeEach(async ({ page }) => {
  unregisteredOperations.length = 0;

  await page.route('**/graphql', async (route) => {
    const requestBody = route.request().postDataJSON() as { operationName?: string } | null;
    const operationName = requestBody?.operationName ?? '';
    const stub = HOME_GRAPHQL_STUBS[operationName];

    if (stub === undefined) {
      unregisteredOperations.push(operationName);
      await route.fulfill({
        body: JSON.stringify({
          errors: [{ message: `customer-visual 未登记 operation：${operationName}` }],
        }),
        contentType: 'application/json',
        status: 200,
      });

      return;
    }

    await route.fulfill({
      body: JSON.stringify({ data: stub }),
      contentType: 'application/json',
      status: 200,
    });
  });
});

test.afterEach(() => {
  expect(unregisteredOperations, '存在未登记的 GraphQL operation').toEqual([]);
});

/** 工作台主网格几何：列宽、列距与左右栏实际宽度（PR5 计划 §0 数值口径）。 */
function measureWorkspaceGrid(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.customer-workspace-grid');

    if (!grid) {
      throw new Error('工作台主网格 .customer-workspace-grid 缺失');
    }

    const style = getComputedStyle(grid);
    const listPane = grid.querySelector('.customer-workspace-list-pane');
    const detailPane = grid.querySelector('.customer-workspace-detail-pane');

    return {
      columnGap: parseFloat(style.columnGap),
      columns: style.gridTemplateColumns.split(' ').map((value) => parseFloat(value)),
      detailWidth: detailPane?.getBoundingClientRect().width ?? 0,
      gridWidth: grid.getBoundingClientRect().width,
      listDisplay: listPane ? getComputedStyle(listPane).display : 'missing',
      listWidth: listPane?.getBoundingClientRect().width ?? 0,
      mode: grid.getAttribute('data-mode'),
    };
  });
}

test('客户工作台首页视觉：四视口截图 + 固定页头与工作台几何（PR5 S1）', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });

  await seedAuthSession(page, ROLE);
  const capturedAt = new Date();
  const evidence: Record<string, unknown> = {};

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto(PAGE_PATH);
    await waitForFontsReady(page);

    // 固定页头（四个客户 URL 共用）：眉题文案与基准蓝、标题恒为「客户页面」
    const eyebrow = page.locator('.page-eyebrow');
    await expect(eyebrow).toHaveText(EYEBROW_TEXT);
    expect(await eyebrow.evaluate((el) => getComputedStyle(el).color)).toBe(EYEBROW_BLUE);
    await expect(page.locator('.page-title')).toHaveText('客户页面');

    // 正式化：开发期文案不得出现（每个视口都核对，防响应式分支漏改）
    await expect(page.getByText(/临时落地页/)).toHaveCount(0);

    // create 态装配：右栏创建表单就绪（型号已返回 → 提交可用）；无假统计卡片
    //（空列表 mock 下左栏空态也有同名按钮，页头断言限定 .page-header 避免歧义）
    await expect(
      page.locator('.page-header').getByRole('button', { name: '发起维修申请' }),
    ).toBeVisible();
    await expect(page.getByRole('combobox')).toBeEnabled();
    await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
    await expect(page.locator('.stat-card')).toHaveCount(0);
    // 左栏列表上下文 + 右栏表单各一张卡（窄屏左栏 display:none 但仍在 DOM，数量不变）
    await expect(page.locator('.data-card')).toHaveCount(2);

    // 工作台几何（PR5 计划 §0）：≥960 双栏（左列钳制在 280-320 + 16px 列距），
    // <960 单面板（create 态隐藏左栏，提供窄屏「查看我的维修申请」入口）
    const grid = await measureWorkspaceGrid(page);

    expect(grid.mode).toBe('create');

    if (viewport.width >= DUAL_PANE_MIN_WIDTH) {
      expect(grid.columns, `${viewport.label} 应为双栏`).toHaveLength(2);
      expect(grid.columnGap, `${viewport.label} 列距应为 16px`).toBe(16);
      expect(
        grid.listWidth,
        `${viewport.label} 左列应钳制在 minmax(280px, 320px)`,
      ).toBeGreaterThanOrEqual(280);
      expect(grid.listWidth).toBeLessThanOrEqual(320);
      expect(
        grid.listWidth + grid.columnGap + grid.detailWidth,
        `${viewport.label} 双栏应占满容器宽`,
      ).toBeCloseTo(grid.gridWidth, 0);
      await expect(page.getByRole('button', { name: '我的维修申请' })).toBeVisible();

      // 基准视口左列取上限 320px（可用空间充足时 minmax 上界生效）
      if (viewport.width >= 1440) {
        expect(grid.listWidth, `${viewport.label} 左列应为 320px`).toBe(320);
      }
    } else {
      expect(grid.columns, `${viewport.label} 应为单列`).toHaveLength(1);
      expect(grid.listDisplay, `${viewport.label} create 态应隐藏左栏`).toBe('none');
      await expect(page.getByRole('button', { name: '查看我的维修申请' })).toBeVisible();
    }

    // 主按钮半径规则（--radius-action；同上限定页头，避免命中左栏空态同名按钮）
    const primaryRadius = await page
      .locator('.page-header')
      .getByRole('button', { name: '发起维修申请' })
      .evaluate((el) => getComputedStyle(el).borderRadius);
    expect(primaryRadius, '主按钮半径规则').toBe(ACTION_RADIUS);

    // 无整页横向滚动（窄视口由最外层布局与工作台单面板保证）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${viewport.label} 不应出现横向滚动`).toBeLessThanOrEqual(0);

    const fileName = buildEvidenceFileName({
      area: 'customer-home',
      capturedAt,
      role: ROLE,
      viewportLabel: viewport.label,
    });
    const pngPath = path.join(evidenceDir, fileName);
    const capture = await captureStableViewport(page, { fileName, filePath: pngPath });
    const png = readPngDimensions(pngPath);
    expect(png).toEqual({ height: viewport.height, width: viewport.width });

    evidence[viewport.label] = { capture, fileName, grid, overflow, png };
  }

  const evidenceJson = path.join(evidenceDir, 'customer-visual-evidence.json');
  writeFileSync(
    evidenceJson,
    JSON.stringify(
      { capturedAt: capturedAt.toISOString(), role: ROLE, viewports: evidence },
      null,
      2,
    ),
  );
  console.log(`[visual-evidence] ${evidenceJson}`);
});

/** 左右卡片外边界（同一测量批次内的视口坐标；高度不受滚动影响）。 */
type WorkspaceBox = { bottom: number; height: number; top: number };

/** 三模式定义：路径 + 就绪等待（就绪后才测量，避免骨架与内容高度混算）。 */
const LAYOUT_MODES = [
  {
    expectReady: async (page: Page) => {
      await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
      await expect(page.locator('.activity-item')).toHaveCount(2);
    },
    id: 'create',
    path: '/customer',
  },
  {
    expectReady: async (page: Page) => {
      await expect(page.locator('.activity-item')).toHaveCount(2);
      // 列表态右栏详情为异步加载：就绪口径同 pr5-responsive（骨架结束 + 首条编号到位）；
      // 窄视口下右栏被 CSS 收起，故用 toContainText（对隐藏元素同样有效）而非可见性断言
      await expect(page.locator('.customer-workspace-detail-pane')).toContainText(
        'MOCK-RR-2026-0001',
      );
      await expect(page.locator('.customer-workspace-detail-pane .ant-skeleton')).toHaveCount(0);
    },
    id: 'history-list',
    path: '/customer/repair-requests',
  },
  {
    expectReady: async (page: Page) => {
      await expect(page.getByText('工程师回复（2）')).toBeVisible();
    },
    id: 'history-detail',
    path: '/customer/repair-requests/920002',
  },
] as const;

/** 读取左右 pane 直接 DataCard 的外边界；display:none 的隐藏 pane 返回 null。 */
function readWorkspaceBoxes(page: Page): Promise<{
  detail: WorkspaceBox | null;
  gridBottom: number;
  gridTop: number;
  list: WorkspaceBox | null;
}> {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 100) / 100;
    const readBox = (paneSelector: string) => {
      const el = document.querySelector(`${paneSelector} > .data-card`);

      if (!el) {
        return null;
      }

      const rect = el.getBoundingClientRect();

      if (rect.height === 0 && rect.width === 0) {
        return null; // 隐藏 pane（display:none）
      }

      return { bottom: round(rect.bottom), height: round(rect.height), top: round(rect.top) };
    };
    const grid = document.querySelector('.customer-workspace-grid');
    const gridRect = grid?.getBoundingClientRect();

    return {
      detail: readBox('.customer-workspace-detail-pane'),
      gridBottom: gridRect ? round(gridRect.bottom) : 0,
      gridTop: gridRect ? round(gridRect.top) : 0,
      list: readBox('.customer-workspace-list-pane'),
    };
  });
}

test('工作台布局实测：三模式左右等高、四宽度无横溢、切换稳定与深链回归（S1 遗留修复）', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);

  // P2-1：布局证据同属提交级证据，工作区脏则失败关闭（先于 4 分钟测量，尽早暴露）
  const gitSha = assertCleanWorkspaceForEvidence('workspace-layout-evidence.json');

  const capturedAt = new Date();
  const measurements: Record<
    string,
    Record<string, { boxes: Awaited<ReturnType<typeof readWorkspaceBoxes>>; overflow: number }>
  > = {};

  // 该用例改用客户工作台完整 mock（同 states / pr5-responsive 口径）：
  // 先卸掉 beforeEach 的首页最小 stub，避免路由叠加
  await page.unroute(CUSTOMER_MOCK_ROUTES);
  await installCustomerRepairRequestMocks(page, {});
  await seedAuthSession(page, ROLE);

  for (const viewport of VIEWPORTS) {
    for (const mode of LAYOUT_MODES) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await page.goto(mode.path);
      await waitForFontsReady(page);
      await mode.expectReady(page);

      measurements[viewport.label] ??= {};
      measurements[viewport.label][mode.id] = {
        boxes: await readWorkspaceBoxes(page),
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      };
    }
  }

  // 切换稳定（1440×900）：create → 历史列表 → 详情 → 恢复 create 全程同页，
  // 无第二页头、网格顶部不跳动
  const switchTrail: Record<string, unknown>[] = [];
  const gridLocator = page.locator('.customer-workspace-grid');

  const recordSwitch = async (step: string) => {
    switchTrail.push({
      ...(await page.evaluate(() => {
        const gridEl = document.querySelector('.customer-workspace-grid');
        const gridRect = gridEl?.getBoundingClientRect();
        const round = (value: number) => Math.round(value * 100) / 100;

        return {
          gridTop: gridRect ? round(gridRect.top + window.scrollY) : null,
          headerCount: document.querySelectorAll('.page-header').length,
          mode: gridEl?.getAttribute('data-mode') ?? null,
          titleCount: document.querySelectorAll('.page-title').length,
        };
      })),
      step,
    });
  };

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/customer');
  await waitForFontsReady(page);
  await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
  await expect(page.locator('.activity-item')).toHaveCount(2);
  await recordSwitch('create');

  await page.locator('.customer-workspace-list-heading').click();
  await expect(gridLocator).toHaveAttribute('data-mode', 'history-list');
  await expect(page.locator('.customer-workspace-detail-pane .ant-skeleton')).toHaveCount(0);
  await recordSwitch('history-list');

  await page.locator('.customer-workspace-item-main').first().click();
  await expect(gridLocator).toHaveAttribute('data-mode', 'history-detail');
  await expect(
    page.locator('.customer-workspace-detail-pane').getByText('MOCK-RR-2026-0001'),
  ).toBeVisible();
  await recordSwitch('history-detail');

  await page.locator('.page-header').getByRole('button', { name: '发起维修申请' }).click();
  await expect(gridLocator).toHaveAttribute('data-mode', 'create');
  await recordSwitch('create-restored');

  // 前进/后退：历史栈 … → 列表 → 详情 → create；goBack 回详情、goForward 再回 create
  await page.goBack();
  await expect(gridLocator).toHaveAttribute('data-mode', 'history-detail');
  await expect(
    page.locator('.customer-workspace-detail-pane').getByText('MOCK-RR-2026-0001'),
  ).toBeVisible();
  await page.goForward();
  await expect(gridLocator).toHaveAttribute('data-mode', 'create');
  await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();

  // 兼容路由 /customer/repair-requests/new 与详情深链刷新
  await page.goto('/customer/repair-requests/new');
  await waitForFontsReady(page);
  await expect(gridLocator).toHaveAttribute('data-mode', 'create');
  await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();

  await page.goto('/customer/repair-requests/920002');
  await waitForFontsReady(page);
  await expect(page.getByText('工程师回复（2）')).toBeVisible();
  await page.reload();
  await waitForFontsReady(page);
  await expect(gridLocator).toHaveAttribute('data-mode', 'history-detail');
  await expect(page.getByText('工程师回复（2）')).toBeVisible();

  writeFileSync(
    path.join(testInfo.outputPath(), 'workspace-layout-evidence.json'),
    JSON.stringify(
      {
        capturedAt: capturedAt.toISOString(),
        gitSha,
        navChecks: { backForward: true, compatRoute: true, deepLinkReload: true },
        role: ROLE,
        switchTrail,
        widths: measurements,
      },
      null,
      2,
    ),
  );

  // —— 断言扫描（数据已落盘，失败可回看 JSON）——
  for (const [label, modes] of Object.entries(measurements)) {
    const width = Number.parseInt(label, 10);

    for (const [modeId, entry] of Object.entries(modes)) {
      expect(entry.overflow, `${label} ${modeId} 不应出现整页横向滚动`).toBeLessThanOrEqual(0);

      if (width >= DUAL_PANE_MIN_WIDTH) {
        expect(entry.boxes.list, `${label} ${modeId} 双栏应同时存在左右卡片`).not.toBeNull();
        expect(entry.boxes.detail, `${label} ${modeId} 双栏应同时存在左右卡片`).not.toBeNull();

        const list = entry.boxes.list as WorkspaceBox;
        const detail = entry.boxes.detail as WorkspaceBox;

        expect(
          Math.abs(list.height - detail.height),
          `${label} ${modeId} 左右卡片外边界高度差应 ≤1px`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(list.top - detail.top),
          `${label} ${modeId} 左右卡片顶部应对齐`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(list.bottom - detail.bottom),
          `${label} ${modeId} 左右卡片底部应对齐`,
        ).toBeLessThanOrEqual(1);
      } else {
        const visible = entry.boxes.list ?? entry.boxes.detail;

        expect(visible, `${label} ${modeId} 单面板应有可见卡片`).not.toBeNull();
        expect(
          Math.abs(
            (visible as WorkspaceBox).height - (entry.boxes.gridBottom - entry.boxes.gridTop),
          ),
          `${label} ${modeId} 单面板卡片应贴合网格高度（不继承桌面最小高度）`,
        ).toBeLessThanOrEqual(1);
      }
    }
  }

  expect(
    switchTrail.map((step) => step.mode),
    '切换序列应为 create → history-list → history-detail → create',
  ).toEqual(['create', 'history-list', 'history-detail', 'create']);

  for (const step of switchTrail) {
    expect(step.titleCount, `${step.step} 全程应只有一份页面标题（无第二 PageHeader）`).toBe(1);
    expect(step.headerCount, `${step.step} 全程应只有一份 .page-header`).toBe(1);
  }

  const firstGridTop = switchTrail[0]?.gridTop as number;

  for (const step of switchTrail) {
    expect(
      Math.abs((step.gridTop as number) - firstGridTop),
      `${step.step} 切换时网格顶部不得跳动`,
    ).toBeLessThanOrEqual(1);
  }

  expect(readUnregisteredOperations(page), '未登记的 GraphQL operationName').toEqual([]);
});
