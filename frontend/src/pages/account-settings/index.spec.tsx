// src/pages/account-settings/index.spec.tsx
// @vitest-environment jsdom

/**
 * 账号设置页装配层单测。
 *
 * 页面只负责页头、feature 公开 UI 组合，以及两条会话侧写接线：
 * 1. 改密成功后使既有会话失效：清理 auth-session 的唯一会话真源后跳转登录页，
 *    清理本身失败不阻断跳转；
 * 2. 资料保存成功后把权威昵称经窄入口回写会话真源：accountId 在**请求发起前**
 *    经 sampleAccountId 采样固化，迟到响应携带发起者身份，由 store 与当前会话
 *    比对拒绝——A 发起保存后切换 B 的场景不会把 A 的昵称写进 B 的会话。
 * feature 之间禁止互相引用，因此这里 mock 面板与 auth-session 公开出口来验证接线。
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logoutMock, navigateMock, panelState } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  navigateMock: vi.fn(),
  panelState: { capturedAccountId: null as number | null },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/features/account-settings', () => ({
  AccountSettingsPanel: ({
    onPasswordChangeSucceeded,
    onProfileSaveSucceeded,
    sampleAccountId,
  }: {
    onPasswordChangeSucceeded?: () => void | Promise<void>;
    onProfileSaveSucceeded?: (
      settings: { nickname: string },
      expectedAccountId: number | null,
    ) => void;
    sampleAccountId?: () => number | null;
  }) => (
    <>
      <button onClick={() => void onPasswordChangeSucceeded?.()} type="button">
        模拟改密成功
      </button>
      <button
        onClick={() => {
          // 模拟 hook 契约：请求发起前采样账号身份
          panelState.capturedAccountId = sampleAccountId?.() ?? null;
        }}
        type="button"
      >
        模拟资料保存发起
      </button>
      <button
        onClick={() => {
          onProfileSaveSucceeded?.({ nickname: 'A 保存的昵称' }, panelState.capturedAccountId);
        }}
        type="button"
      >
        模拟资料保存迟到成功
      </button>
    </>
  ),
}));

const TRIGGER_LABEL = '模拟改密成功';

async function renderAccountSettingsPage() {
  vi.doMock('@/features/auth-session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/features/auth-session')>();
    return { ...actual, logoutAuthSession: logoutMock };
  });
  const { AccountSettingsPage } = await import('./index');
  return render(<AccountSettingsPage />);
}

async function currentAuthSession() {
  return (await import('@/features/auth-session')).getCurrentAuthSession();
}
const STORAGE_KEY = 'lithography-platform.auth-session.v1';

// 测试在模块初始化前写入 sessionStorage；随后动态 import 页面，使唯一会话真源按生产
// 启动语义从持久化恢复，不需要测试专用的公共恢复 API。
function establishSession(accountId: number, nickname: string): void {
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: `token-${accountId}`,
      accountId,
      role: 'CUSTOMER',
      userInfo: { accessGroup: ['CUSTOMER'], nickname },
      version: 1,
    }),
  );
}

function readStoredNickname(): string | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  return (
    (JSON.parse(raw) as { userInfo?: { nickname?: string } | null }).userInfo?.nickname ?? null
  );
}

beforeEach(() => {
  logoutMock.mockReset();
  navigateMock.mockReset();
  logoutMock.mockResolvedValue(undefined);
  panelState.capturedAccountId = null;
  window.sessionStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.resetModules();
});

describe('AccountSettingsPage', () => {
  it('渲染页头并组合 feature 公开的账号设置面板', async () => {
    await renderAccountSettingsPage();

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
    await renderAccountSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login');
    expect(order).toEqual(['logout', 'navigate']);
  });

  it('会话清理失败不阻断跳转登录页（与 LogoutButton 同一口径）', async () => {
    logoutMock.mockRejectedValue(new Error('cache reset failed'));
    await renderAccountSettingsPage();

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
    await renderAccountSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();

    releaseLogout();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
  });

  it('资料保存成功：把请求发起前采样的账号与权威昵称回写会话真源（内存 + sessionStorage）', async () => {
    establishSession(900201, '用户A');
    await renderAccountSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: '模拟资料保存发起' }));
    fireEvent.click(screen.getByRole('button', { name: '模拟资料保存迟到成功' }));

    expect((await currentAuthSession())?.userInfo?.nickname).toBe('A 保存的昵称');
    expect(readStoredNickname()).toBe('A 保存的昵称');
  });

  it('A 发起保存后切换到 B：A 的迟到响应不得修改 B 的会话（内存 + sessionStorage 均保持 B）', async () => {
    establishSession(900201, '用户A');
    await renderAccountSettingsPage();

    // A 在会话仍是自己时发起保存（采样固化为 900201）
    fireEvent.click(screen.getByRole('button', { name: '模拟资料保存发起' }));
    expect(panelState.capturedAccountId).toBe(900201);

    // 会话切换为 B（如登出后另账登录）：使用已有 store 装配，不新增公共测试 API。
    const { authSessionStore } = await import('@/features/auth-session/auth-session-entry');
    authSessionStore.establishSession({
      accessToken: 'token-900202',
      accountId: 900202,
      role: 'CUSTOMER',
      userInfo: { accessGroup: ['CUSTOMER'], nickname: '用户B' },
    });

    // A 的迟到保存成功响应：携带发起者身份，store 与当前会话比对拒绝
    fireEvent.click(screen.getByRole('button', { name: '模拟资料保存迟到成功' }));

    expect((await currentAuthSession())?.accountId).toBe(900202);
    expect((await currentAuthSession())?.userInfo?.nickname).toBe('用户B');
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null') as {
      accountId?: number;
      userInfo?: { nickname?: string } | null;
    };
    expect(stored?.accountId).toBe(900202);
    expect(stored?.userInfo?.nickname).toBe('用户B');
  });

  it('匿名会话下采样为 null：不触发回写，也不抛错', async () => {
    await renderAccountSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: '模拟资料保存发起' }));
    expect(panelState.capturedAccountId).toBeNull();
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: '模拟资料保存迟到成功' })),
    ).not.toThrow();
    expect(await currentAuthSession()).toBeNull();
  });
});
