// src/app/layout/app-layout.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
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
});
