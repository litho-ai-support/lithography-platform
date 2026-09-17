// src/features/auth-session/ui/logout-button.spec.tsx

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logoutAuthSession } from '../auth-session-entry';

import { LogoutButton } from './logout-button';

vi.mock('../auth-session-entry', () => ({
  logoutAuthSession: vi.fn(),
}));

const mockedLogoutAuthSession = vi.mocked(logoutAuthSession);

function renderLogoutRoute(iconOnly = false) {
  return render(
    <MemoryRouter initialEntries={['/engineer']}>
      <Routes>
        <Route element={<LogoutButton iconOnly={iconOnly} />} path="/engineer" />
        <Route element={<div>login-page-marker</div>} path="/login" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LogoutButton', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('runs the logout usecase once and returns to the login page', async () => {
    mockedLogoutAuthSession.mockResolvedValue(undefined);
    renderLogoutRoute();

    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }));

    await waitFor(() => {
      expect(screen.getByText('login-page-marker')).toBeInTheDocument();
    });
    expect(mockedLogoutAuthSession).toHaveBeenCalledTimes(1);
  });

  it('still returns to the login page when the cleanup fails', async () => {
    mockedLogoutAuthSession.mockRejectedValue(new Error('clear failed'));
    renderLogoutRoute();

    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }));

    await waitFor(() => {
      expect(screen.getByText('login-page-marker')).toBeInTheDocument();
    });
    expect(mockedLogoutAuthSession).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate logout submissions while one is in flight', async () => {
    let resolveLogout: () => void = () => {};
    mockedLogoutAuthSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    renderLogoutRoute();

    const logoutButton = screen.getByRole('button', { name: /退出登录/ });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(logoutButton).toHaveClass('ant-btn-loading');
    });
    fireEvent.click(logoutButton);
    expect(mockedLogoutAuthSession).toHaveBeenCalledTimes(1);

    resolveLogout();

    await waitFor(() => {
      expect(screen.getByText('login-page-marker')).toBeInTheDocument();
    });
  });

  it('iconOnly 态：不渲染文字，可访问名称由 aria-label 提供，点击仍走退出链路', async () => {
    mockedLogoutAuthSession.mockResolvedValue(undefined);
    renderLogoutRoute(true);

    const iconButton = screen.getByRole('button', { name: '退出登录' });

    expect(iconButton).toHaveTextContent('');
    expect(screen.queryByText('退出登录')).not.toBeInTheDocument();

    fireEvent.click(iconButton);

    await waitFor(() => {
      expect(screen.getByText('login-page-marker')).toBeInTheDocument();
    });
    expect(mockedLogoutAuthSession).toHaveBeenCalledTimes(1);
  });
});
