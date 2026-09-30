// e2e/helpers/visual-evidence.ts
//
// PR5 视觉证据采集的唯一收口（S2 起）：截图命名模板、PNG 物理尺寸读取、字体就绪等待、
// 稳定截图（截图前滚动复位 + 构图前提检查 + 滚动/视口/页面模式/Git SHA 元数据）。
// 各视觉 spec 一律导入本文件，不再各自复制一份（避免同一模板出现平行实现）。
//
// 命名模板真源：frontend/docs/gkj-visual-baseline.md 第 1 节
// `{区域}-viewport-{宽}x{高}-scale-{档位}-role-{角色}-zoom-100-{日期}-{时分}.png`。
// 「区域」承载被验收的页面与状态（如 customer-repair-request-list-failed），
// 从而在同一模板内区分同页不同状态的截图，不新增模板字段。

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** 字号档位（基准 §1 对照环境锁定为 M 档） */
export const EVIDENCE_SCALE_LEVEL = 'M';
/** 合法字号档位：S→M→L→M 往返用例需要在文件名中如实标注当次档位。 */
export type EvidenceScaleLevel = 'S' | 'M' | 'L';
/** 浏览器缩放（基准 §1 锁定 100%） */
export const EVIDENCE_ZOOM = '100';

/** 截图前等本地字体加载完成（基准 §1 对照环境锁定要求）。 */
export async function waitForFontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

/**
 * 按基准 §1 模板生成证据文件名：
 * {区域}-viewport-{宽}x{高}-scale-{档位}-role-{角色}-zoom-100-{日期}-{时分}.png
 *
 * `scaleLevel` 缺省为基准锁定的 M 档，普通基准截图无需传参；只有 S→M→L→M 往返用例
 * 需要显式传入当次真实档位，避免 S/L 截图被写成 `scale-M` 而无法从文件名逐停靠点追溯。
 * 「区域」（`area`）在该用例中额外带步序，以区分往返中两次出现的 M 档。
 * `zoom` 缺省为基准锁定的 100%；200% 缩放验收用例显式传入 '200'（文件名如实标注）。
 */
export function buildEvidenceFileName(params: {
  area: string;
  scaleLevel?: EvidenceScaleLevel;
  viewportLabel: string;
  role: string;
  capturedAt: Date;
  zoom?: string;
}): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${params.capturedAt.getFullYear()}${pad(params.capturedAt.getMonth() + 1)}${pad(
    params.capturedAt.getDate(),
  )}`;
  const time = `${pad(params.capturedAt.getHours())}${pad(params.capturedAt.getMinutes())}`;

  return [
    params.area,
    `viewport-${params.viewportLabel}`,
    `scale-${params.scaleLevel ?? EVIDENCE_SCALE_LEVEL}`,
    `role-${params.role}`,
    `zoom-${params.zoom ?? EVIDENCE_ZOOM}`,
    date,
    time,
  ]
    .join('-')
    .concat('.png');
}

/** 从 PNG 头部读出物理尺寸：用于断言截图尺寸严格等于指定视口（不得用 fullPage 高度替代）。 */
export function readPngDimensions(filePath: string): { height: number; width: number } {
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

/**
 * 截图前滚动复位 + 构图前提检查 + 元数据采集（2026-09-30 S2 遗留修复）：
 * 视觉证据不得受上一用例/交互遗留的滚动位置影响——每次截图前强制 `scrollTo(0, 0)`
 * 并轮询确认，同时核对页头与侧栏品牌可见、主工作区稳定、无待完成动画，最后把
 * URL / 视口 / scrollX / scrollY / 文档宽 / 页面模式 / Git SHA / 文件名写回证据 JSON。
 */
export type ViewportCaptureMeta = {
  fileName: string;
  url: string;
  viewport: { height: number; width: number };
  scrollX: number;
  scrollY: number;
  documentScrollWidth: number;
  documentClientWidth: number;
  innerWidth: number;
  innerHeight: number;
  pageMode: string | null;
  gitSha: string;
};

let cachedGitSha: string | null = null;

/** 当前 Git HEAD（进程内缓存）：证据与提交时点对得上，不随工作区脏状态猜测。 */
export function readGitSha(): string {
  if (cachedGitSha === null) {
    try {
      cachedGitSha = execSync('git rev-parse HEAD', {
        cwd: process.cwd(),
        encoding: 'utf8',
      }).trim();
    } catch {
      cachedGitSha = 'unknown';
    }
  }

  return cachedGitSha;
}

/** 截图前等主工作区稳定：连续两次布局测量一致才算稳定（100ms 间隔，最多 5 次）。 */
async function waitForLayoutStable(page: Page, label: string): Promise<void> {
  const readLayout = () =>
    page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollY: window.scrollY,
    }));

  let previous = await readLayout();
  let stable = false;

  for (let attempt = 0; attempt < 5 && !stable; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await readLayout();

    stable = JSON.stringify(current) === JSON.stringify(previous);
    previous = current;
  }

  expect(stable, `${label} 截图前主工作区应稳定（连续两次布局测量应一致）`).toBe(true);
}

/**
 * 稳定截图：字体就绪 → 滚动复位到页面顶部并轮询确认 → 页头/品牌可见 → 排空有限动画 →
 * 布局稳定 → 截图 → 返回可对账的元数据。所有视觉证据截图一律经本函数，不得直调
 * `page.screenshot`（否则滚动位置污染无法审计）。
 */
export async function captureStableViewport(
  page: Page,
  options: { fileName: string; filePath: string },
): Promise<ViewportCaptureMeta> {
  const label = options.fileName;

  // 1) 字体就绪（基准 §1）
  await waitForFontsReady(page);

  // 2) 滚动复位：先滚到顶点，再轮询确认（残留滚动会让截图缺少顶部标题与品牌区）
  await page.evaluate(() => {
    window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
  });
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { message: `${label} 截图前 scrollY 未复位` })
    .toBe(0);

  // 3) 构图前提：页头与侧栏品牌可见（不含该结构的页面跳过该检查）
  const header = page.locator('.page-header');

  if ((await header.count()) > 0) {
    await expect(header, `${label} 截图时页头应可见`).toBeVisible();
  }

  const brand = page.locator('.app-sidebar-brand');

  if ((await brand.count()) > 0) {
    await expect(brand, `${label} 截图时侧栏品牌区应可见`).toBeVisible();
  }

  // 4) 排空有限动画（无限循环动画——如骨架 shimmer——不参与等待；它们不改变几何）
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();

      return timing !== undefined && timing.iterations !== Infinity;
    });

    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });

  // 5) 主工作区稳定后才截图
  await waitForLayoutStable(page, label);

  await page.screenshot({ path: options.filePath });

  // 6) 采集构图与滚动元数据（写回证据 JSON，截图与实况可逐张对账）
  const metrics = await page.evaluate(() => {
    const grid = document.querySelector('.customer-workspace-grid');

    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      pageMode: grid?.getAttribute('data-mode') ?? null,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      url: window.location.href,
    };
  });

  return {
    ...metrics,
    fileName: options.fileName,
    gitSha: readGitSha(),
    viewport: page.viewportSize() ?? { height: 0, width: 0 },
  };
}
