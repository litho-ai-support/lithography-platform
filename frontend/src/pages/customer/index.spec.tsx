// src/pages/customer/index.spec.tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerPage } from './index';

const { navigateMock, authSessionViewMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  authSessionViewMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 页面测试只关心本页的入口行为：会话面板内部逻辑由其自身测试覆盖，此处替换为桩；
// useAuthSession 用桩按角色返回会话视图，其余（含放行判断函数）保留真实实现。
vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return { ...actual, AuthSessionPanel: () => null, useAuthSession: () => authSessionViewMock() };
});

function setRole(role: 'CUSTOMER' | 'SUPER_ADMIN') {
  authSessionViewMock.mockReturnValue({
    session: { accountId: 900101, role, userInfo: null },
    status: 'authenticated',
  });
}

describe('客户首页的维修申请入口', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('展示明显的「发起维修申请」入口，点击跳转到受保护的创建路由', () => {
    setRole('CUSTOMER');
    render(<CustomerPage />);

    const entry = screen.getByRole('button', { name: '发起维修申请' });
    expect(entry).toBeTruthy();
    expect((entry as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('超管不能代客户发起维修申请')).toBeNull();

    fireEvent.click(entry);

    // 唯一可发现入口指向正式受保护路由，不允许手输 URL 才能到达的落点
    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests/new');
  });

  it('SUPER_ADMIN 的入口按钮置灰并附文字说明，点击不跳转（路由层同口径拒绝）', () => {
    setRole('SUPER_ADMIN');
    render(<CustomerPage />);

    const entry = screen.getByRole('button', { name: '发起维修申请' });
    expect((entry as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('超管不能代客户发起维修申请')).toBeTruthy();

    fireEvent.click(entry);

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
