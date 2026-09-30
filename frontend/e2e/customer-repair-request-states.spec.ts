// e2e/customer-repair-request-states.spec.ts
//
// PR5 S2（客户创建、列表与详情收尾）状态与视觉验收（无后端确定性版本；2026-09-29 起
// 客户四页复用同一整合工作台，断言口径同步为「左栏活动列表 + 右栏创建/详情面板」）：
// 会话由 helpers/auth-session-seed 预置，GraphQL 一律走
// helpers/customer-repair-request-mocks 的按 operationName 应答 —— 不依赖真实后端、
// 开发库、backend/env/.env.development，fresh clone 直接可跑。
// 真实前后端链路（登录 + 完整客户闭环 + 跨账号防探测）由
// repair-request-manage-real.spec.ts 承担，职责分离。
//
// 验收内容（PR5 计划表 S2）：
// - S2-1 创建页：字段等宽 / 标签 / 页面说明 / 主按钮半径与尺寸 / 提交中 loading / 业务拒绝错误反馈；
// - S2-2 型号 loading / 空 / 失败三态，且空与失败均可重试恢复（不必刷新整页）；
// - S2-3 列表五态：loading / 库为空 / 失败 / 正常 / 长文本；失败态不与空态叠加
//   （机械断言无活动条目、无空态文案；列表加载中与详情占位各自呈加载态）；
// - S2-4 未接单条目有删除入口且需二次确认；已接单条目不渲染删除按钮；
// - S2-5 长连续文本（申请编号 / 错误码 / 故障描述 / 正文 / 回复正文）不破坏布局：
//   列表按「条目文本携带换行约束 + 容器几何不溢出 + 整页不溢出」验收，
//   详情按「容器几何不横向溢出」验收，两者均附带 computed 换行断言；
// - S2-6 0 条回复时详情页整个回复模块不渲染（无标题 / 无计数 / 无占位）；
// - S2-7 有回复时内容、工程师、时间与状态均来自后端字段并按客户侧格式展示；
// - S2-8 loading / failed / not-found 使用同一详情面板骨架（固定页头 + 右栏面板），
//   无空白面板与旧内容残留。
//
// mock 失败关闭：未登记的 operationName 会抛错，并由下方 afterEach 断言留痕为空
// （漏登记 / 拼错 operation 时用例必须失败，不得被成功空 data 兜底）。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR/PR5-证据（本地可追溯，不随 PR 提交）。命名遵循
// frontend/docs/gkj-visual-baseline.md §1，状态由「区域」字段承载（helpers/visual-evidence.ts）；
// 所有截图经 captureStableViewport（2026-09-30 S2：截图前滚动复位到页面顶部 + 构图元数据）。

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
  captureStableViewport,
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

/** 客户侧统一时间格式（与 src/shared/ui/format-date-time.ts 同参数，用于核对展示值） */
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
  const capture = await captureStableViewport(page, { fileName, filePath: pngPath });
  const png = readPngDimensions(pngPath);
  expect(png, `${fileName} 物理尺寸`).toEqual({ height: viewport.height, width: viewport.width });

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

    // 固定页头（2026-09-29 整合裁定）：四个客户 URL 共用标题与说明；create 态左栏保留列表上下文
    await expect(page.locator('.customer-workspace-grid[data-mode="create"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
    await expect(
      page.getByText('提交设备维修申请，并跟踪接单情况、处理进度与工程师回复。'),
    ).toBeVisible();
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
  test('加载中：列表与详情占位各自呈加载态，不提前给出空态文案', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'pending' }, { path: LIST_PATH });

    // 左栏列表与右栏详情占位同时处于加载态（详情目标须待列表就绪后才能派生）
    await expect(page.locator('.ant-spin-spinning')).toHaveCount(2);
    await expect(page.getByText('还没有维修申请。')).toHaveCount(0);

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

    // 左栏列表与右栏详情占位同为空态：同一空态文案出现两处，且不残留任何活动条目
    await expect(page.getByText('还没有维修申请。')).toHaveCount(2);
    await expect(page.locator('.activity-item')).toHaveCount(0);

    await capture(page, testInfo, 'customer-repair-request-list-empty', WIDE, capturedAt, evidence);
    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('加载失败：只呈现失败信息与重试入口，不与空表叠加', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'failed' }, { path: LIST_PATH });

    await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    // 左栏列表与右栏详情占位各自提供重试入口（占位文案与列表失败原因区分）
    await expect(page.getByRole('button', { name: /重\s*试/ })).toHaveCount(2);
    await expect(page.getByText('维修申请列表加载失败，详情暂不可用。')).toBeVisible();
    // 失败态不与空态叠加：无活动条目、无空态文案
    await expect(page.locator('.activity-item')).toHaveCount(0);
    await expect(page.getByText('还没有维修申请。')).toHaveCount(0);

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

  test('正常态：两条真实字段条目、状态标签与接单差异（S2-4 删除入口）', async ({
    page,
  }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'ready' }, { path: LIST_PATH });

    // 左栏活动条目：两条真实字段（编号 / 型号〈代码〉· 错误码 / 提交时间 / 接单状态 Pill）
    await expect(page.locator('.activity-item')).toHaveCount(2);
    // 编号同时出现在左栏条目与右栏默认详情（第一项 0001）标题，故取首个
    await expect(page.getByText('MOCK-RR-2026-0001').first()).toBeVisible();
    await expect(page.getByText('光刻机 200 型（LITHO-200）· E-STAGE-201')).toBeVisible();
    await expect(page.getByText('光刻机 300 型（LITHO-300）· E-LENS-102')).toBeVisible();
    // 「待接单」同时出现在左栏 0001 条目 Pill 与右栏默认详情（第一项）标题 Pill，故取首个
    await expect(page.getByText('待接单').first()).toBeVisible();
    // 「已接单」由左栏 0002 条目 Pill 提供（右栏默认目标是第一项 0001）
    await expect(page.getByText('已接单').first()).toBeVisible();

    // 未接单条目有删除入口，已接单条目不渲染删除按钮（aria-label 携带编号，精确限定条目）
    await expect(page.getByRole('button', { name: '删除申请 MOCK-RR-2026-0001' })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除申请 MOCK-RR-2026-0002' })).toHaveCount(0);

    // 状态/操作栏统一布局（2026-09-30）：两态条目共用同一套两列网格 —— 主内容右边界、
    // rail 左边界与宽度、状态胶囊右边界必须一致（1px 渲染容差）；已接单 rail 内不得
    // 存在可聚焦元素（不可访问、不可触发删除），也不得出现删除文案
    const alignment = await page.evaluate(() => {
      const round = (value: number) => Math.round(value * 100) / 100;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>('.customer-workspace-list-pane .activity-item'),
      );

      if (items.length !== 2) {
        throw new Error(`应存在两条活动条目，实际 ${items.length}`);
      }

      return items.map((item) => {
        const main = item.querySelector<HTMLElement>('.customer-workspace-item-main');
        const rail = item.querySelector<HTMLElement>('.customer-workspace-item-rail');
        const status = item.querySelector<HTMLElement>('.customer-workspace-item-status');
        const pill = status?.querySelector<HTMLElement>('.status-pill');

        if (!main || !rail || !status || !pill) {
          throw new Error('条目两列结构或状态胶囊缺失');
        }

        const mainRect = main.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        const pillRect = pill.getBoundingClientRect();

        return {
          deleteTextCount: Array.from(rail.querySelectorAll('*')).filter(
            (node) => node.textContent === '删除',
          ).length,
          mainRight: round(mainRect.right),
          pillLeft: round(pillRect.left),
          pillRight: round(pillRect.right),
          railFocusableCount: rail.querySelectorAll('button, a, [tabindex]').length,
          railLeft: round(railRect.left),
          railWidth: round(railRect.width),
          statusText: status.textContent?.trim() ?? '',
        };
      });
    });

    const [pendingItem, acceptedItem] = alignment;

    expect(pendingItem.statusText, '首条为待接单').toBe('待接单');
    expect(acceptedItem.statusText, '第二条为已接单').toBe('已接单');
    expect(
      Math.abs(pendingItem.mainRight - pendingItem.railLeft),
      '主内容右边界应与 rail 左边界相切',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(pendingItem.mainRight - acceptedItem.mainRight),
      '两态主内容右边界应一致',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(pendingItem.railLeft - acceptedItem.railLeft),
      '两态 rail 左边界应一致',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(pendingItem.railWidth - acceptedItem.railWidth),
      '两态 rail 宽度应一致',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(pendingItem.pillRight - acceptedItem.pillRight),
      '两态状态胶囊右边界应一致',
    ).toBeLessThanOrEqual(1);
    expect(pendingItem.railFocusableCount, '待接单 rail 应有删除可聚焦元素').toBeGreaterThan(0);
    expect(acceptedItem.railFocusableCount, '已接单 rail 不得有可聚焦元素').toBe(0);
    expect(acceptedItem.deleteTextCount, '已接单 rail 不得出现删除文案').toBe(0);

    // 右栏默认详情（列表态以第一项为默认目标）异步就绪，避免截图落在骨架态
    await expect(page.locator('.customer-workspace-detail-pane .ant-skeleton')).toHaveCount(0);

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
        alignment,
        overflow: readyOverflow,
      },
    );

    await page.getByRole('button', { name: '删除申请 MOCK-RR-2026-0001' }).click();
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
    await expect(page.locator('.activity-item')).toHaveCount(2);

    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('长连续文本：条目换行约束生效，容器与整页无横向溢出（窄视口）', async ({
    page,
  }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { list: 'long-text' }, { path: LIST_PATH, viewport: NARROW });

    await expect(page.getByText(LONG_REQUEST_NO)).toBeVisible();

    // 条目内长连续文本仍须携带换行约束（编号 break-all；型号·错误码行 break-words），
    // 且条目容器几何不横向溢出（375px 单面板下左栏占满剩余宽度）。
    // 注：编号 span 为行内元素时 clientWidth 恒为 0（CSSOM 对行内非替换元素如此），
    // 几何不变量改在块级条目容器上断言。
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
    // 状态胶囊完整落在条目右边界内（窄视口保持与 ready 态同一两列结构）
    expect(wrapping.columns.railLeft, 'rail 不得被长文本主内容压占').toBeGreaterThanOrEqual(
      wrapping.columns.mainRight - 1,
    );
    expect(wrapping.columns.pillRight, '状态胶囊不得越出条目右边界').toBeLessThanOrEqual(
      wrapping.columns.itemRight + 1,
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
      { overflow, wrapping },
    );
    writeEvidence(testInfo, capturedAt, evidence);
  });
});

// ---------------------------------------------------------------- 详情页（S2-5 / S2-6 / S2-7 / S2-8）

test.describe('详情页：骨架、回复模块与长文本（S2-5 / S2-6 / S2-7 / S2-8）', () => {
  test('加载中：固定页头 + 详情面板骨架，无空白面板与旧内容残留', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'pending' }, { path: DETAIL_PATH });

    await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '维修申请详情' })).toBeVisible();
    await expect(page.locator('.customer-workspace-detail-pane .ant-skeleton')).toHaveCount(1);
    await expect(
      page.locator('.customer-workspace-detail-pane').getByText(/工程师回复/),
    ).toHaveCount(0);

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

    const detailPane = page.locator('.customer-workspace-detail-pane');
    await expect(detailPane.getByText('维修申请不存在或不可查看。')).toBeVisible();
    await expect(detailPane.locator('.ant-alert-warning')).toHaveCount(1);
    await expect(detailPane.getByRole('button', { name: '返回历史列表' })).toBeVisible();
    await expect(
      page.locator('.customer-workspace-detail-pane').getByText(/工程师回复/),
    ).toHaveCount(0);
    // 右栏不残留任何旧详情内容（左栏列表上下文不属于残留）
    await expect(detailPane.getByText('MOCK-RR-2026-0001')).toHaveCount(0);

    await capture(
      page,
      testInfo,
      'customer-repair-request-detail-not-found',
      WIDE,
      capturedAt,
      evidence,
    );

    // 返回入口把工作台带回历史列表态（URL 为列表路由）
    await detailPane.getByRole('button', { name: '返回历史列表' }).click();
    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));

    writeEvidence(testInfo, capturedAt, evidence);
  });

  test('加载失败：error 告警与返回入口，无旧内容与回复模块', async ({ page }, testInfo) => {
    const capturedAt = new Date();
    const evidence: Record<string, unknown> = {};
    await openPage(page, { detail: 'failed' }, { path: DETAIL_PATH });

    const detailPane = page.locator('.customer-workspace-detail-pane');
    // 通用失败态与 not-found 区分：error 告警（not-found 为 warning）
    await expect(detailPane.locator('.ant-alert-error')).toHaveCount(1);
    await expect(detailPane.locator('.ant-alert-warning')).toHaveCount(0);
    await expect(detailPane.getByText('网络连接异常，请稍后重试。')).toBeVisible();
    await expect(detailPane.getByRole('button', { name: '返回历史列表' })).toBeVisible();

    // 同一详情面板骨架（固定页头 + 右栏面板），无旧详情内容、无回复模块、无删除入口
    await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '维修申请详情' })).toBeVisible();
    await expect(page.locator('.customer-workspace-detail-pane .data-card')).toHaveCount(1);
    await expect(
      page.locator('.customer-workspace-detail-pane').getByText(/工程师回复/),
    ).toHaveCount(0);
    // 精确匹配名「删除申请」只属于右栏详情入口（左栏删除按钮的 accessible name 为
    // 「删除申请 {编号}」；role 名匹配默认为子串，必须 exact 才不误中）
    await expect(page.getByRole('button', { name: '删除申请', exact: true })).toHaveCount(0);
    await expect(detailPane.getByText('MOCK-RR-2026-0001')).toHaveCount(0);

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
    await expect(
      page.locator('.customer-workspace-detail-pane').getByText(/工程师回复/),
    ).toHaveCount(0);
    await expect(page.getByText('暂无工程师回复。')).toHaveCount(0);
    // 右栏只剩「故障描述」与「故障正文」两块内容区（DataCard 之外），未接单详情仍保留删除入口
    await expect(
      page.locator('.customer-workspace-detail-pane section:not(.data-card)'),
    ).toHaveCount(2);
    await expect(page.getByRole('heading', { name: '故障描述' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '故障正文' })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除申请', exact: true })).toBeVisible();

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
    // 「已解决」同时出现在头部最高处理状态 Pill 与回复 2 的 Pill
    await expect(page.getByText('已解决').first()).toBeVisible();
    await expect(page.getByText('处理中')).toBeVisible();
    await expect(page.getByText('已更换温控组件并完成标定，套刻误差回到规格内。')).toBeVisible();

    // 时间按客户侧统一格式展示（非原始 ISO）
    const expectedTime = timeFormatter.format(new Date('2026-09-02T18:40:00.000Z'));
    await expect(page.getByText(expectedTime)).toBeVisible();
    await expect(page.getByText('2026-09-02T18:40:00.000Z')).toHaveCount(0);

    // 已接单详情不渲染删除入口（exact 精确匹配右栏详情入口，不误中左栏未接单条目按钮）；
    // 三块内容区（故障描述 / 故障正文 / 工程师回复）齐备
    await expect(page.getByRole('button', { name: '删除申请', exact: true })).toHaveCount(0);
    await expect(
      page.locator('.customer-workspace-detail-pane section:not(.data-card)'),
    ).toHaveCount(3);

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
      // 故障描述在本面板的块级换行容器（div.break-words）上，几何与换行类都可直接断言；
      // 正文 pre 与回复正文保留原有选择器口径，全部限定在右栏详情面板内（窄视口左栏已收起）。
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
      const wrap = (el: Element) => getComputedStyle(el).overflowWrap;

      return {
        fault: box(faultText),
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

test('客户首页入口在工作台内可达列表与详情（不经手输 URL）', async ({ page }) => {
  await installCustomerRepairRequestMocks(page, {});
  await seedAuthSession(page, ROLE);
  await page.goto(HOME_PATH);

  // 首页默认 create 态：固定页头 + 右栏表单；页头按钮重复点击为 no-op（URL 不变、不清空输入）
  await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '发起维修申请' })).toBeVisible();
  await page.getByRole('button', { name: '发起维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}$`));

  // 左栏卡头「我的维修申请」入口 → 历史列表路由（列表态以第一项为默认详情）
  await page.getByRole('button', { name: '我的维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
  await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
  await expect(page.locator('.activity-item')).toHaveCount(2);

  // 条目主按钮进入详情路由（URL requestId 为详情目标唯一真值）
  await page.locator('.activity-item').first().locator('.customer-workspace-item-main').click();
  await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH}$`));
  await expect(page.getByRole('button', { name: '返回历史列表' })).toBeVisible();

  // 返回入口回到列表路由
  await page.getByRole('button', { name: '返回历史列表' }).click();
  await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));

  // 历史态页头「发起维修申请」恢复默认创建态（PR5 S0-4/S2-6：同一工作台切模式，页头不卸载）
  await page.locator('.page-header').getByRole('button', { name: '发起维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(`${HOME_PATH}$`));
  await expect(page.getByRole('button', { name: '提交申请' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '客户页面' })).toBeVisible();
});
