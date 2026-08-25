// src/app/providers/theme-constants.ts

export type FontScale = 'compact' | 'standard' | 'comfortable';

export const FONT_SCALE_CONFIG: Record<
  FontScale,
  { antdFontSize: number; htmlFontSize: string; label: string }
> = {
  compact: { antdFontSize: 14, htmlFontSize: '16px', label: 'S' },
  standard: { antdFontSize: 16, htmlFontSize: '18px', label: 'M' },
  comfortable: { antdFontSize: 18, htmlFontSize: '20px', label: 'L' },
};

export const FONT_SCALE_OPTIONS: { label: string; value: FontScale }[] = [
  { label: 'S', value: 'compact' },
  { label: 'M', value: 'standard' },
  { label: 'L', value: 'comfortable' },
];
