// 管理员文档数据库三 Tab 视觉基准验收与证据采集（PR3 负责人 Review R3 要求，
// 0922 复查 B1/B2 增强）。
//
// 验收内容（负责人原文 + 0922 复查补强）：
// - 在最新 SHA、字体加载完成、浏览器 100% 缩放、M 档分别采集维修申请 / AI 会话 /
//   AI 报告三标签在 1440×900 与 1366×768 下共 6 张截图；必须为 viewport 截图，
//   物理尺寸严格等于指定视口（复查 B2：不得用 fullPage 高度替代指定分辨率）；
// - 读取并归档三标签 FilterBar / TableContainer computed styles、FilterBar margin 与
//   两容器的 bounding-rect 实际距离（复查 B1：间距真源为公共组件自带 margin——
//   FilterBar 下缘到其后第一块、TableContainer 上缘到其前一块都必须严格 14px，
//   不得再叠加根层 flex gap），以及 documentElement.scrollWidth - clientWidth <= 0；
// - 维修申请「型号告警态」单独覆盖 FilterBar → 告警 → TableContainer 的行距节奏；
// - 另跑 S→M→L→M 确认 L 无遮挡、回 M 后基准数值恢复。
//
// 截图与 computed-style JSON 写入 testInfo outputPath（frontend/test-results/...），
// 由采集人复制归档到 docs/tmp/PR 证据目录（本地可追溯，不随 PR 提交）。
// 前提（不满足时自动 skip，与 admin-document-database-real.spec.ts 同口径）：
// 本地后端 127.0.0.1:3000 可用、backend/env/.env.development 存在、前端真实通道可用。

import { expect, type Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
} from './helpers/real-backend';

const PAGE_PATH = '/admin/document-database';
const MODEL_WARNING_TEXT = '设备型号选项加载失败';

/** 公共容器行距节奏：FilterBar 自带 margin（12px 0 14px）即唯一边距真源。 */
const CONTAINER_GAP_BASELINE = 14;

// gkj 共享视觉基准（src/index.css token）：三个 Tab 必须复用公共容器而非页面自写样式。
const FILTER_BAR_BASELINE = {
  backgroundColor: 'rgb(248, 250, 252)', // --filter-bar-bg #f8fafc
  borderColor: 'rgb(219, 227, 238)', // --filter-bar-border #dbe3ee
  borderRadius: '10px',
  display: 'flex',
  marginBottom: '14px', // .filter-bar margin: 12px 0 14px
  marginTop: '12px',
  padding: '8px 11px',
};
const TABLE_CONTAINER_BASELINE = {
  backgroundColor: 'rgba(255, 255, 255, 0.92)', // --panel-bg
  borderColor: 'rgb(226, 232, 240)', // --panel-border #e2e8f0
  borderRadius: '14px', // --panel-radius
  boxShadow: 'rgba(15, 23, 42, 0.06) 0px 10px 30px 0px', // --panel-shadow
  padding: '16px',
};

const TABS = [
  { fileStem: 'repair-requests', name: '维修申请' },
  { fileStem: 'ai-conversations', name: 'AI 会话' },
  { fileStem: 'ai-reports', name: 'AI 报告' },
] as const;

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

function activePane(page: Page) {
  return page.locator('.ant-tabs-tabpane-active');
}

/** 点击标签并等待该标签数据态落定（表格行 / 空态 / 错误告警任一出现，骨架屏退场），
    并等 Tabs 下划线（ink bar）过渡动画到位后再取证：
    切换相邻标签时 aria-selected / pane 先变、下划线后到，避免截图定格在过渡中间态。 */
async function focusTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  const pane = activePane(page);
  await expect(pane.locator('.table-container')).toBeVisible();
  await expect(
    pane.locator('.ant-table-tbody tr.ant-table-row, .empty-state, .ant-alert-error').first(),
  ).toBeVisible();
  await page.waitForFunction(() => {
    const inkBar = document.querySelector('.ant-tabs-ink-bar');
    const activeTab = document.querySelector('.ant-tabs-tab-active');
    if (inkBar === null || activeTab === null) return true;
    const ib = inkBar.getBoundingClientRect();
    const at = activeTab.getBoundingClientRect();
    return Math.abs(ib.left - at.left) < 2 && Math.abs(ib.width - at.width) < 2;
  });
}

/** 读取 PNG 物理像素尺寸（IHDR：宽偏移 16、高偏移 20，大端 uint32），
    用于机械断言截图物理尺寸严格等于指定视口（0922 复查 B2）。 */
function readPngDimensions(filePath: string): { height: number; width: number } {
  const buffer = readFileSync(filePath);
  if (
    buffer.length < 24 ||
    buffer.readUInt32BE(0) !== 0x89504e47 ||
    buffer.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    throw new Error(`不是合法 PNG：${filePath}`);
  }
  return { height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) };
}

/** AI 浮动入口（entry-trigger-shell）为全局组件、非 PR3 验收对象：
    按 0922 复查报告建议从取证画面隐藏，减少视觉噪声。 */
async function hideNonPr3FloatingEntry(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.entry-trigger-shell { display: none !important; }' });
}

/** 读取当前激活标签的公共容器 computed style、行距几何与页面横滚余量。 */
async function measureActivePane(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.ant-tabs-tabpane-active');
    if (pane === null) throw new Error('缺少激活标签面板');
    const filterBar = pane.querySelector<HTMLElement>('.filter-bar');
    const container = pane.querySelector<HTMLElement>('.table-container');
    if (filterBar === null || container === null) throw new Error('激活标签缺少公共容器');
    const root = filterBar.parentElement;
    if (root === null) throw new Error('FilterBar 缺少父容器');
    const fb = getComputedStyle(filterBar);
    const tc = getComputedStyle(container);
    // 型号告警（仅维修申请 Tab）以文案识别，不依赖 antd 内部类名
    const warning = Array.from(root.querySelectorAll<HTMLElement>('.ant-alert')).find((el) =>
      (el.textContent ?? '').includes('设备型号选项加载失败'),
    );
    const fbRect = filterBar.getBoundingClientRect();
    const tcRect = container.getBoundingClientRect();
    const nextTop = (warning ?? container).getBoundingClientRect().top;
    const prevBottom = (warning ?? filterBar).getBoundingClientRect().bottom;
    return {
      devicePixelRatio: window.devicePixelRatio,
      dock: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filterBar: {
        backgroundColor: fb.backgroundColor,
        borderColor: fb.borderColor,
        borderRadius: fb.borderRadius,
        display: fb.display,
        marginBottom: fb.marginBottom,
        marginTop: fb.marginTop,
        padding: fb.padding,
      },
      geometry: {
        gapAfterFilterBar: Math.round(nextTop - fbRect.bottom),
        gapBeforeTableContainer: Math.round(tcRect.top - prevBottom),
        modelWarningVisible: warning !== undefined,
        paneTopToFilterBarTop: Math.round(fbRect.top - pane.getBoundingClientRect().top),
        tableContainerRight: Math.round(tcRect.right),
        viewportWidth: document.documentElement.clientWidth,
      },
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      tableContainer: {
        backgroundColor: tc.backgroundColor,
        borderColor: tc.borderColor,
        borderRadius: tc.borderRadius,
        boxShadow: tc.boxShadow,
        padding: tc.padding,
      },
    };
  });
}

function expectBaseline(
  snapshot: Awaited<ReturnType<typeof measureActivePane>>,
  expectedRootFontSize: string,
): void {
  expect(snapshot.rootFontSize).toBe(expectedRootFontSize);
  expect(snapshot.filterBar).toEqual(FILTER_BAR_BASELINE);
  expect(snapshot.tableContainer).toEqual(TABLE_CONTAINER_BASELINE);
  expect(snapshot.dock).toBeLessThanOrEqual(0);
  // 0922 复查 B1：不得叠加根层 flex gap——FilterBar 下缘到其后第一块、
  // TableContainer 上缘到其前一块，都必须严格等于公共组件自带的 14px margin
  expect(snapshot.geometry.gapAfterFilterBar).toBe(CONTAINER_GAP_BASELINE);
  expect(snapshot.geometry.gapBeforeTableContainer).toBe(CONTAINER_GAP_BASELINE);
}

async function expectFontScale(page: Page, label: 'S' | 'M' | 'L'): Promise<void> {
  await expect(page.locator('.app-font-scale-control .ant-segmented-item-selected')).toHaveText(
    label,
  );
}

async function clickFontScale(page: Page, label: 'S' | 'M' | 'L'): Promise<void> {
  await page.locator('.app-font-scale-control').getByText(label, { exact: true }).click();
  await expectFontScale(page, label);
}

test.describe('real backend admin document database - visual baseline', () => {
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

  test('M 档三标签 1440×900 / 1366×768：容器基准、间距节奏与 6 张视口截图', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const env = readBackendEnv();

    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await hideNonPr3FloatingEntry(page);
    await expectFontScale(page, 'M');
    const evidenceDir = testInfo.outputPath();
    mkdirSync(evidenceDir, { recursive: true });

    const evidence: Record<string, unknown> = {};

    for (const viewport of [
      { height: 900, width: 1440 },
      { height: 768, width: 1366 },
    ]) {
      await page.setViewportSize(viewport);
      const tag = `${viewport.width}x${viewport.height}`;

      for (const tab of TABS) {
        await focusTab(page, tab.name);
        const snapshot = await measureActivePane(page);
        // 浏览器 100% 缩放（设备像素比 1）与 M 档基准（root 16px）
        expect(snapshot.devicePixelRatio).toBe(1);
        expectBaseline(snapshot, '16px');
        expect(snapshot.geometry.modelWarningVisible).toBe(false);

        // 复查 B2：viewport 截图（不加 fullPage），物理尺寸必须严格等于指定视口
        const key = `r3-${tab.fileStem}-M-${tag}`;
        const pngPath = testInfo.outputPath(`${key}.png`);
        await page.screenshot({ path: pngPath });
        expect(readPngDimensions(pngPath)).toEqual({
          height: viewport.height,
          width: viewport.width,
        });
        evidence[key] = snapshot;
      }
    }

    const evidenceJson = path.join(evidenceDir, 'r3-computed-styles-M.json');
    writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
    console.log(`[visual-evidence] ${evidenceJson}`);
  });

  test('维修申请型号告警态：FilterBar → 告警 → TableContainer 行距节奏（1440×900）', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const env = readBackendEnv();

    // 仅注入设备型号查询失败（网络层 abort），触发维修申请 Tab 的型号告警，
    // 用于确认告警出现时三者的行距节奏仍以公共 margin 为真源（0922 复查 B1）
    await page.route('**/graphql', async (route) => {
      const postData = route.request().postData() ?? '';
      if (postData.includes('AdminDocumentDatabaseEquipmentModels')) {
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ height: 900, width: 1440 });
    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);
    await page.evaluate(() => document.fonts.ready);
    await hideNonPr3FloatingEntry(page);
    await expectFontScale(page, 'M');
    await focusTab(page, '维修申请');
    await expect(activePane(page).getByText(MODEL_WARNING_TEXT)).toBeVisible();

    const snapshot = await measureActivePane(page);
    expectBaseline(snapshot, '16px');
    expect(snapshot.geometry.modelWarningVisible).toBe(true);

    const pngPath = testInfo.outputPath('r3-repair-requests-M-model-warning-1440x900.png');
    await page.screenshot({ path: pngPath });
    expect(readPngDimensions(pngPath)).toEqual({ height: 900, width: 1440 });

    const evidenceJson = path.join(testInfo.outputPath(), 'r3-computed-styles-model-warning.json');
    writeFileSync(
      evidenceJson,
      JSON.stringify({ 'r3-repair-requests-M-model-warning-1440x900': snapshot }, null, 2),
    );
    console.log(`[visual-evidence] ${evidenceJson}`);
  });

  test('S→M→L→M 往返：L 无遮挡、回 M 基准数值恢复', async ({ page }) => {
    test.setTimeout(60_000);
    const env = readBackendEnv();

    await page.setViewportSize({ height: 900, width: 1440 });
    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);
    await page.evaluate(() => document.fonts.ready);
    await expectFontScale(page, 'M');
    await focusTab(page, '维修申请');

    const baseline = await measureActivePane(page);
    expectBaseline(baseline, '16px');

    await clickFontScale(page, 'S');
    expectBaseline(await measureActivePane(page), '14px');

    await clickFontScale(page, 'L');
    expectBaseline(await measureActivePane(page), '18px');
    // L 档「无遮挡」：筛选栏不内部横向溢出、位于表格面板之上不重叠、容器右缘不越视口
    const largeLayout = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('.ant-tabs-tabpane-active');
      if (pane === null) throw new Error('缺少激活标签面板');
      const filterBar = pane.querySelector<HTMLElement>('.filter-bar');
      const container = pane.querySelector<HTMLElement>('.table-container');
      if (filterBar === null || container === null) throw new Error('激活标签缺少公共容器');
      return {
        containerRight: container.getBoundingClientRect().right,
        filterBarBottom: filterBar.getBoundingClientRect().bottom,
        filterBarInnerOverflow: filterBar.scrollWidth - filterBar.clientWidth,
        tableTop: container.getBoundingClientRect().top,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(largeLayout.filterBarInnerOverflow).toBeLessThanOrEqual(0);
    expect(largeLayout.filterBarBottom).toBeLessThanOrEqual(largeLayout.tableTop);
    expect(largeLayout.containerRight).toBeLessThanOrEqual(largeLayout.viewportWidth);

    await clickFontScale(page, 'M');
    expect(await measureActivePane(page)).toEqual(baseline);
  });
});
