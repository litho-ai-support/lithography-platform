// e2e/reference-document-states-visual.spec.ts
//
// PR5 S4-3 / S4-7 参考资料详情长文本响应式与「新增 / 上传 / 下载 / 软删」状态证据
//（无后端确定性版本）：会话由 helpers/auth-session-seed 预置，GraphQL 与 REST 一律 stub，
// 不依赖真实后端、开发库或 backend/env/.env.development，fresh clone 直接可跑。
// 真实前后端链路（管理员上传/编辑/软删、工程师只读下载）由 reference-document-real.spec.ts
// 承担，职责分离。
//
// 验收内容（PR5 计划表 S4-3 / S4-7）：
// - S4-3：详情页长标题 / 长文件名 / 长说明 / 长正文在 1920×1080、1440×900、1366×768、
//   375×667 四视口均不产生整页横向滚动；Descriptions 表格不宽于卡体（长属性值换行而非撑宽表格）；
//   Card 卡头标题完整可读（不得沿用 AntD 默认 textEllipsis 被截断）；正文 pre 不溢出自身盒；
//   窄视口（<640px）卡头纵向重排（机械几何断言，见用例 (e)）；
// - S4-7：新增页表单态、上传中（真实 loading + 「上传中」文案 + 无假百分比）、
//   上传失败 Alert、下载失败提示、软删 Popconfirm 确认框 → 1440×900 定向截图 + JSON 证据。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR/PR5-证据（本地可追溯，不随 PR 提交）。

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { seedAuthSession } from './helpers/auth-session-seed';
import {
  EQUIPMENT_MODELS,
  installReferenceDocumentGraphqlRoutes,
} from './helpers/reference-document-mocks';
import {
  buildEvidenceFileName,
  captureStableViewport,
  readPngDimensions,
  waitForFontsReady,
} from './helpers/visual-evidence';

const DETAIL_ID = 981001;
const DETAIL_PATH = `/reference-documents/${DETAIL_ID}`;
const NEW_PATH = '/reference-documents/new';

/** 上传 REST 出错的延迟：留出「上传中」断言与截图窗口（不模拟真实字节进度） */
const UPLOAD_FAILURE_DELAY_MS = 5_000;

/**
 * S4-3 长文本夹具：三个「远超容器宽也不得撑破」的真实字段极值。
 * 文件名刻意不含连字符等换行机会——只有 `overflow-wrap: anywhere` 才能真正收窄
 * 表格最小内容宽度，否则 auto 表格布局会按最长不可断片段撑宽整表。
 */
const LONG_TITLE = `光源模块维护指南-${'超长标题占位'.repeat(14)}-NXE3400C`;
const LONG_FILENAME = `${'light_source_maintenance_manual_'.repeat(9)}2026Q3.pdf`;
const LONG_DESCRIPTION =
  '按季度执行的光源模块保养步骤与力矩表，包含拆装顺序、清洁剂选型与复装后的光强校准记录。'.repeat(
    8,
  );
const LONG_CONTENT_TEXT = [
  '# 光源维护指南',
  '',
  'EUV 光源能量衰减需每周记录并与基线对比，偏差超过 3% 时执行校准流程。'.repeat(20),
  '',
  'X'.repeat(220),
  '',
].join('\n');

type DetailFixture = {
  id: number;
  title: string;
  documentType: string;
  equipmentModelId: number | null;
  equipmentModelName: string | null;
  description: string;
  originalFilename: string;
  mimeType: string;
  hasFile: boolean;
  contentText: string;
  creatorNickname: string;
  createdAt: string;
  updatedAt: string;
};

const DETAIL_FIXTURE: DetailFixture = {
  id: DETAIL_ID,
  title: LONG_TITLE,
  documentType: 'MAINTENANCE_GUIDE',
  equipmentModelId: 49,
  equipmentModelName: 'ASML TWINSCAN NXT:1980Di',
  description: LONG_DESCRIPTION,
  originalFilename: LONG_FILENAME,
  mimeType: 'application/pdf',
  hasFile: true,
  contentText: LONG_CONTENT_TEXT,
  creatorNickname: '系统管理员',
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-12T09:30:00.000Z',
};

/**
 * 按 operationName 分发的确定性 stub。
 *
 * 分发骨架（按 operationName 精确应答 + 未登记即失败关闭 + `recorded` 留痕）统一由
 * `helpers/reference-document-mocks.ts` 的 `installReferenceDocumentGraphqlRoutes` 提供；
 * 本 spec 只自备夹具与「本 spec 真实用到的 operation」处理表：
 * 多一个（新增请求 / 拼错名字）会抛错并让用例失败，不使用「成功空 data」兜底 ——
 * 空 data 会被 mapper 判为外部契约异常，污染日志并掩盖真实报错。
 * `recorded` 记录已发生的 GraphQL operationName，供「未确认软删时不得发出删除 mutation」断言。
 */
async function installReferenceDocumentMocks(
  page: Page,
  options: { detail?: DetailFixture; recorded?: string[] } = {},
): Promise<void> {
  const detail = options.detail ?? DETAIL_FIXTURE;

  await installReferenceDocumentGraphqlRoutes(page, {
    handlers: {
      EquipmentModels: () => ({ equipmentModels: EQUIPMENT_MODELS }),
      ReferenceDocument: () => ({ referenceDocument: detail }),
    },
    label: 'reference-document-states-visual',
    ...(options.recorded ? { recorded: options.recorded } : {}),
  });
}

/** 视口清单：1440×900 为基准 §1 锁定视口；1920×1080 为宽屏桌面；1366×768 为工作台常态；
 *  375×667 用于暴露整页横滚与卡头塌缩。 */
const VIEWPORTS = [
  { height: 1080, label: '1920x1080', width: 1920 },
  { height: 900, label: '1440x900', width: 1440 },
  { height: 768, label: '1366x768', width: 1366 },
  { height: 667, label: '375x667', width: 375 },
] as const;

test('详情长标题 / 长文件名 / 长说明 / 长正文在四视口均不溢出（PR5 S4-3）', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });

  await seedAuthSession(page, 'SUPER_ADMIN');
  await installReferenceDocumentMocks(page);
  const capturedAt = new Date();
  const evidence: Record<string, unknown> = {};
  // 同轮四视口截图必须共享同一干净 SHA（逐张记录，结束时断言一致）
  const captureShas: string[] = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto(DETAIL_PATH);
    await waitForFontsReady(page);

    // 详情就绪：长标题（卡头）与长文件名（元数据）都真实渲染
    const detailRoot = page.locator('.reference-document-detail');
    await expect(detailRoot).toHaveCount(1);
    await expect(detailRoot.locator('.ant-card-head-title')).toHaveText(LONG_TITLE);
    await expect(detailRoot.locator('.ant-descriptions-item-content')).toContainText([
      LONG_FILENAME,
    ]);

    // (a) 卡头标题完整可读：AntD 默认 textEllipsis 会把长标题截断（scrollWidth > clientWidth）
    const headTitleClipped = await detailRoot
      .locator('.ant-card-head-title')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(
      headTitleClipped,
      `${viewport.label} 详情卡头标题不应被截断（完整可读）`,
    ).toBeLessThanOrEqual(1);

    // (b) Descriptions 表格不宽于卡体：长属性值必须在列内换行，而不是把 auto 表格撑宽。
    // 现状由 antd 自带的 `word-break: break-word` + `overflow-wrap: break-word` 保证；
    // 反向变异（强制 normal）实测使表格超出卡体 1029px，证明本断言非空转。
    const tableOverflow = await detailRoot.evaluate((root) => {
      const body = root.querySelector('.ant-card-body');
      const table = root.querySelector('.ant-descriptions table');

      if (!body || !table) {
        throw new Error('缺少卡体或 Descriptions 表格节点');
      }

      return table.getBoundingClientRect().width - body.clientWidth;
    });
    expect(
      tableOverflow,
      `${viewport.label} Descriptions 表格不应宽于卡体（长属性值需换行）`,
    ).toBeLessThanOrEqual(1);

    // (c) 正文 pre 不溢出自身盒（长连续字符安全换行）
    const contentOverflow = await detailRoot
      .locator('pre')
      .first()
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(contentOverflow, `${viewport.label} 正文 pre 不应溢出自身盒`).toBeLessThanOrEqual(1);

    // (d) 整页无横向滚动
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow, `${viewport.label} 不应出现整页横向滚动`).toBeLessThanOrEqual(0);

    // (e) 窄视口卡头纵向重排（PR5 S4-3 评审 P1-1）：
    // 横向布局下 extra（编辑 + 删除）独占右侧，把长标题压成约 93px 窄列、卡头高 504px。
    // 上述三条仅为机械几何判定（宽度占比 / 高度上限 / 纵向次序），不靠截图肉眼判断。
    let headTitleRatio: number | undefined;
    let headHeight: number | undefined;
    let extraBelowTitle: number | undefined;

    if (viewport.width <= 639) {
      const geometry = await detailRoot.evaluate((root) => {
        const head = root.querySelector('.ant-card-head');
        const title = root.querySelector('.ant-card-head-title');
        const extra = root.querySelector('.ant-card-extra');

        if (!head || !title || !extra) {
          throw new Error('缺少卡头 / 卡头标题 / 操作区节点');
        }

        const headRect = head.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        const extraRect = extra.getBoundingClientRect();

        return {
          extraTop: extraRect.top,
          headHeight: headRect.height,
          headWidth: headRect.width,
          titleBottom: titleRect.bottom,
          titleWidth: titleRect.width,
        };
      });

      headTitleRatio = geometry.titleWidth / geometry.headWidth;
      headHeight = geometry.headHeight;
      extraBelowTitle = geometry.extraTop - geometry.titleBottom;

      expect(
        headTitleRatio,
        `${viewport.label} 卡头标题宽度应占卡头过半（实测 ${geometry.titleWidth} / ${geometry.headWidth}）`,
      ).toBeGreaterThan(0.5);
      expect(
        headHeight,
        `${viewport.label} 卡头高度应受控（实测 ${geometry.headHeight}px）`,
      ).toBeLessThanOrEqual(160);
      expect(
        extraBelowTitle,
        `${viewport.label} 操作区应位于标题下方（实测 extra.top - title.bottom = ${extraBelowTitle}px）`,
      ).toBeGreaterThanOrEqual(-1);
      // 2 行截断后完整文本由原生 title 属性承载，悬停仍可读全（与列表页 S3-5 同口径）
      await expect(detailRoot.locator('.ant-card-head-title span[title]')).toHaveAttribute(
        'title',
        LONG_TITLE,
      );
    }

    const fileName = buildEvidenceFileName({
      area: 'reference-document-detail-long-text',
      capturedAt,
      role: 'SUPER_ADMIN',
      viewportLabel: viewport.label,
    });
    const pngPath = path.join(evidenceDir, fileName);
    const capture = await captureStableViewport(page, { fileName, filePath: pngPath });
    captureShas.push(capture.gitSha);
    const png = readPngDimensions(pngPath);
    expect(png).toEqual({ height: viewport.height, width: viewport.width });

    evidence[viewport.label] = {
      capture,
      contentOverflow,
      extraBelowTitle,
      fileName,
      headHeight,
      headTitleClipped,
      headTitleRatio,
      pageOverflow,
      png,
      tableOverflow,
    };
  }

  expect(new Set(captureShas).size, '四视口整页截图必须共享同一 SHA').toBe(1);

  const evidenceJson = path.join(evidenceDir, 'reference-document-detail-long-text-evidence.json');
  writeFileSync(
    evidenceJson,
    JSON.stringify(
      {
        capturedAt: capturedAt.toISOString(),
        gitSha: captureShas[0],
        role: 'SUPER_ADMIN',
        viewports: evidence,
      },
      null,
      2,
    ),
  );
  console.log(`[visual-evidence] ${evidenceJson}`);
});

test('新增页表单态 → 上传中（真实 loading、无假百分比）→ 上传失败提示（PR5 S4-7）', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });

  await seedAuthSession(page, 'SUPER_ADMIN');
  await installReferenceDocumentMocks(page);
  // 上传 REST 通道：延迟后返回 413 业务拒绝（信封唯一真源：后端 REFERENCE_DOCUMENT_ERROR）
  await page.route('**/api/reference-documents/upload', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, UPLOAD_FAILURE_DELAY_MS));
    await route.fulfill({
      body: JSON.stringify({
        success: false,
        data: {
          code: 'REFERENCE_DOCUMENT_UPLOAD_FILE_TOO_LARGE',
          message: '',
          statusCode: 413,
        },
      }),
      contentType: 'application/json',
      status: 413,
    });
  });

  const capturedAt = new Date();

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(NEW_PATH);
  await waitForFontsReady(page);

  await expect(page.getByRole('heading', { name: '新增参考资料' })).toBeVisible();
  // 表单落在公共面板（.surface-panel）内，与资料卡片容器同语言
  const panel = page.locator('.surface-panel');
  await expect(panel).toHaveCount(1);
  await expect(panel.locator('form')).toHaveCount(1);

  const formFileName = buildEvidenceFileName({
    area: 'reference-document-new-form',
    capturedAt,
    role: 'SUPER_ADMIN',
    viewportLabel: '1440x900',
  });
  const formPng = path.join(evidenceDir, formFileName);
  const formCapture = await captureStableViewport(page, {
    fileName: formFileName,
    filePath: formPng,
  });
  expect(readPngDimensions(formPng)).toEqual({ height: 900, width: 1440 });

  // 填写合法表单并选择文件（提交走 REST multipart 通道）
  // AntD Select 交互按维修申请 / 资料真实链路先例：点击 combobox 打开下拉后点 option
  await page.getByLabel('文档标题', { exact: true }).fill('光源模块维护指南');
  await page.getByRole('combobox').nth(0).click();
  await page.locator('.ant-select-item-option', { hasText: '维护指南' }).click();
  await page.setInputFiles('input[type="file"]', {
    buffer: Buffer.from('%PDF-1.4 e2e stub'),
    mimeType: 'application/pdf',
    name: 'light-source-maintenance.pdf',
  });

  await page.getByRole('button', { name: /创建资料/ }).click();

  // 上传中：真实 loading（AntD 旋转图标）+ 进行中文案；不展示任何假百分比
  const submitButton = panel.locator('button[type="submit"]');
  await expect(submitButton).toHaveClass(/ant-btn-loading/);
  await expect(submitButton).toContainText('上传中');
  await expect(page.locator('.ant-progress')).toHaveCount(0);
  expect(await panel.innerText(), '上传中不得展示无业务支持的百分比').not.toContain('%');

  const uploadingFileName = buildEvidenceFileName({
    area: 'reference-document-uploading',
    capturedAt,
    role: 'SUPER_ADMIN',
    viewportLabel: '1440x900',
  });
  const uploadingPng = path.join(evidenceDir, uploadingFileName);
  const uploadingCapture = await captureStableViewport(page, {
    fileName: uploadingFileName,
    filePath: uploadingPng,
  });
  expect(readPngDimensions(uploadingPng)).toEqual({ height: 900, width: 1440 });

  // 上传失败：展示后端原因（信封 code 映射的前端兜底文案），保留表单内容
  await expect(panel.getByText('上传文件超过大小限制。')).toBeVisible({ timeout: 30_000 });
  expect(await page.getByPlaceholder('请输入文档标题').inputValue()).toBe('光源模块维护指南');

  const failedFileName = buildEvidenceFileName({
    area: 'reference-document-upload-failed',
    capturedAt,
    role: 'SUPER_ADMIN',
    viewportLabel: '1440x900',
  });
  const failedPng = path.join(evidenceDir, failedFileName);
  const failedCapture = await captureStableViewport(page, {
    fileName: failedFileName,
    filePath: failedPng,
  });
  expect(readPngDimensions(failedPng)).toEqual({ height: 900, width: 1440 });

  expect(
    new Set([formCapture.gitSha, uploadingCapture.gitSha, failedCapture.gitSha]).size,
    '表单/上传中/上传失败三张截图必须共享同一 SHA',
  ).toBe(1);

  const evidenceJson = path.join(evidenceDir, 'reference-document-upload-evidence.json');
  writeFileSync(
    evidenceJson,
    JSON.stringify(
      {
        capturedAt: capturedAt.toISOString(),
        gitSha: formCapture.gitSha,
        role: 'SUPER_ADMIN',
        screenshots: {
          failed: failedCapture,
          form: formCapture,
          uploading: uploadingCapture,
        },
      },
      null,
      2,
    ),
  );
  console.log(`[visual-evidence] ${evidenceJson}`);
});

test('下载失败明确提示；软删二次确认且未确认不发删除请求（PR5 S4-4 / S4-7）', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });

  const recorded: string[] = [];

  await seedAuthSession(page, 'SUPER_ADMIN');
  await installReferenceDocumentMocks(page, { recorded });
  // 下载 REST 通道：410 业务拒绝（纯文本资料 / 存储对象缺失统一 file-not-available）
  await page.route(`**/api/reference-documents/${DETAIL_ID}/download`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        success: false,
        data: {
          code: 'REFERENCE_DOCUMENT_FILE_NOT_AVAILABLE',
          message: '',
          statusCode: 410,
        },
      }),
      contentType: 'application/json',
      status: 410,
    });
  });

  const capturedAt = new Date();

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(DETAIL_PATH);
  await waitForFontsReady(page);

  const detailRoot = page.locator('.reference-document-detail');
  await expect(detailRoot.locator('.ant-card-head-title')).toHaveText(LONG_TITLE);

  // 下载失败：明确提示（不是静默失败，也不是通用兜底文案）
  await page.getByRole('button', { name: /下载文件/ }).click();
  await expect(page.getByText('该资料没有可下载的文件。')).toBeVisible();

  const downloadFailedFileName = buildEvidenceFileName({
    area: 'reference-document-download-failed',
    capturedAt,
    role: 'SUPER_ADMIN',
    viewportLabel: '1440x900',
  });
  const downloadFailedPng = path.join(evidenceDir, downloadFailedFileName);
  const downloadFailedCapture = await captureStableViewport(page, {
    fileName: downloadFailedFileName,
    filePath: downloadFailedPng,
  });
  expect(readPngDimensions(downloadFailedPng)).toEqual({ height: 900, width: 1440 });

  // 软删二次确认：点击删除只弹确认框，未确认前不得发出删除 mutation
  await page.getByRole('button', { name: '删 除' }).click();
  await expect(
    page.getByText('确认删除该参考资料？删除后将不再显示，且当前版本不提供恢复入口。'),
  ).toBeVisible();
  // 正控（Trae P3-5）：先证明 recorded 确实在被填充。否则「软删请求为 0」在
  // stub 未接线 / 未命中详情 Query 时同样成立，属恒真断言。
  expect(recorded, 'recorded 应已记录详情 Query（正控）').toContain('ReferenceDocument');

  expect(
    recorded.filter((name) => name === 'SoftDeleteReferenceDocument'),
    '未确认前不得发出软删请求',
  ).toHaveLength(0);

  const deleteConfirmFileName = buildEvidenceFileName({
    area: 'reference-document-delete-confirm',
    capturedAt,
    role: 'SUPER_ADMIN',
    viewportLabel: '1440x900',
  });
  const deleteConfirmPng = path.join(evidenceDir, deleteConfirmFileName);
  const deleteConfirmCapture = await captureStableViewport(page, {
    fileName: deleteConfirmFileName,
    filePath: deleteConfirmPng,
  });
  expect(readPngDimensions(deleteConfirmPng)).toEqual({ height: 900, width: 1440 });

  // 取消确认后仍停留详情页，且始终未发出删除请求
  await page.getByRole('button', { name: '取 消' }).click();
  await expect(detailRoot.locator('.ant-card-head-title')).toHaveText(LONG_TITLE);
  expect(recorded.filter((name) => name === 'SoftDeleteReferenceDocument')).toHaveLength(0);

  expect(
    new Set([downloadFailedCapture.gitSha, deleteConfirmCapture.gitSha]).size,
    '下载失败/删除确认两张截图必须共享同一 SHA',
  ).toBe(1);

  const evidenceJson = path.join(evidenceDir, 'reference-document-download-delete-evidence.json');
  writeFileSync(
    evidenceJson,
    JSON.stringify(
      {
        capturedAt: capturedAt.toISOString(),
        gitSha: downloadFailedCapture.gitSha,
        recordedOperations: recorded,
        role: 'SUPER_ADMIN',
        screenshots: {
          deleteConfirm: deleteConfirmCapture,
          downloadFailed: downloadFailedCapture,
        },
      },
      null,
      2,
    ),
  );
  console.log(`[visual-evidence] ${evidenceJson}`);
});
