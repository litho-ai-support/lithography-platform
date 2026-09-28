// e2e/customer-visual.spec.ts
//
// PR5 S1 客户工作台首页视觉验收（无后端确定性版本）：会话由 helpers/auth-session-seed
// 预置，GraphQL 一律 stub（客户首页只保留两条真实业务入口，不发任何业务查询），
// 不依赖真实后端、开发库或 backend/env/.env.development，fresh clone 直接可跑。
// 真实前后端链路（登录 + 完整客户闭环）由 repair-request-manage-real.spec.ts 承担，职责分离。
//
// 验收内容（PR5 计划表 S1）：
// - 四视口（375×667 窄视口 + 1366×768 / 1440×900 / 1920×1080）整页截图，
//   物理尺寸严格等于指定视口；窄视口用于保护任务书「长文本不破坏布局」在最小宽度下成立；
// - 页头：眉题 Customer Workspace 与基准蓝 #2563eb、标题、面向使用者的说明（不暴露实现细节）；
// - 正式化：不存在「临时落地页」开发文案、不挂载开发式会话面板；
// - 两条真实业务入口（发起维修申请 / 维修申请列表）齐备，不含假统计卡片与演示数据；
// - 主按钮半径为 8px（--radius-action，PR3 第三轮统一规则）；
// - 全部视口均无整页横向滚动。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR/PR5-证据（本地可追溯，不随 PR 提交）。

import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { seedAuthSession } from './helpers/auth-session-seed';
import {
  buildEvidenceFileName,
  readPngDimensions,
  waitForFontsReady,
} from './helpers/visual-evidence';

const PAGE_PATH = '/customer';
const ROLE = 'CUSTOMER';
const EYEBROW_TEXT = 'Customer Workspace';
const EYEBROW_BLUE = 'rgb(37, 99, 235)'; // --eyebrow-text #2563eb
const ACTION_RADIUS = '8px'; // --radius-action

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
 * GraphQL stub。**客户首页正式化后零业务查询**（身份来自本地会话视图），
 * 故此处的 `{ data: {} }` 只作「意外请求不落到真实网络」的兜底，不会喂给任何 mapper。
 * 若后续在本 spec 扩展列表/详情等数据页断言，必须先把它替换为按 operationName 分发的
 * 真实形状 stub —— 参考 visual-shell.spec.ts 的既有告警：空 data 会被 mapper 判为
 * 外部契约异常，污染日志并掩盖真实报错。
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/graphql', (route) =>
    route.fulfill({
      body: JSON.stringify({ data: {} }),
      contentType: 'application/json',
      status: 200,
    }),
  );
});

test('客户工作台首页视觉：四视口截图 + 正式化与入口机械断言（PR5 S1）', async ({
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

    // 页头：眉题文案与基准蓝
    const eyebrow = page.locator('.page-eyebrow');
    await expect(eyebrow).toHaveText(EYEBROW_TEXT);
    expect(await eyebrow.evaluate((el) => getComputedStyle(el).color)).toBe(EYEBROW_BLUE);
    await expect(page.locator('.page-title')).toHaveText('客户页面');

    // 正式化：开发期文案与空状态面板不得出现（每个视口都核对，防响应式分支漏改）
    await expect(page.getByText(/临时落地页/)).toHaveCount(0);

    // 两条真实业务入口齐备；无假统计卡片（.stat-card 为统计卡片唯一落点）与演示数据
    await expect(page.getByRole('button', { name: '发起维修申请' })).toBeVisible();
    await expect(page.getByRole('button', { name: '查看维修申请' })).toBeVisible();
    await expect(page.locator('.stat-card')).toHaveCount(0);
    await expect(page.locator('.surface-panel')).toHaveCount(2);

    // 主按钮半径规则（--radius-action）
    const primaryRadius = await page
      .getByRole('button', { name: '发起维修申请' })
      .evaluate((el) => getComputedStyle(el).borderRadius);
    expect(primaryRadius, '主按钮半径规则').toBe(ACTION_RADIUS);

    // 无整页横向滚动（窄视口由最外层布局与 flex-wrap 保证）
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
    await page.screenshot({ path: pngPath });
    const png = readPngDimensions(pngPath);
    expect(png).toEqual({ height: viewport.height, width: viewport.width });

    evidence[viewport.label] = { fileName, overflow, png };
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
