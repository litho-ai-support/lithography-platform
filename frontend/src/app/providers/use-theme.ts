// src/app/providers/use-theme.ts

import { createContext, useContext } from 'react';

import type { FontScale } from './theme-constants';

export type ThemeContextValue = {
  fontScale: FontScale;
  isDark: boolean;
  setFontScale: (scale: FontScale) => void;
  setIsDark: (value: boolean | ((previousValue: boolean) => boolean)) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
