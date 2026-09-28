// src/pages/customer/index.spec.tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerPage } from './index';

const { navigateMock, authSessionViewMock, authSessionPanelMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  authSessionViewMock: vi.fn(),
  authSessionPanelMock: vi.fn(() => null),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 页面测试只关心本页的入口行为：useAuthSession 用桩按角色返回会话视图，
// 其余（含放行判断函数）保留真实实现。AuthSessionPanel 保留桩是为了能断言
// 「本页不再挂载开发式会话面板」——重新挂载会让该断言失败。
vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return {
    ...actual,
    AuthSessionPanel: authSessionPanelMock,
    useAuthSession: () => authSessionViewMock(),
  };
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
    authSessionPanelMock.mockClear();
  });

  // PR5 S1 正式化：删除开发期「临时落地页」文案与开发式会话面板（S0-8 红测转绿）。
  it('不再出现「临时落地页」开发文案，也不再挂载开发式会话面板', () => {
    setRole('CUSTOMER');
    render(<CustomerPage />);

    expect(screen.queryByText(/临时落地页/)).toBeNull();
    expect(authSessionPanelMock).not.toHaveBeenCalled();
  });

  it('只呈现两条真实业务入口，不含假统计卡片与演示数据', () => {
    setRole('CUSTOMER');
    const { container } = render(<CustomerPage />);

    expect(screen.getByText('设备维修申请')).toBeTruthy();
    expect(screen.getByText('我的维修申请')).toBeTruthy();
    // 任务书红线：不增加假统计、设备状态与演示数据。用结构计数而不是文案正则——
    // .stat-card 是统计卡片唯一落点、.surface-panel 是入口面板唯一落点，
    // 正则既抓不到未命中关键词的假数据（如「已处理 12 单」），也会被后续合法文案误伤。
    expect(container.querySelectorAll('.stat-card')).toHaveLength(0);
    expect(container.querySelectorAll('.surface-panel')).toHaveLength(2);
    // 入口面板内的可见动作仅有两个真实跳转按钮
    expect(screen.getAllByRole('button')).toHaveLength(2);
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

  it('展示「查看维修申请」入口，点击跳转到我的申请列表路由', () => {
    setRole('CUSTOMER');
    render(<CustomerPage />);

    fireEvent.click(screen.getByRole('button', { name: '查看维修申请' }));

    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests');
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
