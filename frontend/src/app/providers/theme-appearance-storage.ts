// src/app/providers/theme-appearance-storage.ts

// appearance 持久化 adapter：localStorage 属于外部技术边界（见 docs/infrastructure-rules.md），
// Theme Provider 只消费这里的读写接口，不直接接触 localStorage。
import { FONT_SCALE_OPTIONS, type FontScale } from './theme-constants';

const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';
const FONT_SCALE_STORAGE_KEY = 'font-scale';

export function readStoredColorScheme(): 'dark' | 'light' {
  try {
    return window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function storeColorScheme(colorScheme: 'dark' | 'light'): void {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
  } catch {
    // Storage can be unavailable in restricted browsers.
  }
}

export function readStoredFontScale(): FontScale {
  try {
    const saved = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY) as FontScale | null;

    if (saved && FONT_SCALE_OPTIONS.some((option) => option.value === saved)) {
      return saved;
    }
  } catch {
    return 'standard';
  }

  return 'standard';
}

export function storeFontScale(fontScale: FontScale): void {
  try {
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale);
  } catch {
    // Storage can be unavailable in restricted browsers.
  }
}
