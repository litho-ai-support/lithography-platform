// src/app/layout/app-layout.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppstoreOutlined,
  BugOutlined,
  CodeOutlined,
  ExperimentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Button, Segmented } from 'antd';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { getNavigationItems, resolveActiveNavigationPath } from '@/app/navigation';
import { FONT_SCALE_OPTIONS, useTheme } from '@/app/providers';
import { APP_THEME_CSS_VAR_KEY } from '@/app/theme';

import { AigcSidecar } from '@/widgets/aigc-sidecar';
import { type AuthSessionRole, LogoutButton, useAuthSession } from '@/features/auth-session';

import type { AssistantRouteCandidate } from '@/entities/assistant-session';

import { EntryAccentGlyph } from './entry-accent-glyph';
import {
  NavBookOpenIcon,
  NavChatIcon,
  NavDashboardIcon,
  NavListIcon,
  NavUserIcon,
} from './nav-icons';

// 侧栏用户卡的展示名映射：仅展示用途，角色判断一律走 auth-session 策略层。
const ROLE_LABELS: Record<AuthSessionRole, string> = {
  CUSTOMER: '客户',
  ENGINEER: '工程师',
  SUPER_ADMIN: '管理员',
};

// 导航图标：按 id 映射，折叠态靠图标辨识目标（审查 P1-04 修复）。
// 原型已对应的五个菜单用 gkj 描边 SVG（./nav-icons）；dev 专属入口仍用 AntD 图标
//（生产不可见）；未匹配项回落通用图标——折叠态必须始终有可见目标，
// 避免后续新增菜单漏配图标时留下空白热点（外审 R2 P2-01）。
const NAV_ITEM_ICONS: Record<string, ReactNode> = {
  'admin-users': <NavUserIcon />,
  'customer-repair-request-new': <NavChatIcon />,
  'customer-repair-requests': <NavListIcon />,
  'engineer-repair-requests': <NavListIcon />,
  'error-preview': <BugOutlined />,
  'game-2048-lab': <ExperimentOutlined />,
  home: <NavDashboardIcon />,
  'reference-documents': <NavBookOpenIcon />,
  'sandbox-playground': <CodeOutlined />,
  'shared-ui-gallery': <AppstoreOutlined />,
};

const FALLBACK_NAV_ICON = <AppstoreOutlined />;

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

type AppLayoutProps = {
  children?: ReactNode;
};

// 窄视口断点（S4）：≤1024px 时侧栏自动折叠，跨越断点时自动收敛/展开；
// 断点内用户仍可手动切换。任务书验收视口（1366×768、1440×900）不受影响。
const NARROW_VIEWPORT_QUERY = '(max-width: 1024px)';

export function AppLayout({ children }: AppLayoutProps = {}) {
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [isSidecarOpen, setIsSidecarOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const wasSidecarOpenRef = useRef(isSidecarOpen);
  const [showShortcutHint, setShowShortcutHint] = useState(() =>
    typeof document === 'undefined'
      ? false
      : document.hasFocus() && document.visibilityState === 'visible',
  );
  const { fontScale, setFontScale } = useTheme();
  const { session } = useAuthSession();
  const location = useLocation();
  const navigate = useNavigate();
  const activeRole = session?.role ?? null;
  const navigationItems = useMemo(() => getNavigationItems(undefined, activeRole), [activeRole]);
  const activeNavigationPath = useMemo(
    () => resolveActiveNavigationPath(location.pathname, navigationItems),
    [location.pathname, navigationItems],
  );
  const routeCandidates = useMemo(
    () => navigationItems.map((item) => toRouteCandidate(item)),
    [navigationItems],
  );

  useEffect(() => {
    const narrowQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);

    function syncCollapsedFromViewport() {
      setIsNavCollapsed(narrowQuery.matches);
    }

    syncCollapsedFromViewport();
    narrowQuery.addEventListener('change', syncCollapsedFromViewport);

    return () => {
      narrowQuery.removeEventListener('change', syncCollapsedFromViewport);
    };
  }, []);

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
      <aside className={`app-sidebar${isNavCollapsed ? ' app-sidebar--collapsed' : ''}`}>
        <div className="app-sidebar-brand">
          <Link className="app-sidebar-brand-link" to="/">
            {/* LF 标记：32×32、圆角 8px、深板岩底白色粗体，对齐原型品牌标识（色值见
                index.css 的 --brand-mark-* Token 与基准表）；文字为装饰性字形
                （aria-hidden），项目真名由右侧两级文字承担 */}
            <span aria-hidden="true" className="brand-mark">
              LF
            </span>
            {isNavCollapsed ? null : (
              <span className="app-sidebar-brand-text">
                <span className="app-sidebar-brand-name">光刻维护平台</span>
                {/* 品牌辅行：装饰性英文小字，对齐基准品牌区两级文字层级 */}
                <span className="app-sidebar-brand-subname">Service Platform</span>
              </span>
            )}
          </Link>
          <Button
            aria-label={isNavCollapsed ? '展开导航' : '折叠导航'}
            icon={isNavCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            size="small"
            type="text"
            onClick={() => setIsNavCollapsed((previousValue) => !previousValue)}
          />
        </div>

        <nav aria-label="主导航" className="app-sidebar-nav">
          {navigationItems.map((item) => (
            <Link
              key={item.id}
              aria-current={item.path === activeNavigationPath ? 'page' : undefined}
              className={`app-nav-item${
                item.path === activeNavigationPath ? ' app-nav-item--active' : ''
              }`}
              title={item.description}
              to={item.path}
            >
              <span aria-hidden="true">{NAV_ITEM_ICONS[item.id] ?? FALLBACK_NAV_ICON}</span>
              <span className="app-nav-item-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          {isNavCollapsed ? null : (
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
          )}
          {session ? (
            <div className="app-user-card">
              {!isNavCollapsed ? (
                /* 头像取真实会话昵称首字符（装饰性，aria-hidden）；无假身份信息 */
                <span aria-hidden="true" className="app-user-card-avatar">
                  {(session.userInfo?.nickname ?? '用户').trim().charAt(0).toUpperCase()}
                </span>
              ) : null}
              <div className="app-user-card-info">
                <span className="app-user-card-name">
                  {session.userInfo?.nickname ?? '当前用户'}
                </span>
                <span className="app-user-card-role">{ROLE_LABELS[session.role]}</span>
              </div>
              <div className="app-user-card-actions">
                <LogoutButton iconOnly={isNavCollapsed} />
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      {/* 工作区先占余宽（原型 workspace-page：渐变+22px 上距），内容再入 1280px 内层 */}
      <main className="app-workspace">
        <div className="app-main">{children ?? <Outlet />}</div>
      </main>

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
