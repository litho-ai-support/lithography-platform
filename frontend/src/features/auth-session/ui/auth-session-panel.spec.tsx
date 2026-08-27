// src/features/auth-session/ui/auth-session-panel.spec.tsx

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { authSessionStore } from '../auth-session-entry';

import { AuthSessionPanel } from './auth-session-panel';
import { AuthSessionProvider } from './auth-session-provider';

function renderPanelRoute() {
  return render(
    <AuthSessionProvider>
      <MemoryRouter initialEntries={['/engineer']}>
        <Routes>
          <Route element={<AuthSessionPanel />} path="/engineer" />
          <Route element={<div>login-page-marker</div>} path="/login" />
        </Routes>
      </MemoryRouter>
    </AuthSessionProvider>,
  );
}

describe('AuthSessionPanel', () => {
  afterEach(() => {
    authSessionStore.clearSession();
    window.sessionStorage.clear();
    cleanup();
  });

  it('shows only the safe session view for an authenticated session', () => {
    authSessionStore.establishSession({
      accessToken: 'test-only-access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: {
        accessGroup: ['ENGINEER'],
        nickname: '陈工',
      },
    });

    renderPanelRoute();

    expect(screen.getByText('登录成功')).toBeInTheDocument();
    expect(screen.getByText('900101')).toBeInTheDocument();
    expect(screen.getByText('陈工')).toBeInTheDocument();
    expect(screen.getAllByText('ENGINEER').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('test-only-access-token');
  });

  it('offers a login entry for anonymous visitors instead of a blank panel', async () => {
    renderPanelRoute();

    expect(screen.getByText('当前会话不可用，请先登录。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /前往登录/ }));

    await waitFor(() => {
      expect(screen.getByText('login-page-marker')).toBeInTheDocument();
    });
  });
});
