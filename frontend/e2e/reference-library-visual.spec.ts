// e2e/reference-library-visual.spec.ts
//
// PR5 S3-1 / S3-5 / S3-6 / S3-7 独立资料列表（/reference-documents）局部视觉验收
//（无后端确定性版本）：会话由 helpers/auth-session-seed 预置，GraphQL 一律 stub，
// 不依赖真实后端、开发库或 backend/env/.env.development，fresh clone 直接可跑。
// 真实前后端链路（管理员上传/编辑/软删、工程师只读下载）由 reference-document-real.spec.ts
// 承担，职责分离。
//
// 验收内容（PR5 计划表 S3-1 / S3-5 / S3-6，数值源 frontend/docs/gkj-visual-baseline.md §6.3）：
// - 保持通用工作区与默认 PageHeader：五类整页 kb modifier（与 PR3 回归探针 kbVariantNodes
//   同一集合）为 0，且不出现 .kb-card / .kb-table-scope —— 知识库整页变体不扩到该路由；
// - 工具区：搜索框 36px / 6px 圆角，同排筛选控件 36px / 6px 圆角；
// - P1-1（S3 评审修复轮）：卡内「工具区—筛选区—表格—卡底分页」四段连续贴合，
//   工具区/筛选区各带 12px padding + 1px 底线，段间相对间距为 0（原型 gkj.html L1043-1072）；
// - P1-2（S3 评审修复轮）：输入非空后出现的清除按钮必须与知识库变体同源（透明底、无边框、
//   padding 0、浅灰 #94a3b8、cursor pointer），不得退化为浏览器默认按钮；
// - 紧凑表格：表头 35.5px / 10px，正文行 38.5px / 11px，行线 1px；
// - 卡底分页行：padding 12px 16px、10px 字号、两端对齐，含「共 N 条」；
// - 375×667 与 1440×900 均无整页横向滚动（横滚只允许发生在表格内部，基准 §6.4.4）；
// - S3-5：标题 / 说明 / 原始文件名三列单行截断（ellipsis + 原生 title 全文），三列**分别**验证
//   截断确实发生（scrollWidth > clientWidth）且不撑高行、不撑破页面，点击被截断单元格仍进入详情路由；
// - S3-7：本文件即 PR5「知识库表格局部对齐、整页变体不扩路由」基准的可执行副本，
//   数值取自 baseline §6.3 / §6.4.4，不改写 baseline §6 的适用路由与既有断言。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR/PR5-证据（本地可追溯，不随 PR 提交）。
//
// GraphQL stub 与夹具（LIST_ITEMS / LONG_TEXT_ITEMS / LONG_TITLE / LONG_DESCRIPTION /
// LONG_FILENAME）由 helpers/reference-document-mocks.ts 统一提供（PR5 S6 收口抽取），
// 本文件只导入，不再持有第二份平行实现。

import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { seedAuthSession } from './helpers/auth-session-seed';
import {
  installReferenceLibraryMocks,
  LIST_ITEMS,
  LONG_DESCRIPTION,
  LONG_FILENAME,
  LONG_TEXT_ITEMS,
  LONG_TITLE,
} from './helpers/reference-document-mocks';
import {
  buildEvidenceFileName,
  readPngDimensions,
  waitForFontsReady,
} from './helpers/visual-evidence';

const PAGE_PATH = '/reference-documents';
const ROLE = 'ENGINEER';

/** 基准 §6.3 的紧凑数值（取自原型实测，不是当前实现自证） */
const SEARCH_HEIGHT = '36px';
const SEARCH_RADIUS = '6px';
const HEAD_CELL_HEIGHT = '35.5px';
const HEAD_CELL_FONT_SIZE = '10px';
const BODY_CELL_HEIGHT = '38.5px';
const BODY_CELL_FONT_SIZE = '11px';
const FOOTER_PADDING = '12px 16px';
const FOOTER_FONT_SIZE = '10px';

/** PR3 回归探针 kbVariantNodes 的同一集合：整页知识库 modifier，独立资料页必须为 0。 */
const PAGE_LEVEL_KB_MODIFIERS = [
  '.kb-page',
  '.kb-card',
  '.page-header--kb',
  '.app-workspace--knowledge-base',
  '.app-main--knowledge-base',
] as const;

/** 视口清单：1440×900 为基准 §1 锁定视口；375×667 用于暴露整页横滚。 */
const VIEWPORTS = [
  { height: 900, label: '1440x900', width: 1440 },
  { height: 667, label: '375x667', width: 375 },
] as const;

test('独立资料列表局部对齐知识库表格：工具区 36px、紧凑密度与卡底分页（PR5 S3-1 / S3-6）', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });

  await seedAuthSession(page, ROLE);
  await installReferenceLibraryMocks(page);
  const capturedAt = new Date();
  const evidence: Record<string, unknown> = {};

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto(PAGE_PATH);
    await waitForFontsReady(page);

    // 通用工作区与默认页头：知识库整页变体不进入该路由
    await expect(page.locator('.page-title')).toHaveText('参考资料库');
    for (const selector of PAGE_LEVEL_KB_MODIFIERS) {
      await expect(page.locator(selector), `${selector} 不应出现在独立资料页`).toHaveCount(0);
    }
    await expect(page.locator('.kb-table-scope')).toHaveCount(0);

    await expect(page.getByText('光源模块维护指南')).toBeVisible();

    // 工具区：36px 搜索框 + 同排 36px 筛选控件（同一套 --radius-control）
    const search = page.locator('.reference-library-search');
    await expect(search).toHaveCount(1);
    expect(await search.evaluate((el) => getComputedStyle(el).height)).toBe(SEARCH_HEIGHT);
    expect(await search.evaluate((el) => getComputedStyle(el).borderRadius)).toBe(SEARCH_RADIUS);
    const searchIcon = search.locator('svg');
    expect(await searchIcon.evaluate((el) => getComputedStyle(el).height), '搜索图标 16×16').toBe(
      '16px',
    );
    expect(await searchIcon.evaluate((el) => getComputedStyle(el).marginRight)).toBe('8px');

    // 筛选控件与搜索框同排等高（AntD v6 的 Select 视觉盒是 .ant-select 根元素，无 .ant-select-selector）
    const filterSelects = page.locator('.reference-library-filter-panel .ant-select');
    await expect(filterSelects).toHaveCount(2);
    const filterSelect = filterSelects.first();
    expect(await filterSelect.evaluate((el) => getComputedStyle(el).height)).toBe(SEARCH_HEIGHT);
    expect(await filterSelect.evaluate((el) => getComputedStyle(el).borderRadius)).toBe(
      SEARCH_RADIUS,
    );

    // 紧凑表格密度（基准 §6.3）
    const scope = page.locator('.reference-library-table-scope');
    await expect(scope).toHaveCount(1);
    const headCell = scope.locator('.ant-table-thead th').first();
    expect(await headCell.evaluate((el) => getComputedStyle(el).height)).toBe(HEAD_CELL_HEIGHT);
    expect(await headCell.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      HEAD_CELL_FONT_SIZE,
    );
    // 正文行取真实数据行：AntD 在开启 scroll.x 时会先渲染一条 height:0 的测量行，不能用 tbody td 首个
    const bodyCell = scope.locator('.ant-table-tbody tr.ant-table-row td.ant-table-cell').first();
    expect(await bodyCell.evaluate((el) => getComputedStyle(el).height)).toBe(BODY_CELL_HEIGHT);
    expect(await bodyCell.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      BODY_CELL_FONT_SIZE,
    );

    // 卡底分页行：统计 + 紧凑分页两端对齐
    const footer = page.locator('.reference-library-card-footer');
    await expect(footer).toHaveCount(1);
    await expect(footer).toContainText(`共 ${LIST_ITEMS.length} 条`);
    expect(await footer.evaluate((el) => getComputedStyle(el).padding)).toBe(FOOTER_PADDING);
    expect(await footer.evaluate((el) => getComputedStyle(el).fontSize)).toBe(FOOTER_FONT_SIZE);
    await expect(footer.locator('.ant-pagination')).toBeVisible();

    // P1-1（S3 评审修复轮）：卡内四段连续贴合，与原型 .kb-card 结构同构
    //（工具区 p-3 border-b → 表格 → 卡底 px-4 py-3，段间无额外间距）
    const cardBody = page.locator('.reference-library-card .ant-card-body');
    expect(
      await cardBody.evaluate((el) => getComputedStyle(el).paddingTop),
      '卡体不再自带内边距（由工具区 12px 承担）',
    ).toBe('0px');

    const toolbar = page.locator('.reference-library-toolbar');
    expect(await toolbar.evaluate((el) => getComputedStyle(el).padding)).toBe('12px');
    expect(
      await toolbar.evaluate((el) => getComputedStyle(el).borderBottomWidth),
      '工具区 1px 底线',
    ).toBe('1px');

    // 复检轮 O1：独立资料页不渲染 Card 卡头，与原型 .kb-card（工具区→表格→卡底）严格同构；
    // 列表标题由页面 PageHeader 承载（AntD Card 在无 title/extra 时不生成 .ant-card-head）。
    expect(
      await page.locator('.reference-library-card .ant-card-head').count(),
      '独立资料页不应渲染 Card 卡头（与原型 .kb-card 同构）',
    ).toBe(0);
    const cardTop = (await cardBody.boundingBox())?.y ?? Number.NaN;
    const toolbarTop = (await toolbar.boundingBox())?.y ?? Number.NaN;
    expect(
      Math.abs(toolbarTop - cardTop),
      `工具区应紧贴卡体顶部（无卡头时才成立，实测偏移 ${toolbarTop - cardTop}px）`,
    ).toBeLessThanOrEqual(0.5);

    const filterPanel = page.locator('.reference-library-filter-panel');
    expect(await filterPanel.evaluate((el) => getComputedStyle(el).padding)).toBe('12px');
    expect(
      await filterPanel.evaluate((el) => getComputedStyle(el).borderBottomWidth),
      '筛选区 1px 底线',
    ).toBe('1px');

    const segmentOffsets = await page.evaluate(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector);

        if (!el) {
          throw new Error(`缺少段节点：${selector}`);
        }

        const rect = el.getBoundingClientRect();

        return { bottom: rect.bottom, top: rect.top };
      };

      return {
        filter: box('.reference-library-filter-panel'),
        footer: box('.reference-library-card-footer'),
        table: box('.reference-library-table-scope'),
        toolbar: box('.reference-library-toolbar'),
      };
    });
    const gapAfterToolbar = segmentOffsets.filter.top - segmentOffsets.toolbar.bottom;
    const gapAfterFilter = segmentOffsets.table.top - segmentOffsets.filter.bottom;
    const gapAfterTable = segmentOffsets.footer.top - segmentOffsets.table.bottom;
    expect(
      Math.abs(gapAfterToolbar),
      `工具区与筛选区之间不应有额外间距（实测 ${gapAfterToolbar}px）`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(gapAfterFilter),
      `筛选区与表格之间不应有额外间距（实测 ${gapAfterFilter}px）`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(gapAfterTable),
      `表格与卡底分页之间不应有额外间距（实测 ${gapAfterTable}px）`,
    ).toBeLessThanOrEqual(0.5);

    // 横滚只允许发生在表格内部（基准 §6.4.4）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${viewport.label} 不应出现整页横向滚动`).toBeLessThanOrEqual(0);

    const fileName = buildEvidenceFileName({
      area: 'reference-library-list',
      capturedAt,
      role: ROLE,
      viewportLabel: viewport.label,
    });
    const pngPath = path.join(evidenceDir, fileName);
    await page.screenshot({ path: pngPath });
    const png = readPngDimensions(pngPath);
    expect(png).toEqual({ height: viewport.height, width: viewport.width });

    // P1-2（S3 评审修复轮）：清除按钮是「输入非空后才渲染」的 DOM，必须与 .kb-search-clear 同源。
    // 放在默认态截图之后执行，避免防抖重载影响前面的 ready 断言与截图内容。
    const searchInput = search.locator('input');
    await searchInput.fill('维护');
    const clearButton = search.locator('.reference-library-search-clear');
    await expect(clearButton).toHaveCount(1);
    const clearStyles = await clearButton.evaluate((el) => {
      const style = getComputedStyle(el);

      return {
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        color: style.color,
        cursor: style.cursor,
        marginLeft: style.marginLeft,
        padding: style.padding,
      };
    });
    expect(clearStyles, '清除按钮必须与 .kb-search-clear 同源，不得退化为浏览器默认按钮').toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderTopWidth: '0px',
      color: 'rgb(148, 163, 184)',
      cursor: 'pointer',
      marginLeft: '8px',
      padding: '0px',
    });
    const filledSearchPng = path.join(
      evidenceDir,
      `reference-library-search-filled-${viewport.label}.png`,
    );
    await search.screenshot({ path: filledSearchPng });

    evidence[viewport.label] = {
      clearStyles,
      fileName,
      filledSearchPng: path.basename(filledSearchPng),
      gaps: {
        afterFilter: gapAfterFilter,
        afterTable: gapAfterTable,
        afterToolbar: gapAfterToolbar,
      },
      overflow,
      png,
    };
  }

  const evidenceJson = path.join(evidenceDir, 'reference-library-visual-evidence.json');
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

test('长标题 / 说明 / 原始文件名单行截断且详情入口仍可操作（PR5 S3-5）', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const evidenceDir = testInfo.outputPath();
  mkdirSync(evidenceDir, { recursive: true });

  await seedAuthSession(page, ROLE);
  await installReferenceLibraryMocks(page, LONG_TEXT_ITEMS);
  const capturedAt = new Date();
  const evidence: Record<string, unknown> = {};

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto(PAGE_PATH);
    await waitForFontsReady(page);

    const scope = page.locator('.reference-library-table-scope');
    await expect(scope).toHaveCount(1);
    // 三个长文本列（标题 / 说明 / 原始文件名）统一走 ellipsis
    await expect(scope.locator('th.ant-table-cell-ellipsis')).toHaveCount(3);

    const row = scope.locator('.ant-table-tbody tr.ant-table-row').first();
    const ellipsisCells = row.locator('td.ant-table-cell-ellipsis');
    await expect(ellipsisCells).toHaveCount(3);

    const cellStyles = await ellipsisCells.evaluateAll((cells) =>
      cells.map((cell) => {
        const style = getComputedStyle(cell);
        return {
          overflow: style.overflow,
          textContent: cell.textContent ?? '',
          textOverflow: style.textOverflow,
          title: cell.getAttribute('title'),
          whiteSpace: style.whiteSpace,
        };
      }),
    );

    for (const [index, cell] of cellStyles.entries()) {
      expect(cell.overflow, `第 ${index + 1} 个长文本列 overflow`).toBe('hidden');
      expect(cell.textOverflow, `第 ${index + 1} 个长文本列 text-overflow`).toBe('ellipsis');
      expect(cell.whiteSpace, `第 ${index + 1} 个长文本列 white-space`).toBe('nowrap');
      // 原生 title 属性必须存在（与下一行精确值断言互补：此处只保证不缺失，不假设
      // 「渲染文本 == 原始值」——说明列 null 渲染为「—」、文件名 null 渲染为「纯文本」）
      expect(cell.title, `第 ${index + 1} 个长文本列原生 title 不应缺失`).toBeTruthy();
    }
    expect(cellStyles.map((cell) => cell.title)).toEqual([
      LONG_TITLE,
      LONG_DESCRIPTION,
      LONG_FILENAME,
    ]);

    // 截断必须真的发生：三列**分别**测量内容宽 > 可见宽
    //（P2-2 修复：此前只对标题列测量，却把结论写成「三列均已机械证明」）
    const truncation = await ellipsisCells.evaluateAll((cells) =>
      cells.map((cell) => ({
        clientWidth: cell.clientWidth,
        scrollWidth: cell.scrollWidth,
      })),
    );
    for (const [index, cell] of truncation.entries()) {
      expect(
        cell.scrollWidth,
        `第 ${index + 1} 个长文本列应真的被截断（内容宽 > 可见宽）`,
      ).toBeGreaterThan(cell.clientWidth);
    }
    const titleCell = ellipsisCells.first();

    // 单行截断不撑高行：仍保持基准 §6.3 的 38.5px 正文行高
    expect(await row.evaluate((el) => getComputedStyle(el).height)).toBe(BODY_CELL_HEIGHT);

    // 整页仍无横向滚动（长文本不得撑破页面，基准 §6.4.4）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${viewport.label} 长文本不应造成整页横向滚动`).toBeLessThanOrEqual(0);

    const fileName = buildEvidenceFileName({
      area: 'reference-library-long-text',
      capturedAt,
      role: ROLE,
      viewportLabel: viewport.label,
    });
    const pngPath = path.join(evidenceDir, fileName);
    await page.screenshot({ path: pngPath });
    const png = readPngDimensions(pngPath);
    expect(png).toEqual({ height: viewport.height, width: viewport.width });

    // 详情入口仍可操作：点击被截断的标题单元格仍进入详情路由
    await titleCell.click();
    await expect(page).toHaveURL(new RegExp(`/reference-documents/${LONG_TEXT_ITEMS[0].id}$`));

    evidence[viewport.label] = { fileName, overflow, png, truncation };
  }

  const evidenceJson = path.join(evidenceDir, 'reference-library-long-text-evidence.json');
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
