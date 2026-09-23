// 管理员文档数据库知识库视觉基准验收与证据采集（PR3 第三轮 Review S1 改版）。
//
// 本 spec 为「无后端确定性视觉验收」：GraphQL 全部走仓库内 mock
//（helpers/admin-document-kb-mocks.ts，最小完整四 Tab 数据），会话由
// helpers/auth-session-seed 预置——不依赖真实后端、开发库、
// backend/env/.env.development、本机账号或任何未入库文件，fresh clone 直接可跑。
// 真实前后端链路（含登录）由 admin-document-database-real.spec.ts 单独承担，职责分离。
//
// 验收内容：
// - 数值基准（KB_BASELINE）由原型实测固化为入库真源：本文件常量 + frontend/docs/gkj-visual-baseline.md
//   第 6 节；自动化只验证当前实现的 computed style、几何、overflow 和截图物理尺寸，
//   不在运行时读取原型文件，也不访问任何远程 CDN。原型并排对照仅作为可选人工流程。
// - 三视口（1920×1080、1440×900、1366×768）× 四标签共 12 张整页截图；1920 套
//   不隐藏全局 AI 浮动入口，其余两套按复查建议隐藏；必须为 viewport 截图，
//   物理尺寸严格等于指定视口（不得用 fullPage 高度替代指定分辨率）；
// - 重点机械断言：纯色工作区 #f3f4f6、宽屏铺满（内容右缘 = 视口 - 26）、页头
//   10/20/12px 层级、卡片 10px 圆角/轻阴影、工具区 61px 内 12px/36px 搜索框、
//   表头 10px、正文 11px、单元格 10px 9px；每视口附页头、汇总、工具区、表头和
//   一行正文的 1:1 实现局部图（元素截图不二次缩放，供与原型人工并排对照）；
// - 维修申请「型号告警态」：告警与表格同卡（工具区 → 告警 → 表格相邻无外部间距）；
// - S→M→L→M：L 下搜索/筛选/分页/操作/退出可达、无整页横滚；回 M 恢复基准；
// - 共享外观回归：登录、用户管理、客户申请、独立参考资料页保持默认外观，
//   知识库变体只作用于 /admin/document-database。
//
// 截图与 JSON 写入 testInfo outputPath（frontend/test-results/...），由采集人复制归档到
// docs/tmp/PR 证据目录（本地可追溯，不随 PR 提交）。

import { expect, type Locator, type Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { installAdminDocumentKbGraphqlMocks } from './helpers/admin-document-kb-mocks';
import { seedAuthSession } from './helpers/auth-session-seed';

const PAGE_PATH = '/admin/document-database';
const MODEL_WARNING_TEXT = '设备型号选项加载失败';

/**
 * 知识库页数值基准（Playwright Chromium，dpr=1，根字号 16px，1440×900）。
 * 真源：frontend/docs/gkj-visual-baseline.md 第 6 节 + 本常量（原型实测固化为入库基准，
 * 第三轮 Review S1 起，自动化不再运行时读取原型文件）。修改基准必须先改文档再改这里。
 */
const KB_BASELINE = {
  card: {
    backgroundColor: 'rgb(255, 255, 255)',
    borderColor: 'rgb(229, 231, 235)', // #e5e7eb
    borderRadius: '10px',
    boxShadow: 'rgba(15, 23, 42, 0.05) 0px 1px 3px 0px',
    padding: '0px',
  },
  footer: {
    color: 'rgb(148, 163, 184)', // #94a3b8
    fontSize: '10px',
    padding: '12px 16px',
  },
  header: {
    description: {
      color: 'rgb(100, 116, 139)', // #64748b
      fontSize: '12px',
      lineHeight: '16px',
      marginTop: '4px',
    },
    eyebrow: {
      color: 'rgb(37, 99, 235)', // #2563eb
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '1.8px', // 0.18em
      lineHeight: '15px',
      marginBottom: '4px',
      textTransform: 'uppercase',
    },
    marginBottom: '20px',
    title: {
      color: 'rgb(30, 41, 59)', // #1e293b
      fontSize: '20px',
      fontWeight: '700',
      lineHeight: '28px',
    },
  },
  search: {
    backgroundColor: 'rgb(248, 250, 252)', // #f8fafc
    borderColor: 'rgb(226, 232, 240)', // #e2e8f0
    borderRadius: '6px',
    height: '36px',
    padding: '0px 12px',
  },
  searchInput: {
    color: 'rgb(51, 65, 85)', // #334155
    fontSize: '12px',
    lineHeight: '16px',
  },
  summary: {
    cellPadding: '16px',
    height: 67.5, // border-box（1440/1366/1920 实测一致）
    label: {
      color: 'rgb(148, 163, 184)',
      fontSize: '9px',
      letterSpacing: '0.45px', // 0.05em
      textTransform: 'uppercase',
    },
    value: {
      color: 'rgb(51, 65, 85)',
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: '16px',
      marginTop: '4px',
    },
  },
  table: {
    td: {
      borderBottomColor: 'rgb(241, 245, 249)', // #f1f5f9
      color: 'rgb(51, 65, 85)',
      fontSize: '11px',
      height: '38.5px', // 原型正文行高实测；固定高度 + 垂直居中，控件不再撑高行盒
      lineHeight: '16.5px',
      padding: '0px 9px',
    },
    th: {
      backgroundColor: 'rgb(248, 250, 252)',
      borderBottomColor: 'rgb(229, 231, 235)',
      color: 'rgb(100, 116, 139)',
      fontSize: '10px',
      fontWeight: '600',
      height: '35.5px', // 原型表头实测；固定高度 + 垂直居中
      lineHeight: '15px',
      padding: '0px 9px',
    },
  },
  toolbar: {
    borderBottomColor: 'rgb(241, 245, 249)',
    borderBottomWidth: '1px',
    gap: '8px',
    height: '61px',
    padding: '12px',
  },
  toolbarButton: {
    backgroundColor: 'rgb(255, 255, 255)',
    borderColor: 'rgb(226, 232, 240)',
    borderRadius: '6px',
    color: 'rgb(71, 85, 105)', // #475569
    fontSize: '12px',
    height: '36px',
    padding: '0px 12px',
  },
  workspace: {
    backgroundColor: 'rgb(243, 244, 246)', // #f3f4f6 纯色
    padding: '22px 26px 32px',
  },
} as const;

/** 原型侧栏宽 210 + 工作区左 padding 26 = 内容左缘 236；右缘 = 视口 - 26。 */
const KB_CONTENT_LEFT = 236;
const KB_CONTENT_RIGHT_GAP = 26;

const TABS = [
  { fileStem: 'reference-documents', name: '参考资料' },
  { fileStem: 'repair-requests', name: '维修申请' },
  { fileStem: 'ai-conversations', name: 'AI 会话' },
  { fileStem: 'ai-reports', name: 'AI 报告' },
] as const;

// 1920 先行：浮动入口隐藏样式一旦注入无法撤销（addStyleTag 全局生效），
// 1920 套必须保留 AI 浮动入口（计划「至少一套不隐藏」）。
const VIEWPORTS = [
  { height: 1080, width: 1920 },
  { height: 900, width: 1440 },
  { height: 768, width: 1366 },
] as const;

function activePane(page: Page): Locator {
  return page.locator('.ant-tabs-tabpane-active');
}

/** 点击标签并等待该标签数据态落定（表格行 / 空态 / 错误告警任一出现，骨架屏退场），
    并等 Tabs 下划线（ink bar）过渡动画到位后再取证：
    切换相邻标签时 aria-selected / pane 先变、下划线后到，避免截图定格在过渡中间态。 */
async function focusTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  const pane = activePane(page);
  await expect(pane.locator('.kb-card').first()).toBeVisible();
  await expect(
    pane
      .locator(
        '.ant-table-tbody tr.ant-table-row, .kb-card-state .ant-empty, .kb-card-state .ant-alert-error',
      )
      .first(),
  ).toBeVisible({ timeout: 15_000 });
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

/** AI 浮动入口（entry-trigger-shell）为全局组件：1440/1366 套按复查建议隐藏减少
    视觉噪声；1920 套不调用本函数（计划要求至少一套保留）。 */
async function hideNonPr3FloatingEntry(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.entry-trigger-shell { display: none !important; }' });
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

/** 读取页面级知识库基准：工作区、页头、汇总条与页面横滚余量。 */
async function measureKbPage(page: Page) {
  return page.evaluate(() => {
    const requireElement = <T extends Element>(selector: string, root: ParentNode): T => {
      const el = root.querySelector<T>(selector);
      if (el === null) throw new Error(`缺少 ${selector}`);
      return el;
    };
    const g = (el: Element) => getComputedStyle(el);
    const rect = (el: Element) => {
      const b = el.getBoundingClientRect();
      return {
        bottom: +b.bottom.toFixed(2),
        height: +b.height.toFixed(2),
        left: +b.left.toFixed(2),
        right: +b.right.toFixed(2),
        top: +b.top.toFixed(2),
        width: +b.width.toFixed(2),
      };
    };
    const root = document.documentElement;
    const workspace = requireElement<HTMLElement>('.app-workspace', document);
    const main = requireElement<HTMLElement>('.app-main', document);
    const header = requireElement<HTMLElement>('.page-header--kb', document);
    const eyebrow = requireElement<HTMLElement>('.page-header--kb .page-eyebrow', document);
    const title = requireElement<HTMLElement>('.page-header--kb .page-title', document);
    const description = requireElement<HTMLElement>('.page-header--kb .page-description', document);
    const summary = requireElement<HTMLElement>('.kb-card.kb-summary', document);
    const summaryCell = requireElement<HTMLElement>('.kb-summary-cell', summary);
    const summaryLabel = requireElement<HTMLElement>('.kb-summary-label', summary);
    const summaryValue = requireElement<HTMLElement>('.kb-summary-value', summary);
    return {
      devicePixelRatio: window.devicePixelRatio,
      dock: root.scrollWidth - root.clientWidth,
      header: {
        description: {
          color: g(description).color,
          fontSize: g(description).fontSize,
          lineHeight: g(description).lineHeight,
          marginTop: g(description).marginTop,
        },
        eyebrow: {
          color: g(eyebrow).color,
          fontSize: g(eyebrow).fontSize,
          fontWeight: g(eyebrow).fontWeight,
          letterSpacing: g(eyebrow).letterSpacing,
          lineHeight: g(eyebrow).lineHeight,
          marginBottom: g(eyebrow).marginBottom,
          textTransform: g(eyebrow).textTransform,
        },
        marginBottom: g(header).marginBottom,
        rect: rect(header),
        title: {
          color: g(title).color,
          fontSize: g(title).fontSize,
          fontWeight: g(title).fontWeight,
          lineHeight: g(title).lineHeight,
        },
      },
      main: { maxWidth: g(main).maxWidth },
      rootFontSize: g(root).fontSize,
      summary: {
        cellPadding: g(summaryCell).padding,
        label: {
          color: g(summaryLabel).color,
          fontSize: g(summaryLabel).fontSize,
          letterSpacing: g(summaryLabel).letterSpacing,
          textTransform: g(summaryLabel).textTransform,
        },
        rect: rect(summary),
        value: {
          color: g(summaryValue).color,
          fontSize: g(summaryValue).fontSize,
          fontWeight: g(summaryValue).fontWeight,
          lineHeight: g(summaryValue).lineHeight,
          marginTop: g(summaryValue).marginTop,
        },
      },
      viewport: { height: root.clientHeight, width: root.clientWidth },
      workspace: {
        backgroundColor: g(workspace).backgroundColor,
        backgroundImage: g(workspace).backgroundImage,
        padding: g(workspace).padding,
      },
    };
  });
}

/** 读取当前激活标签的知识库卡：工具区、主搜索、表格密度、卡底与表格内横滚。 */
async function measureKbPane(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.ant-tabs-tabpane-active');
    if (pane === null) throw new Error('缺少激活标签面板');
    const requireElement = <T extends Element>(selector: string): T => {
      const el = pane.querySelector<T>(selector);
      if (el === null) throw new Error(`激活标签缺少 ${selector}`);
      return el;
    };
    const g = (el: Element) => getComputedStyle(el);
    const rect = (el: Element) => {
      const b = el.getBoundingClientRect();
      return {
        bottom: +b.bottom.toFixed(2),
        height: +b.height.toFixed(2),
        left: +b.left.toFixed(2),
        right: +b.right.toFixed(2),
        top: +b.top.toFixed(2),
        width: +b.width.toFixed(2),
      };
    };
    const card = requireElement<HTMLElement>('.kb-card');
    const toolbar = requireElement<HTMLElement>('.kb-toolbar');
    const search = requireElement<HTMLElement>('.kb-search');
    const searchInput = requireElement<HTMLElement>('.kb-search input');
    const searchIcon = requireElement<Element>('.kb-search svg');
    const toolbarButton = requireElement<HTMLElement>('.kb-toolbar-button');
    const th = requireElement<HTMLElement>('.kb-table-scope .ant-table-thead th');
    const firstRow = requireElement<HTMLElement>(
      '.kb-table-scope .ant-table-tbody tr.ant-table-row',
    );
    const td = firstRow.querySelector<HTMLElement>('td');
    if (td === null) throw new Error('表格首行缺少单元格');
    const footer = requireElement<HTMLElement>('.kb-card-footer');
    // AntD 在设置 scroll.x 后以 .ant-table-content（或 .ant-table-body）为唯一横滚容器
    const scrollOwner =
      pane.querySelector<HTMLElement>('.kb-table-scope .ant-table-content') ??
      pane.querySelector<HTMLElement>('.kb-table-scope .ant-table-body');
    return {
      card: {
        backgroundColor: g(card).backgroundColor,
        borderColor: g(card).borderColor,
        borderRadius: g(card).borderRadius,
        boxShadow: g(card).boxShadow,
        padding: g(card).padding,
        rect: rect(card),
      },
      firstRowHeight: +firstRow.getBoundingClientRect().height.toFixed(2),
      footer: {
        color: g(footer).color,
        fontSize: g(footer).fontSize,
        padding: g(footer).padding,
      },
      search: {
        backgroundColor: g(search).backgroundColor,
        borderColor: g(search).borderColor,
        borderRadius: g(search).borderRadius,
        height: g(search).height,
        padding: g(search).padding,
      },
      searchIcon: {
        color: g(searchIcon).color,
        height: g(searchIcon).height,
        width: g(searchIcon).width,
      },
      searchInput: {
        color: g(searchInput).color,
        fontSize: g(searchInput).fontSize,
        lineHeight: g(searchInput).lineHeight,
      },
      tableScroll:
        scrollOwner === null
          ? null
          : {
              clientWidth: scrollOwner.clientWidth,
              overflowX: g(scrollOwner).overflowX,
              scrollWidth: scrollOwner.scrollWidth,
            },
      td: {
        borderBottomColor: g(td).borderBottomColor,
        color: g(td).color,
        fontSize: g(td).fontSize,
        height: g(td).height,
        lineHeight: g(td).lineHeight,
        padding: g(td).padding,
      },
      th: {
        backgroundColor: g(th).backgroundColor,
        borderBottomColor: g(th).borderBottomColor,
        color: g(th).color,
        fontSize: g(th).fontSize,
        fontWeight: g(th).fontWeight,
        height: g(th).height,
        lineHeight: g(th).lineHeight,
        padding: g(th).padding,
        rectHeight: +th.getBoundingClientRect().height.toFixed(2),
      },
      toolbar: {
        borderBottomColor: g(toolbar).borderBottomColor,
        borderBottomWidth: g(toolbar).borderBottomWidth,
        gap: g(toolbar).gap,
        height: g(toolbar).height,
        padding: g(toolbar).padding,
        rect: rect(toolbar),
      },
      toolbarButton: {
        backgroundColor: g(toolbarButton).backgroundColor,
        borderColor: g(toolbarButton).borderColor,
        borderRadius: g(toolbarButton).borderRadius,
        color: g(toolbarButton).color,
        fontSize: g(toolbarButton).fontSize,
        height: g(toolbarButton).height,
        padding: g(toolbarButton).padding,
      },
    };
  });
}

type KbPageSnapshot = Awaited<ReturnType<typeof measureKbPage>>;
type KbPaneSnapshot = Awaited<ReturnType<typeof measureKbPane>>;

function expectKbPageBaseline(snapshot: KbPageSnapshot, viewportWidth: number): void {
  expect(snapshot.rootFontSize).toBe('16px');
  // 纯色工作区（宽屏铺满由内容右缘校验）
  expect(snapshot.workspace.backgroundColor).toBe(KB_BASELINE.workspace.backgroundColor);
  expect(snapshot.workspace.backgroundImage).toBe('none');
  expect(snapshot.workspace.padding).toBe(KB_BASELINE.workspace.padding);
  expect(snapshot.main.maxWidth).toBe('none');
  // 无整页横滚；必要横滚只允许发生在表格内部（见 tableScroll 证据）
  expect(snapshot.dock).toBeLessThanOrEqual(0);
  // 宽屏铺满：内容左缘 236、右缘 = 视口 - 26（1280px 上限已解除）
  expect(snapshot.header.rect.left).toBe(KB_CONTENT_LEFT);
  expect(snapshot.header.rect.right).toBe(viewportWidth - KB_CONTENT_RIGHT_GAP);
  // 页头 10/20/12px 层级
  expect(snapshot.header.eyebrow).toEqual(KB_BASELINE.header.eyebrow);
  expect(snapshot.header.title).toEqual(KB_BASELINE.header.title);
  expect(snapshot.header.description).toEqual(KB_BASELINE.header.description);
  expect(snapshot.header.marginBottom).toBe(KB_BASELINE.header.marginBottom);
  // 汇总条 67.5px（border-box）+ 卡外观与分区排版
  expect(snapshot.summary.rect.height).toBe(KB_BASELINE.summary.height);
  expect(snapshot.summary.cellPadding).toBe(KB_BASELINE.summary.cellPadding);
  expect(snapshot.summary.label).toEqual(KB_BASELINE.summary.label);
  expect(snapshot.summary.value).toEqual(KB_BASELINE.summary.value);
}

function expectKbPaneBaseline(snapshot: KbPaneSnapshot): void {
  // 卡片：10px 圆角纯白卡 + 轻阴影
  expect(snapshot.card).toMatchObject({
    backgroundColor: KB_BASELINE.card.backgroundColor,
    borderColor: KB_BASELINE.card.borderColor,
    borderRadius: KB_BASELINE.card.borderRadius,
    boxShadow: KB_BASELINE.card.boxShadow,
    padding: KB_BASELINE.card.padding,
  });
  // 工具区：61px 高 / 12px padding / #f1f5f9 底线
  expect(snapshot.toolbar).toMatchObject({
    borderBottomColor: KB_BASELINE.toolbar.borderBottomColor,
    borderBottomWidth: KB_BASELINE.toolbar.borderBottomWidth,
    gap: KB_BASELINE.toolbar.gap,
    height: KB_BASELINE.toolbar.height,
    padding: KB_BASELINE.toolbar.padding,
  });
  // 主搜索框：36px 高 / 6px 圆角 / #f8fafc / #e2e8f0；输入 12/16 #334155；图标 16×16
  expect(snapshot.search).toMatchObject(KB_BASELINE.search);
  expect(snapshot.searchInput).toMatchObject(KB_BASELINE.searchInput);
  expect(snapshot.searchIcon).toMatchObject({ height: '16px', width: '16px' });
  expect(snapshot.toolbarButton).toMatchObject(KB_BASELINE.toolbarButton);
  // 表头 10px / #64748b / #f8fafc / 水平 padding 9px；表头高精确命中原型 35.5px（±0.5px
  // 浏览器渲染容差，负责人裁定不再使用宽容差）
  expect(snapshot.th).toMatchObject(KB_BASELINE.table.th);
  expect(snapshot.th.rectHeight).toBeGreaterThanOrEqual(35);
  expect(snapshot.th.rectHeight).toBeLessThanOrEqual(36);
  // 正文 11px / #334155 / 水平 padding 9px / 行线 #f1f5f9；四 Tab 行高统一精确命中原型
  // 38.5px（±0.5px 容差）——固定高度 + 垂直居中后 StatusPill / size=small 操作按钮
  // 不再以 inline-block 基线把行盒撑到 45px
  expect(snapshot.td).toMatchObject(KB_BASELINE.table.td);
  expect(snapshot.firstRowHeight).toBeGreaterThanOrEqual(38);
  expect(snapshot.firstRowHeight).toBeLessThanOrEqual(39);
  // 卡底：12px 16px / 10px / #94a3b8
  expect(snapshot.footer).toEqual(KB_BASELINE.footer);
}

/** 页面级截图前先读取文档就绪状态（等本地字体加载完成）。 */
async function waitForFontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

/** 采集 1:1 局部图：元素截图物理尺寸必须等于元素 CSS 尺寸（dpr=1、不二次缩放）。 */
async function shootLocal(
  page: Page,
  locator: Locator,
  filePath: string,
  evidence: Record<string, unknown>,
  name: string,
): Promise<void> {
  await locator.screenshot({ path: filePath });
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`局部图 ${name} 无 boundingBox`);
  const png = readPngDimensions(filePath);
  expect(Math.abs(png.width - Math.round(box.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(png.height - Math.round(box.height))).toBeLessThanOrEqual(1);
  evidence[name] = { png, boxHeight: +box.height.toFixed(2), boxWidth: +box.width.toFixed(2) };
}

/** 表头 + 一行正文跨元素：用 clip 合成连续区域（同 1:1 校验）。 */
async function shootTheadFirstRow(
  page: Page,
  pane: Locator,
  filePath: string,
  evidence: Record<string, unknown>,
  name: string,
): Promise<void> {
  const theadBox = await pane.locator('.kb-table-scope .ant-table-thead').boundingBox();
  const rowBox = await pane
    .locator('.kb-table-scope .ant-table-tbody tr.ant-table-row')
    .first()
    .boundingBox();
  if (theadBox === null || rowBox === null) throw new Error('缺少表头或首行');
  const clip = {
    height: rowBox.y + rowBox.height - theadBox.y,
    width: Math.max(theadBox.width, rowBox.width),
    x: theadBox.x,
    y: theadBox.y,
  };
  await page.screenshot({ path: filePath, clip });
  const png = readPngDimensions(filePath);
  expect(Math.abs(png.width - Math.round(clip.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(png.height - Math.round(clip.height))).toBeLessThanOrEqual(2);
  evidence[name] = { clipHeight: +clip.height.toFixed(2), clipWidth: +clip.width.toFixed(2), png };
}

/** 每个视口：实现侧页头/汇总/工具区/表头+首行 4 张 1:1 局部图（参考资料标签激活时），
    供采集人与原型在相同视口/字号档并排人工对照。 */
async function captureImplementationLocals(
  page: Page,
  viewport: { height: number; width: number },
  outputDir: string,
): Promise<Record<string, unknown>> {
  const tag = `${viewport.width}x${viewport.height}`;
  await focusTab(page, '参考资料');
  const pane = activePane(page);
  const evidence: Record<string, unknown> = {};
  await shootLocal(
    page,
    page.locator('.page-header--kb'),
    path.join(outputDir, `kb-local-${tag}-header.png`),
    evidence,
    'header',
  );
  await shootLocal(
    page,
    page.locator('.kb-card.kb-summary'),
    path.join(outputDir, `kb-local-${tag}-summary.png`),
    evidence,
    'summary',
  );
  await shootLocal(
    page,
    pane.locator('.kb-toolbar'),
    path.join(outputDir, `kb-local-${tag}-toolbar.png`),
    evidence,
    'toolbar',
  );
  await shootTheadFirstRow(
    page,
    pane,
    path.join(outputDir, `kb-local-${tag}-thead-first-row.png`),
    evidence,
    'theadFirstRow',
  );
  return evidence;
}

test.describe('mocked admin document database - knowledge base visual baseline (PR3 R3)', () => {
  test('M 档四标签三视口：12 张整页截图、kb 机械基准、1:1 局部图与 JSON 证据', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    await installAdminDocumentKbGraphqlMocks(page);
    await seedAuthSession(page, 'SUPER_ADMIN');

    const evidenceDir = testInfo.outputPath();
    mkdirSync(evidenceDir, { recursive: true });

    await page.setViewportSize({ height: 1080, width: 1920 });
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();
    await waitForFontsReady(page);
    await expectFontScale(page, 'M');

    const evidence: Record<string, unknown> = {};
    const tables: Record<string, unknown> = {};

    for (const viewport of VIEWPORTS) {
      const tag = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);

      // 1920 套保留 AI 浮动入口（至少一套不隐藏）；1440/1366 套隐藏减少噪声
      const floatingEntryPreserved = viewport.width === 1920;
      if (floatingEntryPreserved) {
        await expect(page.locator('.entry-trigger-shell')).toBeVisible();
      } else {
        await hideNonPr3FloatingEntry(page);
        await expect(page.locator('.entry-trigger-shell')).toBeHidden();
      }

      const tabEvidence: Record<string, unknown> = {};
      for (const tab of TABS) {
        await focusTab(page, tab.name);
        const pageSnapshot = await measureKbPage(page);
        const paneSnapshot = await measureKbPane(page);
        // 浏览器 100% 缩放（设备像素比 1）与 M 档基准（root 16px）
        expect(pageSnapshot.devicePixelRatio).toBe(1);
        expectKbPageBaseline(pageSnapshot, viewport.width);
        expectKbPaneBaseline(paneSnapshot);

        // 复查 B2：viewport 截图（不加 fullPage），物理尺寸必须严格等于指定视口
        const key = `kb-visual-${tab.fileStem}-M-${tag}`;
        const pngPath = path.join(evidenceDir, `${key}.png`);
        await page.screenshot({ path: pngPath });
        const png = readPngDimensions(pngPath);
        expect(png).toEqual({ height: viewport.height, width: viewport.width });

        // 按钮半径规则（frontend/docs/gkj-visual-baseline.md 6.5）：主按钮 8px、
        // 表格操作（size=small）6px、状态胶囊 999px；搜索框/工具按钮 6px 已由
        // KB_BASELINE.toolbarButton/search 覆盖。第三轮修复起逐 Tab 覆盖：
        // 凡表格内出现操作按钮/状态胶囊即断言，不再只盯单一 Tab。
        if (tab.fileStem === 'reference-documents') {
          const primaryRadius = await page
            .locator('.kb-primary-action .ant-btn')
            .evaluate((el) => getComputedStyle(el).borderRadius);
          expect(primaryRadius, '主按钮半径规则').toBe('8px');
        }
        const paneLoc = activePane(page);
        const tableAction = paneLoc.locator('.kb-table-scope .ant-table-tbody .ant-btn');
        if ((await tableAction.count()) > 0) {
          const actionRadius = await tableAction
            .first()
            .evaluate((el) => getComputedStyle(el).borderRadius);
          expect(actionRadius, `${tab.name} 表格操作按钮半径规则`).toBe('6px');
        }
        const pill = paneLoc.locator('.kb-table-scope .status-pill');
        if ((await pill.count()) > 0) {
          const pillRadius = await pill.first().evaluate((el) => getComputedStyle(el).borderRadius);
          expect(pillRadius, `${tab.name} 状态胶囊半径规则`).toBe('999px');
        }

        tabEvidence[tab.fileStem] = { page: pageSnapshot, pane: paneSnapshot, png, tab: tab.name };
      }

      // 每视口实现侧 1:1 局部图（供与原型人工并排对照）
      const localEvidence = await captureImplementationLocals(page, viewport, evidenceDir);

      evidence[tag] = {
        floatingEntryPreserved,
        local: localEvidence,
        tabs: tabEvidence,
      };
      for (const tab of TABS) {
        const paneSnapshot = (tabEvidence[tab.fileStem] as { pane: KbPaneSnapshot }).pane;
        tables[`${tab.fileStem}-${tag}`] = paneSnapshot.tableScroll;
      }
    }

    evidence.tableScroll = tables;
    const evidenceJson = path.join(evidenceDir, 'kb-visual-evidence.json');
    writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
    console.log(`[visual-evidence] ${evidenceJson}`);
  });

  test('维修申请型号告警态：工具区 → 告警 → 表格同卡相邻（1440×900）', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    // 仅让设备型号查询失败（网络层 abort），触发维修申请 Tab 的型号告警，
    // 用于确认告警出现时四个状态块仍以卡内相邻布局为真源（无外部间距叠加）
    await installAdminDocumentKbGraphqlMocks(page, {
      abortOperationNames: ['AdminDocumentDatabaseEquipmentModels'],
    });
    await seedAuthSession(page, 'SUPER_ADMIN');

    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto(PAGE_PATH);
    await waitForFontsReady(page);
    await hideNonPr3FloatingEntry(page);
    await expectFontScale(page, 'M');
    await focusTab(page, '维修申请');
    await expect(activePane(page).getByText(MODEL_WARNING_TEXT)).toBeVisible();

    const pageSnapshot = await measureKbPage(page);
    expectKbPageBaseline(pageSnapshot, 1440);

    // 告警在知识库卡内、与工具区/表格相邻；垂直间距只能来自 .kb-card-state 自身 padding
    // （单一真源），不得再叠加外层 margin / flex gap（上一轮 14+16=30px 重复留白的回归点）
    const geometry = await page.evaluate(() => {
      const pane = document.querySelector('.ant-tabs-tabpane-active');
      if (pane === null) throw new Error('缺少激活标签面板');
      const card = pane.querySelector('.kb-card');
      const toolbar = pane.querySelector('.kb-toolbar');
      const warning = Array.from(pane.querySelectorAll('.ant-alert')).find((el) =>
        (el.textContent ?? '').includes('设备型号选项加载失败'),
      );
      const table = pane.querySelector('.kb-table-scope');
      if (card === null || toolbar === null || warning === undefined || table === null) {
        throw new Error('告警态缺少卡/工具区/告警/表格');
      }
      const toolbarRect = toolbar.getBoundingClientRect();
      const warningRect = warning.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const block = warning.parentElement;
      if (block === null) throw new Error('告警缺少包裹块');
      const blockStyle = getComputedStyle(block);
      return {
        alertMargin: getComputedStyle(warning).margin,
        blockPaddingBottom: +Number.parseFloat(blockStyle.paddingBottom).toFixed(2),
        blockPaddingTop: +Number.parseFloat(blockStyle.paddingTop).toFixed(2),
        gapAfterToolbar: +(warningRect.top - toolbarRect.bottom).toFixed(2),
        gapBeforeTable: +(tableRect.top - warningRect.bottom).toFixed(2),
        warningInsideCard: card.contains(warning),
      };
    });
    expect(geometry.warningInsideCard).toBe(true);
    // 唯一间距来源：区块 padding（上下对称），无额外 margin 叠加
    expect(geometry.alertMargin).toBe('0px');
    expect(geometry.gapAfterToolbar).toBe(geometry.blockPaddingTop);
    expect(geometry.gapBeforeTable).toBe(geometry.blockPaddingBottom);

    const pngPath = testInfo.outputPath('kb-repair-requests-M-model-warning-1440x900.png');
    await page.screenshot({ path: pngPath });
    expect(readPngDimensions(pngPath)).toEqual({ height: 900, width: 1440 });

    const evidenceJson = path.join(testInfo.outputPath(), 'kb-evidence-model-warning.json');
    writeFileSync(
      evidenceJson,
      JSON.stringify(
        { 'kb-repair-requests-M-model-warning-1440x900': { geometry, page: pageSnapshot } },
        null,
        2,
      ),
    );
    console.log(`[visual-evidence] ${evidenceJson}`);
  });

  test('按钮半径覆盖：列表失败态「重试」与摘要 Drawer 弹层「重试」均为 6px（1440×900）', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedAuthSession(page, 'SUPER_ADMIN');
    await page.setViewportSize({ height: 900, width: 1440 });

    // 阶段一：列表查询网络层 abort → 卡内失败态「重试」（size=small → 紧凑控件 6px）
    await installAdminDocumentKbGraphqlMocks(page, {
      abortOperationNames: ['AdminRepairRequests'],
    });
    await page.goto(PAGE_PATH);
    await hideNonPr3FloatingEntry(page);
    await focusTab(page, '维修申请');
    const pane = activePane(page);
    const listRetry = pane.getByRole('button', { name: /重\s*试/ }).first();
    await expect(listRetry).toBeVisible();
    const listRetryRadius = await listRetry.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(listRetryRadius, '列表失败态重试按钮半径规则').toBe('6px');

    // 阶段二：撤销旧路由后换装 mock，仅 abort 摘要查询 → Drawer 打开且弹层「重试」为 6px
    // （Drawer 渲染在 body 门户，不在 .kb-table-scope 内，必须单独覆盖弹层动作）
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installAdminDocumentKbGraphqlMocks(page, {
      abortOperationNames: ['AdminRepairRequestSummary'],
    });
    await page.goto(PAGE_PATH);
    await hideNonPr3FloatingEntry(page);
    await focusTab(page, '维修申请');
    await pane.locator('.kb-table-scope .ant-table-tbody .ant-btn').first().click();
    const drawer = page.locator('.ant-drawer').filter({ hasText: '维修申请摘要' });
    await expect(drawer).toBeVisible();
    // AntD 两字按钮会在中间插入全角空格（「重 试」），用正则容忍（同「摘 要」口径）
    const drawerRetry = drawer.getByRole('button', { name: /重\s*试/ });
    await expect(drawerRetry).toBeVisible();
    const drawerRetryRadius = await drawerRetry.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(drawerRetryRadius, 'Drawer 弹层重试按钮半径规则').toBe('6px');
  });

  test('S→M→L→M 往返：L 下搜索/筛选/分页/操作/退出可达、无整页横滚；回 M 恢复基准', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installAdminDocumentKbGraphqlMocks(page);
    await seedAuthSession(page, 'SUPER_ADMIN');

    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto(PAGE_PATH);
    await waitForFontsReady(page);
    await expectFontScale(page, 'M');
    await focusTab(page, '维修申请');

    const baseline = { page: await measureKbPage(page), pane: await measureKbPane(page) };
    expectKbPageBaseline(baseline.page, 1440);
    expectKbPaneBaseline(baseline.pane);

    await clickFontScale(page, 'S');
    expect((await measureKbPage(page)).rootFontSize).toBe('14px');

    await clickFontScale(page, 'L');
    expect((await measureKbPage(page)).rootFontSize).toBe('18px');

    // L 档可达性：搜索 / 筛选 / 分页 / 操作 / 退出都可到达，且无整页横滚
    const pane = activePane(page);
    const searchInput = pane.locator('.kb-search input');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEnabled();
    const filterButton = pane.getByRole('button', { name: '筛选' });
    await expect(filterButton).toBeVisible();
    await expect(filterButton).toBeEnabled();
    await filterButton.click();
    await expect(pane.locator('.kb-filter-panel')).toBeVisible();
    await filterButton.click();
    await expect(pane.locator('.kb-filter-panel')).toHaveCount(0);
    await expect(pane.locator('.kb-card-footer .ant-pagination')).toBeVisible();
    // AntD 两字按钮会在中间插入全角空格（「摘 要」），用正则容忍；
    // 固定列类名 AntD 6 为 fix-end（旧的 fix-right 不再出现），据此确认操作列确实固定
    await expect(
      pane
        .locator('.ant-table-cell-fix-end')
        .getByRole('button', { name: /摘\s*要/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible();
    expect((await measureKbPage(page)).dock).toBeLessThanOrEqual(0);

    await clickFontScale(page, 'M');
    const restored = { page: await measureKbPage(page), pane: await measureKbPane(page) };
    expect(restored).toEqual(baseline);
  });

  test('共享外观回归：登录/用户管理/客户申请/独立参考资料页保持默认外观', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await installAdminDocumentKbGraphqlMocks(page);
    const evidenceDir = testInfo.outputPath();
    mkdirSync(evidenceDir, { recursive: true });
    const evidence: Record<string, unknown> = {};

    /** 默认外观探针：不得出现知识库变体类；工作区保持渐变 + 内容 1280px 上限。 */
    const readShell = () =>
      page.evaluate(() => {
        const workspace = document.querySelector<HTMLElement>('.app-workspace');
        const main = document.querySelector<HTMLElement>('.app-main');
        return {
          kbVariantNodes: document.querySelectorAll(
            '.kb-page, .kb-card, .page-header--kb, .app-workspace--knowledge-base, .app-main--knowledge-base',
          ).length,
          mainMaxWidth: main === null ? null : getComputedStyle(main).maxWidth,
          workspaceBackgroundColor:
            workspace === null ? null : getComputedStyle(workspace).backgroundColor,
          workspaceBackgroundImage:
            workspace === null ? null : getComputedStyle(workspace).backgroundImage,
        };
      });

    const expectDefaultShell = async (label: string): Promise<void> => {
      const shell = await readShell();
      expect(shell.kbVariantNodes, `${label} 不应出现知识库变体节点`).toBe(0);
      if (shell.mainMaxWidth !== null) {
        expect(shell.mainMaxWidth, `${label} 应保持 1280px 上限`).toBe('1280px');
      }
      if (shell.workspaceBackgroundImage !== null) {
        expect(shell.workspaceBackgroundImage, `${label} 应保持渐变底`).toContain(
          'linear-gradient',
        );
      }
      evidence[label] = shell;
    };

    const shoot = async (fileName: string): Promise<void> => {
      const pngPath = path.join(evidenceDir, fileName);
      await page.screenshot({ path: pngPath });
      evidence[fileName] = readPngDimensions(pngPath);
    };

    await page.setViewportSize({ height: 900, width: 1440 });

    // 1) 登录页（未登录）
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
    await expectDefaultShell('login');
    await shoot('kb-shared-login-1440x900.png');

    // 2) 用户管理（SUPER_ADMIN）
    await seedAuthSession(page, 'SUPER_ADMIN');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
    await expectDefaultShell('admin-users');
    await shoot('kb-shared-admin-users-1440x900.png');

    // 3) 独立参考资料页（SUPER_ADMIN）
    await page.goto('/reference-documents');
    await expect(page.getByRole('heading', { name: '参考资料库' })).toBeVisible();
    await expectDefaultShell('reference-documents');
    await shoot('kb-shared-reference-documents-1440x900.png');

    // 对照：知识库页确实启用了变体（同登录态下页面之间互不影响）
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '文档数据库' })).toBeVisible();
    const kbShell = await readShell();
    expect(kbShell.kbVariantNodes).toBeGreaterThan(0);
    expect(kbShell.workspaceBackgroundColor).toBe(KB_BASELINE.workspace.backgroundColor);
    expect(kbShell.mainMaxWidth).toBe('none');
    evidence['admin-document-database'] = kbShell;

    // 4) 客户申请（CUSTOMER）：退出后换预置客户会话
    await page.getByRole('button', { name: /退出登录/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await seedAuthSession(page, 'CUSTOMER');
    await page.goto('/customer/repair-requests');
    await expect(page.getByRole('heading', { name: '我的维修申请' })).toBeVisible();
    await expectDefaultShell('customer-repair-requests');
    await shoot('kb-shared-customer-repair-requests-1440x900.png');

    const evidenceJson = path.join(evidenceDir, 'kb-shared-look-regression.json');
    writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
    console.log(`[visual-evidence] ${evidenceJson}`);
  });
});
