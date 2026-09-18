// src/pages/account-settings/index.spec.tsx
// @vitest-environment jsdom

/**
 * 账号设置页装配层单测。
 *
 * 页面只负责页头、feature 公开 UI 组合，以及「改密成功后使既有会话失效」的收口接线：
 * 清理 auth-session 的唯一会话真源后跳转登录页，清理本身失败不阻断跳转。
 * feature 之间禁止互相引用，因此这里 mock 面板与 auth-session 公开出口来验证接线顺序。
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountSettingsPage } from './index';

const { logoutMock, navigateMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return { ...actual, logoutAuthSession: logoutMock };
});

vi.mock('@/features/account-settings', () => ({
  AccountSettingsPanel: ({
    onPasswordChangeSucceeded,
  }: {
    onPasswordChangeSucceeded?: () => void | Promise<void>;
  }) => (
    <button onClick={() => void onPasswordChangeSucceeded?.()} type="button">
      模拟改密成功
    </button>
  ),
}));

const TRIGGER_LABEL = '模拟改密成功';

beforeEach(() => {
  logoutMock.mockReset();
  navigateMock.mockReset();
  logoutMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('AccountSettingsPage', () => {
  it('渲染页头并组合 feature 公开的账号设置面板', () => {
    render(<AccountSettingsPage />);

    expect(screen.getByText('账号设置')).toBeInTheDocument();
    expect(screen.getByText('维护登录凭据、基础资料与登录密码。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TRIGGER_LABEL })).toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('改密成功后先清理唯一会话真源，再跳转登录页', async () => {
    const order: string[] = [];
    logoutMock.mockImplementation(async () => {
      order.push('logout');
    });
    navigateMock.mockImplementation(() => {
      order.push('navigate');
    });
    render(<AccountSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login');
    expect(order).toEqual(['logout', 'navigate']);
  });

  it('会话清理失败不阻断跳转登录页（与 LogoutButton 同一口径）', async () => {
    logoutMock.mockRejectedValue(new Error('cache reset failed'));
    render(<AccountSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('清理未完成前不提前跳转：跳转发生在 logout promise 之后', async () => {
    let releaseLogout: () => void = () => {};
    logoutMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseLogout = resolve;
        }),
    );
    render(<AccountSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();

    releaseLogout();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
  });
});
