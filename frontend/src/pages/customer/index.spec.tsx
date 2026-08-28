// src/pages/customer/index.spec.tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CustomerPage } from './index';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 页面测试只关心本页的入口行为：会话面板内部逻辑由其自身测试覆盖，此处替换为桩。
vi.mock('@/features/auth-session', () => ({
  AuthSessionPanel: () => null,
}));

describe('客户首页的维修申请入口', () => {
  it('展示明显的「发起维修申请」入口，点击跳转到受保护的创建路由', () => {
    render(<CustomerPage />);

    const entry = screen.getByRole('button', { name: '发起维修申请' });
    expect(entry).toBeTruthy();

    fireEvent.click(entry);

    // 唯一可发现入口指向正式受保护路由，不允许手输 URL 才能到达的落点
    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests/new');
  });
});
