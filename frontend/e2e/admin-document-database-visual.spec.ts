// 管理员文档数据库三 Tab 视觉基准验收与证据采集（PR3 负责人 Review R3 要求）。
//
// 验收内容（负责人原文）：在最新 SHA、字体加载完成、浏览器 100% 缩放、M 档分别采集
// 维修申请 / AI 会话 / AI 报告三标签在 1440×900 与 1366×768 下共 6 张截图；用 Playwright
// 读取并归档三标签的 FilterBar / TableContainer computed styles 与
// documentElement.scrollWidth - clientWidth <= 0；另跑 S→M→L→M 确认 L 无遮挡、
// 回 M 后基准数值恢复。
//
// 截图与 computed-style JSON 写入 testInfo outputPath（frontend/test-results/...），
// 由采集人复制归档到 docs/tmp/PR 证据目录（本地可追溯，不随 PR 提交）。
// 前提（不满足时自动 skip，与 admin-document-database-real.spec.ts 同口径）：
// 本地后端 127.0.0.1:3000 可用、backend/env/.env.development 存在、前端真实通道可用。

import { expect, type Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
} from './helpers/real-backend';

const PAGE_PATH = '/admin/document-database';

// gkj 共享视觉基准（src/index.css token）：三个 Tab 必须复用公共容器而非页面自写样式。
const FILTER_BAR_BASELINE = {
  backgroundColor: 'rgb(248, 250, 252)', // --filter-bar-bg #f8fafc
  borderColor: 'rgb(219, 227, 238)', // --filter-bar-border #dbe3ee
  borderRadius: '10px',
  display: 'flex',
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

/** 点击标签并等待该标签数据态落定（表格行 / 空态 / 错误告警任一出现，骨架屏退场）。 */
async function focusTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  const pane = activePane(page);
  await expect(pane.locator('.table-container')).toBeVisible();
  await expect(
    pane.locator('.ant-table-tbody tr.ant-table-row, .empty-state, .ant-alert-error').first(),
  ).toBeVisible();
}

/** 读取当前激活标签的公共容器 computed style 与页面横滚余量。 */
async function measureActivePane(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.ant-tabs-tabpane-active');
    if (pane === null) throw new Error('缺少激活标签面板');
    const filterBar = pane.querySelector<HTMLElement>('.filter-bar');
    const container = pane.querySelector<HTMLElement>('.table-container');
    if (filterBar === null || container === null) throw new Error('激活标签缺少公共容器');
    const fb = getComputedStyle(filterBar);
    const tc = getComputedStyle(container);
    return {
      devicePixelRatio: window.devicePixelRatio,
      dock: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filterBar: {
        backgroundColor: fb.backgroundColor,
        borderColor: fb.borderColor,
        borderRadius: fb.borderRadius,
        display: fb.display,
        padding: fb.padding,
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

  test('M 档三标签 1440×900 / 1366×768：容器基准、无横滚与 6 张证据截图', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const env = readBackendEnv();

    await loginAs(page, env, 'mock_super_admin', /\/admin$/);
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
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

        const key = `r3-${tab.fileStem}-M-${tag}`;
        await page.screenshot({ path: testInfo.outputPath(`${key}.png`), fullPage: true });
        evidence[key] = snapshot;
      }
    }

    const evidenceJson = path.join(evidenceDir, 'r3-computed-styles-M.json');
    writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
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
