// src/app/providers/theme-provider.tsx

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ConfigProvider } from 'antd';

import { createAppThemeConfig } from '@/app/theme';

import { FONT_SCALE_CONFIG, type FontScale } from './theme-constants';
import { ThemeContext } from './use-theme';

function readStoredFontScale(): FontScale {
  try {
    const saved = localStorage.getItem('font-scale');

    if (saved === 'compact' || saved === 'standard' || saved === 'comfortable') {
      return saved;
    }
  } catch {
    return 'standard';
  }

  return 'standard';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('color-scheme') === 'dark';
    } catch {
      return false;
    }
  });
  const [fontScale, setFontScale] = useState<FontScale>(readStoredFontScale);
  const themeConfig = useMemo(
    () =>
      createAppThemeConfig({
        fontSize: FONT_SCALE_CONFIG[fontScale].antdFontSize,
        isDark,
      }),
    [fontScale, isDark],
  );

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SCALE_CONFIG[fontScale].htmlFontSize;

    try {
      localStorage.setItem('font-scale', fontScale);
    } catch {
      // Storage can be unavailable in restricted browsers.
    }
  }, [fontScale]);

  useEffect(() => {
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }

    try {
      localStorage.setItem('color-scheme', isDark ? 'dark' : 'light');
    } catch {
      // Storage can be unavailable in restricted browsers.
    }
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ fontScale, isDark, setFontScale, setIsDark }}>
      <ConfigProvider theme={themeConfig}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
