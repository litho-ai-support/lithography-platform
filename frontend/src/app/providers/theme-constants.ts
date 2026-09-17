// src/app/providers/theme-constants.ts

export type FontScale = 'compact' | 'standard' | 'comfortable';

// 字号档位（负责人 0916 裁定）：M 档对齐 gkj.html 原型基准——根字号 16px、
// AntD 正文 14px（原型 text-sm 层级）；S/L 以 M 为基准统一 ±2px，禁用 zoom/transform。
// 原生 CSS 侧的语义字号用 rem 表达，随根字号同步缩放；基准数值表见
// frontend/docs/gkj-visual-baseline.md（修改档位前先更新该表）。
export const FONT_SCALE_CONFIG: Record<
  FontScale,
  { antdFontSize: number; htmlFontSize: string; label: string }
> = {
  compact: { antdFontSize: 12, htmlFontSize: '14px', label: 'S' },
  standard: { antdFontSize: 14, htmlFontSize: '16px', label: 'M' },
  comfortable: { antdFontSize: 16, htmlFontSize: '18px', label: 'L' },
};

export const FONT_SCALE_OPTIONS: { label: string; value: FontScale }[] = [
  { label: 'S', value: 'compact' },
  { label: 'M', value: 'standard' },
  { label: 'L', value: 'comfortable' },
];
