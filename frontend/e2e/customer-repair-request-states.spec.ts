// e2e/customer-repair-request-states.spec.ts
//
// PR5 S2（客户创建、列表与详情收尾）状态与视觉验收（无后端确定性版本）：
// 会话由 helpers/auth-session-seed 预置，GraphQL 一律走
// helpers/customer-repair-request-mocks 的按 operationName 应答 —— 不依赖真实后端、
// 开发库、backend/env/.env.development，fresh clone 直接可跑。
// 真实前后端链路（登录 + 完整客户闭环 + 跨账号防探测）由
// repair-request-manage-real.spec.ts 承担，职责分离。
//
// 验收内容（PR5 计划表 S2）：
// - S2-1 创建页：字段等宽 / 标签 / 页面说明 / 主按钮半径与尺寸 / 提交中 loading / 业务拒绝错误反馈；
// - S2-2 型号 loading / 空 / 失败三态，且空与失败均可重试恢复（不必刷新整页）；
// - S2-3 列表五态：loading / 库为空 / 失败 / 正常 / 长文本；失败态不与空表叠加（机械断言表格不存在）；
// - S2-4 未接单行有删除入口且需二次确认；已接单行不渲染删除按钮；
// - S2-5 长连续文本（申请编号 / 错误码 / 故障描述 / 正文 / 回复正文）不破坏布局：
//   列表按基准 §6.4.4 验收「横滚只发生在表格内部 + 整页不溢出（不出现整页横滚）」，
//   详情按「容器几何不横向溢出」验收，两者均附带 computed overflow-wrap 断言；
// - S2-6 0 条回复时详情页整个回复模块不渲染（无标题 / 无计数 / 无占位）；
// - S2-7 有回复时内容、工程师、时间与状态均来自后端字段并按客户侧格式展示；
// - S2-8 loading / failed / not-found 使用同一页面骨架（页头 + 面板），无空白面板与旧内容残留。
//
// mock 失败关闭：未登记的 operationName 会抛错，并由下方 afterEach 断言留痕为空
// （漏登记 / 拼错 operation 时用例必须失败，不得被成功空 data 兜底）。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR/PR5-证据（本地可追溯，不随 PR 提交）。命名遵循
// frontend/docs/gkj-visual-baseline.md §1，状态由「区域」字段承载（helpers/visual-evidence.ts）。

import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { seedAuthSession } from './helpers/auth-session-seed';
import {
  CUSTOMER_MOCK_ROUTES,
  installCustomerRepairRequestMocks,
  LONG_ERROR_CODE,
  LONG_REQUEST_NO,
  readUnregisteredOperations,
} from './helpers/customer-repair-request-mocks';
import {
  buildEvidenceFileName,
  readPngDimensions,
  waitForFontsReady,
} from './helpers/visual-evidence';

const ROLE = 'CUSTOMER';
const HOME_PATH = '/customer';
const CREATE_PATH = '/customer/repair-requests/new';
const LIST_PATH = '/customer/repair-requests';
const DETAIL_PATH = `${LIST_PATH}/920001`;

const WIDE = { height: 900, label: '1440x900', width: 1440 };
const NARROW = { height: 667, label: '375x667', width: 375 };

/** 删除确认弹层文案（S2-4） */
const DELETE_POPCONFIRM_TITLE = '确认删除该维修申请？';

/** 客户侧统一时间格式（与 src/pages/customer/format-date.ts 同参数，用于核对展示值） */
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** 进页前统一：安装确定性 mock → 预置会话（先落到应用源）→ 设定视口 → 导航。
 *  mock 先于会话预置安装：会话预置内部也会载入应用源，避免该阶段请求漏出到真实网络。 */
async function openPage(
  page: Page,
  options: Parameters<typeof installCustomerRepairRequestMocks>[1],
  target: { path: string; viewport?: typeof WIDE },
): Promise<void> {
  await installCustomerRepairRequestMocks(page, options);
  await seedAuthSession(page, ROLE);
  await page.setViewportSize(target.viewport ?? WIDE);
  await page.goto(target.path);
  await waitForFontsReady(page);
}

/** 整页横向溢出量（<= 0 表示无横滚） */
function measurePageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** 采集一张证据截图：写入 outputPath，断言物理尺寸严格等于视口，并把条目写回 JSON。 */
async function capture(
  page: Page,
  testInfo: TestInfo,
  area: string,
  viewport: typeof WIDE,
  capturedAt: Date,
  evidence: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const fileName = buildEvidenceFileName({
    area,
    capturedAt,
    role: ROLE,
    viewportLabel: viewport.label,
  });
  const pngPath = path.join(testInfo.outputPath(), fileName);
  await page.screenshot({ path: pngPath });
  const png = readPngDimensions(pngPath);
  expect(png, `${fileName} 物理尺寸`).toEqual({ height: viewport.height, width: viewport.width });

  evidence[area] = { ...extra, fileName, png };

  return fileName;
}

function writeEvidence(
  testInfo: TestInfo,
  capturedAt: Date,
  evidence: Record<string, unknown>,
): void {
  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, 'customer-repair-request-states-evidence.json');
  writeFileSync(
    file,
    JSON.stringify({ capturedAt: capturedAt.toISOString(), role: ROLE, states: evidence }, null, 2),
  );
  console.log(`[visual-evidence] ${file}`);
}

/** 填写完整表单（型号取第一项） */
async function fillCreateForm(page: Page): Promise<void> {
  await page.getByRole('combobox').click();
  await page.locator('.ant-select-item-option').first().click();
  await page.getByPlaceholder('例如：E-2001').fill('E-2001');
  await page.getByPlaceholder('请描述设备故障现象与发生场景').fill('状态验收：提交中与错误反馈');
}

// mock 失败关闭的兜底断言：任何用例里出现未登记的 operationName 都必须失败
// （mock 已同时抛错；此处保证即使抛错被吞，留痕也不会静默通过）。
test.afterEach(async ({ page }) => {
  expect(readUnregisteredOperations(page), '未登记的 GraphQL operationName').toEqual([]);
});

// ---------------------------------------------------------------- 创建页（S2-1 / S2-2）

test.describe('创建页：型号三态与表单统一（S2-1 / S2-2）', () => {
  test('型号加载中：控件与提交不可用，不提前渲染任何告警', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { models: 'pending' }, { path: CREATE_PATH });

    await expect(page.getByRole('combobox')).toHaveCount(1);
    await expect(page.locator('.ant-select-disabled')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeDisabled();
    await expect(page.locator('.ant-alert')).toHaveCount(0);
    await expect(page.locator('.ant-skeleton')).toHaveCount(0);

    await capture(page, testInfo, 'customer-create-models-loading', WIDE, capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('型号为空：展示空态告警与重试入口，重试后表单恢复可用', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { models: 'empty' }, { path: CREATE_PATH });

    await expect(page.getByText('暂无可用的设备型号，请稍后再试。')).toBeVisible();
    await expect(page.getByRole('button', { name: '提交申请' })).toBeDisabled();
    await capture(page, testInfo, 'customer-create-models-empty', WIDE, capturedAt, evidence);

    // 恢复：型号由管理员维护，重试即重新拉取，无需刷新整页
    await page.unroute(CUSTOMER_MOCK_ROUTES);
    await installCustomerRepairRequestMocks(page, { models: 'ready' });
    await page.getByRole('button', { name: /重\s*试/ }).click();

    await expect(page.getByText('暂无可用的设备型号，请稍后再试。')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
    await expect(page.locator('.ant-select-disabled')).toHaveCount(0);
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('型号加载失败：展示失败告警与重试入口，重试后表单恢复可用', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { models: 'failed' }, { path: CREATE_PATH });

    await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    await expect(page.getByRole('button', { name: '提交申请' })).toBeDisabled();
    await capture(page, testInfo, 'customer-create-models-failed', WIDE, capturedAt, evidence);

    await page.unroute(CUSTOMER_MOCK_ROUTES);
    await installCustomerRepairRequestMocks(page, { models: 'ready' });
    await page.getByRole('button', { name: /重\s*试/ }).click();

    await expect(page.getByText('网络连接异常，请稍后重试。')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('就绪态：字段等宽、标签与页面说明齐备、主按钮半径合规', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { models: 'ready' }, { path: CREATE_PATH });

    await expect(page.getByText('提交设备故障信息，创建维修申请。')).toBeVisible();
    for (const label of ['设备型号', '设备错误码', '故障描述']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // 字段等宽：三个控件同宽且等于表单内容宽度（统一字段宽度，不允许参差）
    const widths = await page.evaluate(() => {
      const select = document.querySelector('.ant-select');
      const input = document.querySelector('input[placeholder="例如：E-2001"]');
      const textarea = document.querySelector('textarea');
      if (!select || !input || !textarea) {
        throw new Error('表单控件缺失');
      }

      return [select, input, textarea].map((el) => el.getBoundingClientRect().width);
    });
    expect(new Set(widths.map((width) => Math.round(width))).size, `控件宽度：${widths}`).toBe(1);

    // 主按钮按 --radius-action（8px）；提交按钮非 small 档
    const submit = page.getByRole('button', { name: '提交申请' });
    expect(await submit.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('8px');
    expect(await submit.evaluate((el) => getComputedStyle(el).height)).toBe('32px');

    await capture(page, testInfo, 'customer-create-ready', WIDE, capturedAt, evidence, {
      controlWidths: widths,
      overflow: await measurePageOverflow(page),
    });
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('提交中：主按钮进入 loading 且重复点击不再发请求', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { create: 'pending', models: 'ready' }, { path: CREATE_PATH });

    await fillCreateForm(page);
    const submit = page.getByRole('button', { name: '提交申请' });
    await submit.click();

    await expect(submit).toHaveClass(/ant-btn-loading/);
    await submit.click({ force: true }).catch(() => undefined);

    // 请求挂起 → 仍处于提交中，未出现成功页或错误告警
    await expect(page.getByText('维修申请创建成功')).toHaveCount(0);
    await expect(page.locator('.ant-alert')).toHaveCount(0);
    await capture(page, testInfo, 'customer-create-submitting', WIDE, capturedAt, evidence, {
      loadingClass: await submit.evaluate((el) => el.className),
    });
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('业务拒绝：展示后端消息并保留表单内容', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { create: 'rejected', models: 'ready' }, { path: CREATE_PATH });

    await fillCreateForm(page);
    await page.getByRole('button', { name: '提交申请' }).click();

    await expect(page.getByText('所选设备型号已停用，请重新选择。')).toBeVisible();
    await expect(page.getByPlaceholder('例如：E-2001')).toHaveValue('E-2001');
    await expect(page.getByText('维修申请创建成功')).toHaveCount(0);

    await capture(page, testInfo, 'customer-create-rejected', WIDE, capturedAt, evidence);
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 列表页（S2-3 / S2-4 / S2-5）

test.describe('列表页：五态与删除入口（S2-3 / S2-4 / S2-5）', () => {
  test('加载中：呈现加载态且不提前给出空态文案', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'pending' }, { path: LIST_PATH });

    await expect(page.locator('.ant-spin-spinning')).toHaveCount(1);
    await expect(page.getByText('还没有维修申请，点击客户首页「发起维修申请」创建。')).toHaveCount(
      0,
    );

    await capture(
      page,
      testInfo,
      'customer-repair-request-list-loading',
      WIDE,
      capturedAt,
      evidence,
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('库为空：呈现空态文案', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'empty' }, { path: LIST_PATH });

    await expect(
      page.getByText('还没有维修申请，点击客户首页「发起维修申请」创建。'),
    ).toBeVisible();
    await expect(page.locator('.ant-table-row')).toHaveCount(0);

    await capture(page, testInfo, 'customer-repair-request-list-empty', WIDE, capturedAt, evidence);
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('加载失败：只呈现失败信息与重试入口，不与空表叠加', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'failed' }, { path: LIST_PATH });

    await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    await expect(page.getByRole('button', { name: /重\s*试/ })).toBeVisible();
    // 失败态不与空表叠加：表格与空态文案均不得出现
    await expect(page.locator('.ant-table')).toHaveCount(0);
    await expect(page.getByText('还没有维修申请，点击客户首页「发起维修申请」创建。')).toHaveCount(
      0,
    );

    await capture(
      page,
      testInfo,
      'customer-repair-request-list-failed',
      WIDE,
      capturedAt,
      evidence,
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('正常态：两条真实字段行、状态标签与接单差异（S2-4 删除入口）', async ({
    page,
  }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'ready' }, { path: LIST_PATH });

    await expect(page.locator('.ant-table-row')).toHaveCount(2);
    await expect(page.getByText('MOCK-RR-2026-0001')).toBeVisible();
    await expect(page.getByText('待接单')).toBeVisible();
    await expect(page.getByText('已接单')).toBeVisible();
    await expect(page.getByText('已解决')).toBeVisible();
    await expect(page.getByText('暂无回复')).toBeVisible();

    // 未接单行有删除入口，已接单行不渲染删除按钮
    const unacceptedRow = page.getByRole('row', { name: /MOCK-RR-2026-0001/ });
    const acceptedRow = page.getByRole('row', { name: /MOCK-RR-2026-0002/ });
    await expect(unacceptedRow.getByRole('button', { name: /^删\s*除$/ })).toHaveCount(1);
    await expect(acceptedRow.getByRole('button', { name: /^删\s*除$/ })).toHaveCount(0);

    // 删除需二次确认：先留就绪态证据，再打开确认框留确认态证据（取消后不产生删除请求）
    const readyOverflow = await measurePageOverflow(page);
    expect(readyOverflow, '1440×900 就绪态不应出现整页横滚').toBeLessThanOrEqual(0);
    await capture(
      page,
      testInfo,
      'customer-repair-request-list-ready',
      WIDE,
      capturedAt,
      evidence,
      {
        overflow: readyOverflow,
      },
    );

    await unacceptedRow.getByRole('button', { name: /^删\s*除$/ }).click();
    await expect(page.getByText(DELETE_POPCONFIRM_TITLE)).toBeVisible();
    await capture(
      page,
      testInfo,
      'customer-repair-request-list-delete-confirm',
      WIDE,
      capturedAt,
      evidence,
    );
    // AntD 会在两个 CJK 字符的按钮中插入空格，故用 \s* 匹配（与「重试」用例同口径）
    await page.getByRole('button', { name: /取\s*消/ }).click();
    // Popconfirm 关闭后节点仍挂载（仅隐藏），故断言可见性而非 count；并核对取消未触发删除
    await expect(page.getByText(DELETE_POPCONFIRM_TITLE)).toBeHidden();
    await expect(page.locator('.ant-table-row')).toHaveCount(2);

    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('长连续文本：横滚只发生在表格内部，整页无横向溢出（窄视口）', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'long-text' }, { path: LIST_PATH, viewport: NARROW });

    await expect(page.getByText(LONG_REQUEST_NO)).toBeVisible();

    // 列内长连续文本仍须携带换行类（列宽被内容撑开时也不会把文字挤出单元格）
    const cell = page.locator('td.break-words').first();
    const cellMetrics = await cell.evaluate((el) => ({
      overflowWrap: getComputedStyle(el).overflowWrap,
      text: el.textContent ?? '',
    }));
    expect(cellMetrics.text).toBe(LONG_REQUEST_NO);
    expect(cellMetrics.overflowWrap, 'computed overflow-wrap').toBe('break-word');

    // 错误码列同样换行
    const errorCell = page.locator('td.break-words').filter({ hasText: LONG_ERROR_CODE });
    await expect(errorCell).toHaveCount(1);

    // 基准 §6.4.4：整页不得横滚，超宽内容只允许在表格容器内部横滚。
    // 注：单元格 clientWidth 由内容撑开（长串单行宽度），对其断言 scrollWidth ≤ clientWidth
    // 恒真、无鉴别力；真正的不变量是「表格容器可横滚 + 整页不溢出」。
    const table = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.ant-table-content');
      if (!el) {
        throw new Error('表格容器 .ant-table-content 缺失');
      }

      return {
        clientWidth: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
        scrollWidth: el.scrollWidth,
      };
    });
    expect(table.overflowX, '表格容器 overflow-x').toBe('auto');
    expect(table.scrollWidth, '表格内容宽于容器（内部横滚生效）').toBeGreaterThan(
      table.clientWidth,
    );

    const overflow = await measurePageOverflow(page);
    expect(overflow, '375×667 窄视口不应出现整页横向滚动').toBeLessThanOrEqual(0);
    await capture(
      page,
      testInfo,
      'customer-repair-request-list-long-text',
      NARROW,
      capturedAt,
      evidence,
      { cell: cellMetrics, overflow, table },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 详情页（S2-5 / S2-6 / S2-7 / S2-8）

test.describe('详情页：骨架、回复模块与长文本（S2-5 / S2-6 / S2-7 / S2-8）', () => {
  test('加载中：页头 + 面板骨架，无空白面板与旧内容残留', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'pending' }, { path: DETAIL_PATH });

    await expect(page.getByRole('heading', { name: '维修申请详情' })).toBeVisible();
    await expect(page.locator('.surface-panel .ant-skeleton')).toHaveCount(1);
    await expect(page.getByText(/工程师回复/)).toHaveCount(0);

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-loading',
      WIDE,
      capturedAt,
      evidence,
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('不存在：统一不可查看态与返回入口，且无回复模块', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'not-found' }, { path: DETAIL_PATH });

    await expect(page.getByText('维修申请不存在或不可查看。')).toBeVisible();
    await expect(page.getByRole('button', { name: '返回列表' })).toBeVisible();
    await expect(page.getByText(/工程师回复/)).toHaveCount(0);
    await expect(page.getByText('MOCK-RR-2026-0001')).toHaveCount(0);

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-not-found',
      WIDE,
      capturedAt,
      evidence,
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('加载失败：error 告警与返回入口，无旧内容与回复模块', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'failed' }, { path: DETAIL_PATH });

    // 通用失败态与 not-found 区分：error 告警（not-found 为 warning）
    await expect(page.locator('.ant-alert-error')).toHaveCount(1);
    await expect(page.locator('.ant-alert-warning')).toHaveCount(0);
    await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    await expect(page.getByRole('button', { name: '返回列表' })).toBeVisible();

    // 同一页面骨架（页头 + 面板），无旧详情内容、无回复模块、无删除入口
    await expect(page.getByRole('heading', { name: '维修申请详情' })).toBeVisible();
    await expect(page.locator('.surface-panel')).toHaveCount(1);
    await expect(page.getByText(/工程师回复/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删除申请' })).toHaveCount(0);
    await expect(page.getByText('MOCK-RR-2026-0001')).toHaveCount(0);

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-failed',
      WIDE,
      capturedAt,
      evidence,
      { overflow: await measurePageOverflow(page) },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('0 条回复：整个回复模块不渲染（无标题 / 无计数 / 无占位）', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'no-responses' }, { path: DETAIL_PATH });

    await expect(page.getByText('MOCK-RR-2026-0001').first()).toBeVisible();
    await expect(page.getByText(/工程师回复/)).toHaveCount(0);
    await expect(page.getByText('暂无工程师回复。')).toHaveCount(0);
    // 面板只剩「申请信息」与「故障正文」两块，未接单详情仍保留删除入口
    await expect(page.locator('.surface-panel')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '删除申请' })).toBeVisible();

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-no-responses',
      WIDE,
      capturedAt,
      evidence,
      { overflow: await measurePageOverflow(page) },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('有回复：内容、工程师、时间与状态均按后端字段展示', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'with-responses' }, { path: DETAIL_PATH });

    await expect(page.getByText('工程师回复（2）')).toBeVisible();
    await expect(page.getByText('李工')).toBeVisible();
    await expect(page.getByText('王工')).toBeVisible();
    await expect(page.getByText('已解决')).toBeVisible();
    await expect(page.getByText('处理中')).toBeVisible();
    await expect(page.getByText('已更换温控组件并完成标定，套刻误差回到规格内。')).toBeVisible();

    // 时间按客户侧统一格式展示（非原始 ISO）
    const expectedTime = timeFormatter.format(new Date('2026-09-02T18:40:00.000Z'));
    await expect(page.getByText(expectedTime)).toBeVisible();
    await expect(page.getByText('2026-09-02T18:40:00.000Z')).toHaveCount(0);

    // 已接单详情不渲染删除入口
    await expect(page.getByRole('button', { name: '删除申请' })).toHaveCount(0);
    await expect(page.locator('.surface-panel')).toHaveCount(3);

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-with-responses',
      WIDE,
      capturedAt,
      evidence,
      { expectedTime, overflow: await measurePageOverflow(page) },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('长连续文本：故障描述、正文与回复正文换行，窄视口无横向溢出', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'long-text' }, { path: DETAIL_PATH, viewport: NARROW });

    await expect(page.getByText('A'.repeat(600))).toBeVisible();

    const wrapping = await page.evaluate(() => {
      // 故障描述文字在行内 <span> 上，其 clientWidth/scrollWidth 恒为 0（CSSOM 对行内非替换元素如此），
      // 几何只能取块级容器 .ant-descriptions-item-content；换行类仍在 span 上断言。
      // 注意：页面有 6 个 .ant-descriptions-item-content，必须由文字的 span 反查所属容器。
      const faultText = document.querySelector('.ant-descriptions-item-content span.break-words');
      const faultBox = faultText?.closest('.ant-descriptions-item-content');
      const pre = document.querySelector('pre');
      const reply = [...document.querySelectorAll('.text-sm.break-words')].find(
        (el) => el.textContent === 'C'.repeat(900),
      );
      if (!faultBox || !faultText || !pre || !reply) {
        throw new Error('长文本节点缺失');
      }

      const box = (el: Element) => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });
      const wrap = (el: Element) => getComputedStyle(el).overflowWrap;

      return {
        fault: box(faultBox),
        faultWrap: wrap(faultText),
        pre: box(pre),
        reply: box(reply),
        replyWrap: wrap(reply),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

    expect(wrapping.faultWrap).toBe('break-word');
    expect(wrapping.replyWrap).toBe('break-word');
    expect(wrapping.fault.scrollWidth, '故障描述容器不得横向溢出').toBeLessThanOrEqual(
      wrapping.fault.clientWidth + 1,
    );
    expect(wrapping.pre.scrollWidth, '故障正文不得横向溢出').toBeLessThanOrEqual(
      wrapping.pre.clientWidth + 1,
    );
    expect(wrapping.reply.scrollWidth, '回复正文不得横向溢出').toBeLessThanOrEqual(
      wrapping.reply.clientWidth + 1,
    );
    expect(
      wrapping.scrollWidth - wrapping.clientWidth,
      '窄视口不应出现横向滚动',
    ).toBeLessThanOrEqual(0);

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-long-text',
      NARROW,
      capturedAt,
      evidence,
      { wrapping },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 入口可达性（S2-9 收尾）

test('客户首页两条入口进入真实创建页与列表页（不经手输 URL）', async ({ page }) => {
  await installCustomerRepairRequestMocks(page, {});
  await seedAuthSession(page, ROLE);
  await page.goto(HOME_PATH);

  await page.getByRole('button', { name: '发起维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(`${CREATE_PATH}$`));
  await expect(page.getByRole('heading', { name: '创建维修申请' })).toBeVisible();

  await page.goto(HOME_PATH);
  await page.getByRole('button', { name: '查看维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
  await expect(page.getByRole('heading', { name: '我的维修申请' })).toBeVisible();
});
