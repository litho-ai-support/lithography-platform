// e2e/pr5-zoom-200-visual.spec.ts
//
// PR5 布局遗留修复 S3（2026-09-30）：浏览器 200% 缩放下客户四页可用性验收。
//
// 仿真口径：物理窗口 1440×900 @ dpr 2（Chrome 页面缩放 200% 时 CSS 视口减半为 720×450，
// 物理分辨率不变），Playwright 以 viewport 720×450 + deviceScaleFactor 2 等效复现；
// 截图物理尺寸仍为 1440×900，文件名 zoom-200 如实标注（buildEvidenceFileName）。
//
// 检查清单（计划 S3）：
// - 首页默认创建态 / 创建表单校验错误 / 列表 / 详情 / 长文本 / loading-empty-error 三态；
// - 页面标题与「发起维修申请」按钮仍可访问；表单字段与提交可通过纵向滚动到达；
// - 文本不被截断（长文本容器几何不溢出）；控件中心点不被其他元素覆盖；
// - 无不可处理的水平滚动（整页 scrollWidth <= clientWidth）；
// - 焦点顺序（Tab 依次到达 错误码→故障描述→提交）与键盘操作（Enter 触发校验）有效；
// - 侧栏折叠（≤1024px）后退化单面板，历史申请仍有可用入口
//   （创建态「查看我的维修申请」入口 + 三模式互达）。
//
// 长文本字段映射：本产品客户侧的长连续文本为申请编号/错误码/故障描述/正文/回复正文
// （LONG_REQUEST_NO / LONG_ERROR_CODE / 'A'×600 / 'B'×1200 / 'C'×900 夹具）；
// 客户名与设备型号名在客户侧为固定短字段（客户侧不渲染客户自身名称），长文本压力由上述字段承担。
//
// 数据由 helpers/customer-repair-request-mocks 按 operationName 应答（mock 失败关闭 +
// afterEach 留痕断言，与 states spec 同口径）；不依赖真实后端。
// 决策规则（计划 S3）：本用例只验证与取证，不修改业务代码；如出现遮挡/不可达，
// 只允许调整响应式断点、换行与容器滚动（不得改桌面端 320px 栏宽与 16px 间距）。

import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { seedAuthSession } from './helpers/auth-session-seed';
import {
  abortSuspendedCustomerRepairRequestMocks,
  CUSTOMER_MOCK_ROUTES,
  installCustomerRepairRequestMocks,
  LONG_ERROR_CODE,
  LONG_REQUEST_NO,
  readUnregisteredOperations,
} from './helpers/customer-repair-request-mocks';
import {
  buildEvidenceFileName,
  captureStableViewport,
  readPngDimensions,
  waitForFontsReady,
} from './helpers/visual-evidence';

const ROLE = 'CUSTOMER';
const HOME_PATH = '/customer';
const LIST_PATH = '/customer/repair-requests';
const DETAIL_PATH = `${LIST_PATH}/920002`;
const NOT_FOUND_PATH = `${LIST_PATH}/920001`;

/** 200% 缩放仿真：1440×900 物理窗口 ÷ 2 = 720×450 CSS 视口 @ dpr 2 */
const ZOOM_VIEWPORT = { height: 450, width: 720 } as const;
const ZOOM_LABEL = '720x450';
const ZOOM = '200';
/** 截图物理像素尺寸（窗口分辨率不变） */
const PHYSICAL = { height: 900, width: 1440 };

type MockOptions = Parameters<typeof installCustomerRepairRequestMocks>[1];

// 每个用例独立 context：固定 200% 仿真，不继承其他 spec 的滚动与状态残留
test.use({
  deviceScaleFactor: 2,
  viewport: { height: ZOOM_VIEWPORT.height, width: ZOOM_VIEWPORT.width },
});

/** 进页统一：装 mock → 预置会话 → 导航（视口由 test.use 固定，不逐用例设置）。 */
async function openPage(page: Page, options: MockOptions, targetPath: string): Promise<void> {
  await installCustomerRepairRequestMocks(page, options);
  await seedAuthSession(page, ROLE);
  await page.goto(targetPath);
  await waitForFontsReady(page);
}

/** 换 mock 后整体导航（同 URL goto = 全量重载，状态不残留）。
 *  换 mock 前先显式中止挂起请求：unroute 会把未收敛的挂起请求释放到真实网络，
 *  dev server 代理可达后端时会收到 UNAUTHENTICATED，触发全局清会话跳登录。 */
async function remockAndGoto(page: Page, options: MockOptions, targetPath: string): Promise<void> {
  await abortSuspendedCustomerRepairRequestMocks(page);
  await page.unroute(CUSTOMER_MOCK_ROUTES);
  await installCustomerRepairRequestMocks(page, options);
  await page.goto(targetPath);
  await waitForFontsReady(page);
}

/** 整页横向溢出量（<= 0 表示无横滚） */
function measurePageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** 关键控件可达性：滚动到达 → 完整进入视口 → 中心点未被覆盖（仅纵向滚动即可操作）。 */
async function expectReachableVertical(target: Locator, label: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await expect(target, `${label} 应可见`).toBeVisible();

  const box = await target.boundingBox();
  expect(box, `${label} 应有几何盒`).not.toBeNull();
  expect(box!.y, `${label} 顶部不得越出视口`).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, `${label} 底部应完整进入视口（纵向滚动可达）`).toBeLessThanOrEqual(
    ZOOM_VIEWPORT.height + 1,
  );

  const coveredBy = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    if (!hit) return '(elementFromPoint 无命中)';
    if (el === hit || el.contains(hit)) return null;

    return `${hit.tagName}.${String(hit.className ?? '').split(' ')[0]}`;
  });
  expect(coveredBy, `${label} 中心点不应被其他元素覆盖`).toBeNull();
}

/** 页头（客户页面标题 + 发起维修申请按钮）在 200% 下始终可访问。
 *  按钮按 .page-header 限定：空态时段内另有同名「发起维修申请」入口（EmptyState action），
 *  页头按钮必须独立可访问，不与他处入口混淆。 */
async function expectHeaderAccessible(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '客户页面' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
  await expect(
    page.locator('.page-header').getByRole('button', { name: '发起维修申请' }),
  ).toBeVisible();
}

/** 关键控件两两不覆盖（几何盒不相交）。 */
async function expectNoControlOverlap(
  pairs: { box: { height: number; width: number; x: number; y: number }; label: string }[],
  context: string,
): Promise<void> {
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const a = pairs[i];
      const b = pairs[j];
      const overlap =
        a.box.x < b.box.x + b.box.width &&
        b.box.x < a.box.x + a.box.width &&
        a.box.y < b.box.y + b.box.height &&
        b.box.y < a.box.y + a.box.height;
      expect(overlap, `${context}：${a.label} 与 ${b.label} 不应互相覆盖`).toBe(false);
    }
  }
}

/** 采集一张 200% 证据截图：物理尺寸必须等于窗口分辨率（1440×900）。 */
async function capture(
  page: Page,
  testInfo: TestInfo,
  area: string,
  capturedAt: Date,
  evidence: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const fileName = buildEvidenceFileName({
    area,
    capturedAt,
    role: ROLE,
    viewportLabel: ZOOM_LABEL,
    zoom: ZOOM,
  });
  const pngPath = path.join(testInfo.outputPath(), fileName);
  const capture = await captureStableViewport(page, { fileName, filePath: pngPath });
  const png = readPngDimensions(pngPath);
  expect(png, `${fileName} 物理尺寸`).toEqual(PHYSICAL);

  evidence[area] = { ...extra, capture, fileName, png };

  return fileName;
}

function writeEvidence(
  testInfo: TestInfo,
  capturedAt: Date,
  evidence: Record<string, unknown>,
): void {
  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, 'pr5-zoom-200-evidence.json');
  writeFileSync(
    file,
    JSON.stringify(
      { capturedAt: capturedAt.toISOString(), role: ROLE, zoom: ZOOM, states: evidence },
      null,
      2,
    ),
  );
  console.log(`[visual-evidence] ${file}`);
}

type FocusStop = { combobox: boolean; hint: string; role: string | null; tag: string };

/**
 * 从文档起点按 Tab 遍历焦点，直到提交按钮获得焦点或达到上限。
 * 返回轨迹（每一步的 标签/角色/提示文案）与是否到达提交按钮。
 * 下拉选择的可达性用 role="combobox"（antd Select 内层 input）识别，不依赖 placeholder 属性。
 */
async function tabToSubmit(
  page: Page,
  maxTabs = 40,
): Promise<{ submitReached: boolean; trail: FocusStop[] }> {
  // 清空焦点，保证 Tab 序列从文档开头开始（不继承点击残留）
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  const trail: FocusStop[] = [];
  let submitReached = false;

  for (let index = 0; index < maxTabs && !submitReached; index += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;

      if (!(el instanceof HTMLElement))
        return { combobox: false, hint: '(none)', role: null, tag: 'NONE' };

      const role = el.getAttribute('role');
      const hint =
        el.getAttribute('placeholder') ??
        el.getAttribute('aria-label') ??
        (el.textContent ?? '').trim().slice(0, 24);

      return { combobox: role === 'combobox', hint, role, tag: el.tagName };
    });
    trail.push(stop);
    submitReached = stop.tag === 'BUTTON' && stop.hint.startsWith('提交申请');
  }

  return { submitReached, trail };
}

// mock 失败关闭的兜底断言：未登记 operationName 必须失败（与 states spec 同口径）
test.afterEach(async ({ page }) => {
  expect(readUnregisteredOperations(page), '未登记的 GraphQL operationName').toEqual([]);
});

// ---------------------------------------------------------------- 创建态（含校验错误与键盘）

test.describe('创建态：可达性、键盘与校验错误（200%）', () => {
  test('首页默认创建态：标题/按钮可达、表单可纵向滚动到达、焦点顺序与 Enter 校验有效', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { models: 'ready' }, HOME_PATH);

    // 默认创建态 + 固定页头；窄屏单面板由 data-mode 控制，标题仍为「客户页面」
    await expect(page.locator('.customer-workspace-grid[data-mode="create"]')).toHaveCount(1);
    await expectHeaderAccessible(page);
    // 侧栏折叠后的历史入口必须存在（创建态右栏内入口）
    const narrowEntry = page.getByRole('button', { name: '查看我的维修申请' });
    await expect(narrowEntry).toBeVisible();

    const overflow = await measurePageOverflow(page);
    expect(overflow, '创建态 200% 下不应出现整页横滚').toBeLessThanOrEqual(0);
    await capture(page, testInfo, 'customer-create-ready', capturedAt, evidence, { overflow });

    // 表单字段与提交按钮可通过纵向滚动到达、中心点不被覆盖
    const select = page.locator('.ant-select').first();
    const errorCode = page.getByPlaceholder('例如：E-2001');
    const description = page.getByPlaceholder('请描述设备故障现象与发生场景');
    const submit = page.getByRole('button', { name: '提交申请' });
    await expectReachableVertical(select, '设备型号下拉');
    await expectReachableVertical(errorCode, '设备错误码输入框');
    await expectReachableVertical(description, '故障描述输入框');
    await expectReachableVertical(submit, '提交申请按钮');
    await expectReachableVertical(narrowEntry, '查看我的维修申请入口');

    // 关键控件两两不覆盖（下拉 / 错误码 / 故障描述 / 提交）
    const boxes = await Promise.all(
      [
        { label: '设备型号下拉', locator: select },
        { label: '设备错误码输入框', locator: errorCode },
        { label: '故障描述输入框', locator: description },
        { label: '提交申请按钮', locator: submit },
      ].map(async (item) => ({ box: (await item.locator.boundingBox())!, label: item.label })),
    );
    await expectNoControlOverlap(boxes, '创建态');

    // 全局 AI 浮动入口（.entry-trigger-shell，AppLayout 宿主，同 S6-2 口径）在 200% 下仍可达；
    // 作为固定浮层，其与内容边缘的视觉重叠几何记入证据（最小化风险，不做硬断言：
    // 浮层为全局设计组件，不在本轮允许修改范围内，且控件中心点可达性已逐项保证）。
    const aiEntry = page.locator('.entry-trigger-shell button');
    await expectReachableVertical(aiEntry, 'AI 浮动入口按钮');
    const aiBox = (await aiEntry.boundingBox())!;
    const aiOverlaps = boxes.map((item) => {
      const a = item.box;
      const width = Math.max(
        0,
        Math.min(a.x + a.width, aiBox.x + aiBox.width) - Math.max(a.x, aiBox.x),
      );
      const height = Math.max(
        0,
        Math.min(a.y + a.height, aiBox.y + aiBox.height) - Math.max(a.y, aiBox.y),
      );

      return { area: width * height, label: item.label, size: { height, width } };
    });

    // 焦点顺序：Tab 依次到达 错误码 → 故障描述 → 提交（提交按钮获得焦点后停）
    const { submitReached, trail } = await tabToSubmit(page);
    expect(submitReached, `40 次 Tab 内应到达提交按钮：${JSON.stringify(trail)}`).toBe(true);

    const hintIndexOf = (predicate: (stop: FocusStop) => boolean) => trail.findIndex(predicate);
    const selectIndex = hintIndexOf((stop) => stop.combobox);
    const errorIndex = hintIndexOf(
      (stop) => stop.tag === 'INPUT' && stop.hint.includes('例如：E-2001'),
    );
    const descriptionIndex = hintIndexOf(
      (stop) => stop.tag === 'TEXTAREA' && stop.hint.includes('请描述设备故障现象'),
    );
    const submitIndex = hintIndexOf(
      (stop) => stop.tag === 'BUTTON' && stop.hint.startsWith('提交申请'),
    );
    expect(selectIndex, 'Tab 焦点应到达设备型号下拉（role=combobox）').toBeGreaterThanOrEqual(0);
    expect(errorIndex, 'Tab 焦点应到达设备错误码输入框').toBeGreaterThanOrEqual(0);
    expect(descriptionIndex, 'Tab 焦点应到达故障描述输入框').toBeGreaterThanOrEqual(0);
    expect(submitIndex, 'Tab 焦点应到达提交按钮').toBeGreaterThanOrEqual(0);
    expect(
      selectIndex < errorIndex && errorIndex < descriptionIndex && descriptionIndex < submitIndex,
      `焦点顺序应按表单顺序推进（型号 ${selectIndex} → 错误码 ${errorIndex} → 描述 ${descriptionIndex} → 提交 ${submitIndex}）`,
    ).toBe(true);

    // 键盘操作：焦点在提交按钮上按 Enter 触发校验，三条必填错误可见
    // （声明域限定 .ant-form-item-explain-error：避免与下拉占位符等同名文本产生歧义）
    await page.keyboard.press('Enter');
    const explain = page.locator('.ant-form-item-explain-error');
    await expect(explain.filter({ hasText: '请选择设备型号' })).toBeVisible();
    await expect(explain.filter({ hasText: '请输入设备错误码' })).toBeVisible();
    await expect(explain.filter({ hasText: '请输入故障描述' })).toBeVisible();

    await capture(page, testInfo, 'customer-create-validation-errors', capturedAt, evidence, {
      aiFloat: { box: aiBox, overlaps: aiOverlaps },
      focusTrail: { descriptionIndex, errorIndex, selectIndex, submitIndex, trail },
    });
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('型号三态（loading / empty / failed）：告警与重试在 200% 下可用', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { models: 'pending' }, HOME_PATH);

    // loading：控件与提交不可用，不提前渲染告警
    await expect(page.locator('.ant-select-disabled')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeDisabled();
    await expect(page.locator('.ant-alert')).toHaveCount(0);
    await expectHeaderAccessible(page);
    await capture(page, testInfo, 'customer-create-models-loading', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });

    // empty：空态告警 + 重试可达；重试后表单恢复可用
    await remockAndGoto(page, { models: 'empty' }, HOME_PATH);
    await expect(page.getByText('暂无可用的设备型号，请稍后再试。')).toBeVisible();
    await expectHeaderAccessible(page);
    const retry = page.getByRole('button', { name: /重\s*试/ }).first();
    await expectReachableVertical(retry, '型号空态重试按钮');
    await capture(page, testInfo, 'customer-create-models-empty', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });

    await remockAndGoto(page, { models: 'ready' }, HOME_PATH);
    await expect(page.getByText('暂无可用的设备型号，请稍后再试。')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();

    // failed：失败告警 + 重试可达；重试后表单恢复可用
    await remockAndGoto(page, { models: 'failed' }, HOME_PATH);
    await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    await expectReachableVertical(retry, '型号失败态重试按钮');
    await capture(page, testInfo, 'customer-create-models-failed', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });

    await remockAndGoto(page, { models: 'ready' }, HOME_PATH);
    await expect(page.getByText('网络连接异常，请稍后重试。')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeEnabled();
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 列表态（就绪 / 长文本 / 三态）

test.describe('列表态：就绪、长文本与三态（200%）', () => {
  test('列表就绪与长文本：无横滚、条目换行约束生效、空/加载/失败三态上限一致', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'ready' }, LIST_PATH);

    // 窄屏单面板：列表 pane 可见、详情 pane 收起（display:none），标题仍为「客户页面」
    await expect(page.locator('.customer-workspace-grid[data-mode="history-list"]')).toHaveCount(1);
    await expect(page.locator('.customer-workspace-list-pane')).toBeVisible();
    await expect(page.locator('.customer-workspace-detail-pane')).toBeHidden();
    await expectHeaderAccessible(page);
    await expect(page.locator('.activity-item')).toHaveCount(2);

    // 状态/操作栏统一布局（200%）：未接单条目删除按钮仍可见、可点；
    // 已接单条目不出现删除按钮（无删除 DOM，非禁用占位）
    const pendingDeleteButton = page
      .locator('.activity-item')
      .filter({ hasText: 'MOCK-RR-2026-0001' })
      .getByRole('button', { name: '删除申请 MOCK-RR-2026-0001' });
    await expectReachableVertical(pendingDeleteButton, '200% 列表未接单条目删除按钮');
    await expect(pendingDeleteButton, '200% 列表删除按钮应可点').toBeEnabled();
    await expect(
      page
        .locator('.activity-item')
        .filter({ hasText: 'MOCK-RR-2026-0002' })
        .getByRole('button', { name: /^删除申请 / }),
    ).toHaveCount(0);

    const readyOverflow = await measurePageOverflow(page);
    expect(readyOverflow, '列表就绪态 200% 下不应出现整页横滚').toBeLessThanOrEqual(0);
    await capture(page, testInfo, 'customer-repair-request-list-ready', capturedAt, evidence, {
      overflow: readyOverflow,
    });

    // 长连续文本：条目内换行约束生效、条目容器几何不横向溢出
    await remockAndGoto(page, { list: 'long-text' }, LIST_PATH);
    await expect(page.getByText(LONG_REQUEST_NO)).toBeVisible();

    const wrapping = await page.evaluate(() => {
      const round = (value: number) => Math.round(value * 100) / 100;
      const item = document.querySelector<HTMLElement>(
        '.customer-workspace-list-pane .activity-item',
      );
      const code = item?.querySelector<HTMLElement>('.activity-item-code');
      const error = item?.querySelector<HTMLElement>('span.break-words');
      const main = item?.querySelector<HTMLElement>('.customer-workspace-item-main');
      const rail = item?.querySelector<HTMLElement>('.customer-workspace-item-rail');
      const pill = rail?.querySelector<HTMLElement>('.status-pill');
      if (!item || !code || !error || !main || !rail || !pill) {
        throw new Error('长文本条目节点缺失');
      }

      const itemRect = item.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const pillRect = pill.getBoundingClientRect();

      return {
        codeText: code.textContent ?? '',
        codeWordBreak: getComputedStyle(code).wordBreak,
        columns: {
          itemRight: round(itemRect.right),
          mainRight: round(mainRect.right),
          pillRight: round(pillRect.right),
          railLeft: round(railRect.left),
          railRight: round(railRect.right),
        },
        errorText: error.textContent ?? '',
        errorWrap: getComputedStyle(error).overflowWrap,
        item: { clientWidth: item.clientWidth, scrollWidth: item.scrollWidth },
      };
    });
    expect(wrapping.codeText).toBe(LONG_REQUEST_NO);
    expect(wrapping.codeWordBreak, '申请编号 computed word-break').toBe('break-all');
    expect(wrapping.errorText).toContain(LONG_ERROR_CODE);
    expect(wrapping.errorWrap, '型号·错误码行 computed overflow-wrap').toBe('break-word');
    expect(wrapping.item.scrollWidth, '条目容器不得横向溢出').toBeLessThanOrEqual(
      wrapping.item.clientWidth + 1,
    );
    // 长连续文本不得压住状态/操作栏：rail 起点不早于主内容终点（1px 容差），
    // 状态胶囊完整落在条目右边界内（200% 下保持同一两列结构）
    expect(wrapping.columns.railLeft, 'rail 不得被长文本主内容压占').toBeGreaterThanOrEqual(
      wrapping.columns.mainRight - 1,
    );
    expect(wrapping.columns.pillRight, '状态胶囊不得越出条目右边界').toBeLessThanOrEqual(
      wrapping.columns.itemRight + 1,
    );

    const longTextOverflow = await measurePageOverflow(page);
    expect(longTextOverflow, '长文本列表 200% 下不应出现整页横滚').toBeLessThanOrEqual(0);
    await capture(page, testInfo, 'customer-repair-request-list-long-text', capturedAt, evidence, {
      overflow: longTextOverflow,
      wrapping,
    });

    // loading：加载态不与空态叠加，页头仍可访问
    await remockAndGoto(page, { list: 'pending' }, LIST_PATH);
    await expect(page.locator('.ant-spin-spinning')).toHaveCount(2);
    await expect(page.getByText('还没有维修申请。')).toHaveCount(0);
    await expectHeaderAccessible(page);
    await capture(page, testInfo, 'customer-repair-request-list-loading', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });

    // empty：左栏空态与「发起维修申请」入口可达
    await remockAndGoto(page, { list: 'empty' }, LIST_PATH);
    const listPane = page.locator('.customer-workspace-list-pane');
    await expect(listPane.getByText('还没有维修申请。')).toBeVisible();
    await expectReachableVertical(
      listPane.getByRole('button', { name: '发起维修申请' }),
      '空态发起维修申请入口',
    );
    await expectHeaderAccessible(page);
    await capture(page, testInfo, 'customer-repair-request-list-empty', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });

    // failed：失败信息与重试入口可达，不与空态叠加
    await remockAndGoto(page, { list: 'failed' }, LIST_PATH);
    await expect(listPane.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    await expect(listPane.getByText('还没有维修申请。')).toHaveCount(0);
    await expectReachableVertical(
      listPane.getByRole('button', { name: /重\s*试/ }).first(),
      '列表失败态重试按钮',
    );
    await capture(page, testInfo, 'customer-repair-request-list-failed', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 详情态（就绪 / 长文本 / loading / not-found）

test.describe('详情态：就绪、长文本与三态（200%）', () => {
  test('详情就绪与长文本：回复可见、长文本完整可读、可返回列表', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'with-responses' }, DETAIL_PATH);

    // 窄屏单面板：详情 pane 可见、列表 pane 收起
    await expect(page.locator('.customer-workspace-grid[data-mode="history-detail"]')).toHaveCount(
      1,
    );
    await expect(page.locator('.customer-workspace-detail-pane')).toBeVisible();
    await expect(page.locator('.customer-workspace-list-pane')).toBeHidden();
    await expectHeaderAccessible(page);
    await expect(page.getByText('工程师回复（2）')).toBeVisible();

    const detailPane = page.locator('.customer-workspace-detail-pane');
    await expectReachableVertical(
      detailPane.getByRole('button', { name: '返回历史列表' }),
      '返回历史列表',
    );

    const readyOverflow = await measurePageOverflow(page);
    expect(readyOverflow, '详情就绪态 200% 下不应出现整页横滚').toBeLessThanOrEqual(0);
    await capture(page, testInfo, 'customer-repair-request-detail-ready', capturedAt, evidence, {
      overflow: readyOverflow,
    });

    // 长文本：故障描述 / 正文 / 回复正文全部完整渲染且容器几何不横向溢出（不被截断）
    await remockAndGoto(page, { detail: 'long-text' }, DETAIL_PATH);
    await expect(page.getByText('A'.repeat(600))).toBeVisible();

    const wrapping = await page.evaluate(() => {
      const pane = document.querySelector('.customer-workspace-detail-pane');
      const faultText = [...(pane?.querySelectorAll('div.break-words') ?? [])].find(
        (el) => el.textContent === 'A'.repeat(600),
      );
      const pre = pane?.querySelector('pre');
      const reply = [...(pane?.querySelectorAll('.text-sm.break-words') ?? [])].find(
        (el) => el.textContent === 'C'.repeat(900),
      );
      if (!pane || !faultText || !pre || !reply) {
        throw new Error('长文本节点缺失');
      }

      const box = (el: Element) => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });

      return {
        fault: { ...box(faultText), wrap: getComputedStyle(faultText).overflowWrap },
        pre: box(pre),
        reply: box(reply),
      };
    });
    expect(wrapping.fault.wrap, '故障描述 computed overflow-wrap').toBe('break-word');
    for (const [label, value] of [
      ['故障描述', wrapping.fault],
      ['正文', wrapping.pre],
      ['回复正文', wrapping.reply],
    ] as const) {
      expect(value.scrollWidth, `${label}容器不得横向溢出（文本不被截断）`).toBeLessThanOrEqual(
        value.clientWidth + 1,
      );
    }

    const longTextOverflow = await measurePageOverflow(page);
    expect(longTextOverflow, '长文本详情 200% 下不应出现整页横滚').toBeLessThanOrEqual(0);
    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-long-text',
      capturedAt,
      evidence,
      {
        overflow: longTextOverflow,
        wrapping,
      },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('详情 loading 与 not-found：固定页头、骨架与返回入口在 200% 下可用', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'pending' }, DETAIL_PATH);

    const detailPane = page.locator('.customer-workspace-detail-pane');
    await expectHeaderAccessible(page);
    await expect(page.getByRole('heading', { name: '维修申请详情' })).toBeVisible();
    await expect(detailPane.locator('.ant-skeleton')).toHaveCount(1);
    await expect(detailPane.getByText(/工程师回复/)).toHaveCount(0);
    await capture(page, testInfo, 'customer-repair-request-detail-loading', capturedAt, evidence, {
      overflow: await measurePageOverflow(page),
    });

    // not-found：统一不可查看态 + 返回入口可达，无回复模块
    await remockAndGoto(page, { detail: 'not-found' }, NOT_FOUND_PATH);
    await expect(detailPane.getByText('维修申请不存在或不可查看。')).toBeVisible();
    await expect(detailPane.locator('.ant-alert-warning')).toHaveCount(1);
    await expect(detailPane.getByText(/工程师回复/)).toHaveCount(0);
    await expectReachableVertical(
      detailPane.getByRole('button', { name: '返回历史列表' }),
      'not-found 返回入口',
    );
    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-not-found',
      capturedAt,
      evidence,
      {
        overflow: await measurePageOverflow(page),
      },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 单面板互达（侧栏折叠后的历史入口）

test.describe('单面板互达：历史入口与三模式切换（200%）', () => {
  test('创建态 → 历史列表 → 详情 → 列表 → 恢复创建态，页头始终唯一', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'ready' }, HOME_PATH);

    // 创建态 → 点击窄屏历史入口 → 列表态
    await expect(page.locator('.customer-workspace-grid[data-mode="create"]')).toHaveCount(1);
    const narrowEntry = page.getByRole('button', { name: '查看我的维修申请' });
    await expectReachableVertical(narrowEntry, '查看我的维修申请入口');
    await narrowEntry.click();

    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
    await expect(page.locator('.customer-workspace-grid[data-mode="history-list"]')).toHaveCount(1);
    await expect(page.locator('.customer-workspace-list-pane')).toBeVisible();
    await expect(page.locator('.activity-item')).toHaveCount(2);
    await expectHeaderAccessible(page);

    // 列表态 → 点击第一条申请（LIST_ITEMS 首项 920001，0 回复夹具）→ 详情态
    await page
      .locator('.customer-workspace-list-pane .activity-item')
      .first()
      .click({ position: { x: 12, y: 12 } });

    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/920001$`));
    await expect(page.locator('.customer-workspace-grid[data-mode="history-detail"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('.customer-workspace-detail-pane').getByText('MOCK-RR-2026-0001').first(),
    ).toBeVisible();
    // 0 条回复：整个回复模块不渲染（与 states spec S2-6 同口径）
    await expect(
      page.locator('.customer-workspace-detail-pane').getByText(/工程师回复/),
    ).toHaveCount(0);
    await expectHeaderAccessible(page);

    // 详情态 → 返回历史列表 → 列表态
    await page.getByRole('button', { name: '返回历史列表' }).click();
    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
    await expect(page.locator('.customer-workspace-grid[data-mode="history-list"]')).toHaveCount(1);

    // 列表态 → 页头「发起维修申请」→ 恢复默认创建态（按钮始终保留）
    await page.locator('.page-header').getByRole('button', { name: '发起维修申请' }).click();
    await expect(page).toHaveURL(new RegExp(`${HOME_PATH}$`));
    await expect(page.locator('.customer-workspace-grid[data-mode="create"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '提交申请' })).toBeVisible();
    await expectHeaderAccessible(page);

    evidence.switchChecks = {
      detailBackToList: true,
      historyEntryReachable: true,
      listToDetail: true,
      restoredCreate: true,
    };
    writeEvidence(testInfo, capturedAt, evidence);
  });
});
