// src/app/layout/app-layout.spec.tsx

import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/app/providers';

import { AppLayout } from './app-layout';

// 会话事实源以桩替换：壳层测试只关心展示与导航结构，会话链路由 feature 自身测试覆盖。
const useAuthSessionMock = vi.fn();

vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return {
    ...actual,
    useAuthSession: () => useAuthSessionMock(),
  };
});

// sidecar 是重量级组件（会话/GraphQL 依赖），壳层测试中置空。
vi.mock('@/widgets/aigc-sidecar', () => ({
  AigcSidecar: () => null,
}));

// setup.ts 的 matchMedia 是静态 shim；S4 自动折叠用例需要可控的 matches 状态，
// 在测试内覆盖并在 afterEach 还原，避免污染 AntD 自身的响应式查询。
const originalMatchMedia = window.matchMedia;

type QueryListener = (event: { matches: boolean }) => void;

function stubNarrowViewport(initialMatches: boolean) {
  const listeners = new Set<QueryListener>();
  const narrowQuery = {
    matches: initialMatches,
    media: '(max-width: 1024px)',
  };
  const mediaQueryList = {
    ...narrowQuery,
    addEventListener: (_type: string, listener: QueryListener) => {
      listeners.add(listener);
    },
    addListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
    removeEventListener: (_type: string, listener: QueryListener) => {
      listeners.delete(listener);
    },
    removeListener: () => {},
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      query === '(max-width: 1024px)' ? mediaQueryList : originalMatchMedia(query),
  });

  return {
    setMatches(matches: boolean) {
      narrowQuery.matches = matches;
      mediaQueryList.matches = matches;

      for (const listener of listeners) {
        listener({ matches });
      }
    },
  };
}

function renderLayout(pathname: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[pathname]}>
        <Routes>
          <Route element={<AppLayout>页面内容</AppLayout>} path="*" />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function sessionFor(role: 'CUSTOMER' | 'ENGINEER' | 'SUPER_ADMIN') {
  return {
    session: {
      accessToken: 'token',
      accountId: 1,
      role,
      userInfo: { accessGroup: [role], nickname: `用户-${role}` },
    },
    status: 'authenticated',
  } as const;
}

describe('AppLayout（S3 壳层）', () => {
  afterEach(() => {
    cleanup();
    useAuthSessionMock.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('CUSTOMER 仅见首页、发起申请、我的申请', () => {
    useAuthSessionMock.mockReturnValue(sessionFor('CUSTOMER'));
    renderLayout('/customer');

    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '发起申请' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '我的申请' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '维修申请' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '用户管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '参考资料' })).not.toBeInTheDocument();
  });

  it('SUPER_ADMIN 仅见首页、参考资料、用户管理（文档数据库待 PR3 加入）', () => {
    useAuthSessionMock.mockReturnValue(sessionFor('SUPER_ADMIN'));
    renderLayout('/admin/users');

    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '用户管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '参考资料' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '文档数据库' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '发起申请' })).not.toBeInTheDocument();
  });

  it('业务子路由刷新后选中态按前缀恢复（/admin/users 选中用户管理而非首页）', () => {
    useAuthSessionMock.mockReturnValue(sessionFor('SUPER_ADMIN'));
    renderLayout('/admin/users');

    expect(screen.getByRole('link', { name: '用户管理' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '首页' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('底部展示真实当前用户卡与退出入口', () => {
    useAuthSessionMock.mockReturnValue(sessionFor('ENGINEER'));
    renderLayout('/engineer/repair-requests');

    expect(screen.getByText('用户-ENGINEER')).toBeInTheDocument();
    expect(screen.getByText('工程师')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument();
  });

  it('匿名会话仅展示不受角色限制的入口，不渲染用户卡', () => {
    useAuthSessionMock.mockReturnValue({ session: null, status: 'anonymous' });
    renderLayout('/login');

    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument();
    expect(screen.queryByText(/退出登录/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '用户管理' })).not.toBeInTheDocument();
  });

  it('窄视口（≤1024px）挂载时侧栏自动折叠（S4 P2-03）', () => {
    useAuthSessionMock.mockReturnValue(sessionFor('CUSTOMER'));
    stubNarrowViewport(true);
    renderLayout('/customer');

    expect(screen.getByRole('button', { name: '展开导航' })).toBeInTheDocument();
  });

  it('跨越窄视口断点时自动收敛/展开，宽屏恢复展开态', () => {
    useAuthSessionMock.mockReturnValue(sessionFor('CUSTOMER'));
    const narrowViewport = stubNarrowViewport(false);
    renderLayout('/customer');

    expect(screen.getByRole('button', { name: '折叠导航' })).toBeInTheDocument();

    act(() => narrowViewport.setMatches(true));
    expect(screen.getByRole('button', { name: '展开导航' })).toBeInTheDocument();

    act(() => narrowViewport.setMatches(false));
    expect(screen.getByRole('button', { name: '折叠导航' })).toBeInTheDocument();
  });
});
