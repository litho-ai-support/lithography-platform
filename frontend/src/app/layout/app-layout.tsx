// src/app/layout/app-layout.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Segmented, Tabs, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { getNavigationItems } from '@/app/navigation';
import { FONT_SCALE_OPTIONS, useTheme } from '@/app/providers';
import { APP_THEME_CSS_VAR_KEY } from '@/app/theme';

import { AigcSidecar } from '@/widgets/aigc-sidecar';

import type { AssistantRouteCandidate } from '@/entities/assistant-session';

import { EntryAccentGlyph } from './entry-accent-glyph';

function toRouteCandidate(
  item: ReturnType<typeof getNavigationItems>[number],
): AssistantRouteCandidate {
  return {
    description: item.description,
    id: item.id,
    label: item.label,
    path: item.path,
    tags: item.tags,
  };
}

function resolveActiveNavigationPath(
  pathname: string,
  items: ReturnType<typeof getNavigationItems>,
) {
  return items.find((item) => item.path === pathname)?.path;
}

type AppLayoutProps = {
  children?: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps = {}) {
  const [isSidecarOpen, setIsSidecarOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const wasSidecarOpenRef = useRef(isSidecarOpen);
  const [showShortcutHint, setShowShortcutHint] = useState(() =>
    typeof document === 'undefined'
      ? false
      : document.hasFocus() && document.visibilityState === 'visible',
  );
  const { fontScale, isDark, setFontScale, setIsDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationItems = useMemo(() => getNavigationItems(), []);
  const activeNavigationPath = resolveActiveNavigationPath(location.pathname, navigationItems);
  const navigationTabs = useMemo(
    () => navigationItems.map((item) => ({ key: item.path, label: item.label })),
    [navigationItems],
  );
  const routeCandidates = useMemo(
    () => navigationItems.map((item) => toRouteCandidate(item)),
    [navigationItems],
  );

  useEffect(() => {
    if (wasSidecarOpenRef.current && !isSidecarOpen) {
      triggerRef.current?.focus();
    }

    wasSidecarOpenRef.current = isSidecarOpen;
  }, [isSidecarOpen]);

  useEffect(() => {
    function syncPageFocus() {
      setShowShortcutHint(document.hasFocus() && document.visibilityState === 'visible');
    }

    syncPageFocus();
    window.addEventListener('focus', syncPageFocus);
    window.addEventListener('blur', syncPageFocus);
    document.addEventListener('visibilitychange', syncPageFocus);

    return () => {
      window.removeEventListener('focus', syncPageFocus);
      window.removeEventListener('blur', syncPageFocus);
      document.removeEventListener('visibilitychange', syncPageFocus);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSidecarOpen((previousValue) => !previousValue);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className={`app-shell ${APP_THEME_CSS_VAR_KEY}`}>
      <header className="app-header">
        <div className="flex min-w-0 items-center">
          <img alt="" className="brand-logo" src="/logo.svg" />
        </div>

        <nav aria-label="主导航" className="app-nav">
          <Tabs
            activeKey={activeNavigationPath}
            items={navigationTabs}
            onChange={(path) => navigate(path)}
            size="small"
            tabBarGutter={32}
          />
        </nav>

        <div className="app-header-actions">
          <div className="app-appearance-controls">
            <div className="app-font-scale-control">
              <Segmented
                onChange={(value) => {
                  if (value === 'compact' || value === 'standard' || value === 'comfortable') {
                    setFontScale(value);
                  }
                }}
                options={FONT_SCALE_OPTIONS}
                size="small"
                value={fontScale}
              />
            </div>
            <Tooltip title={isDark ? '切换浅色模式' : '切换深色模式'}>
              <span className="app-color-scheme-control">
                <Button
                  aria-label={isDark ? '切换浅色模式' : '切换深色模式'}
                  icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                  shape="circle"
                  type="text"
                  onClick={() => setIsDark((previousValue) => !previousValue)}
                />
              </span>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="app-main">{children ?? <Outlet />}</main>

      {!isSidecarOpen ? (
        <div className="entry-trigger-shell" data-entry-open="false">
          <Button
            ref={triggerRef}
            aria-keyshortcuts="Alt+K"
            shape="round"
            size="large"
            type="primary"
            onClick={() => setIsSidecarOpen(true)}
          >
            <div className="flex items-center gap-2">
              <EntryAccentGlyph inverse />
              <span>AI</span>
              {showShortcutHint ? <span className="entry-trigger-shortcut">Alt+K</span> : null}
            </div>
          </Button>
        </div>
      ) : null}

      <AigcSidecar
        onClose={() => setIsSidecarOpen(false)}
        onNavigate={(path) => {
          navigate(path);
          setIsSidecarOpen(false);
        }}
        open={isSidecarOpen}
        routeCandidates={routeCandidates}
      />
    </div>
  );
}
