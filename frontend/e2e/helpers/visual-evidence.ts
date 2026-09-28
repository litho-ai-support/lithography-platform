// e2e/helpers/visual-evidence.ts
//
// PR5 视觉证据采集的唯一收口（S2 起）：截图命名模板、PNG 物理尺寸读取、字体就绪等待。
// 各视觉 spec 一律导入本文件，不再各自复制一份（避免同一模板出现平行实现）。
//
// 命名模板真源：frontend/docs/gkj-visual-baseline.md 第 1 节
// `{区域}-viewport-{宽}x{高}-scale-{档位}-role-{角色}-zoom-100-{日期}-{时分}.png`。
// 「区域」承载被验收的页面与状态（如 customer-repair-request-list-failed），
// 从而在同一模板内区分同页不同状态的截图，不新增模板字段。

import type { Page } from '@playwright/test';
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
 */
export function buildEvidenceFileName(params: {
  area: string;
  scaleLevel?: EvidenceScaleLevel;
  viewportLabel: string;
  role: string;
  capturedAt: Date;
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
    `zoom-${EVIDENCE_ZOOM}`,
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
