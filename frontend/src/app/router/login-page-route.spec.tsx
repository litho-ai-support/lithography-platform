// src/app/router/login-page-route.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { AUTH_SESSION_EXPIRED_NOTICE_MESSAGE } from '@/features/auth-session';

import { LoginPageRoute } from './login-page-route';

function renderLoginRoute(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<LoginPageRoute />} path="/login" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('login page route wiring', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the fixed expiry notice only for the predefined session-expired reason', () => {
    renderLoginRoute('/login?reason=session-expired');

    expect(screen.getByText(AUTH_SESSION_EXPIRED_NOTICE_MESSAGE)).toBeInTheDocument();
  });

  it('shows the notice alongside the safe returnTo produced by the expiry redirect', () => {
    renderLoginRoute('/login?reason=session-expired&returnTo=%2Fcustomer%2Frepair-requests%2Fnew');

    expect(screen.getByText(AUTH_SESSION_EXPIRED_NOTICE_MESSAGE)).toBeInTheDocument();
  });

  it('keeps a plain login visit without any expiry notice', () => {
    renderLoginRoute('/login');

    expect(screen.queryByText(AUTH_SESSION_EXPIRED_NOTICE_MESSAGE)).not.toBeInTheDocument();
  });

  it('keeps an active logout and foreign reason values without the expiry notice', () => {
    // 非受控的 reason 值（如自行拼接的 logout）不触发失效提示；
    // 主动退出实际跳转裸 /login，由上面的普通访问用例覆盖。
    renderLoginRoute('/login?reason=logout');
    expect(screen.queryByText(AUTH_SESSION_EXPIRED_NOTICE_MESSAGE)).not.toBeInTheDocument();
    cleanup();

    // 后端原始错误文本进入 URL 也不得变成失效提示。
    renderLoginRoute('/login?reason=internal%20auth%20detail');
    expect(screen.queryByText(AUTH_SESSION_EXPIRED_NOTICE_MESSAGE)).not.toBeInTheDocument();
  });
});
