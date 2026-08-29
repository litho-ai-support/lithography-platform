// src/features/auth-session/auth-session-entry.spec.ts

import { afterEach, describe, expect, it } from 'vitest';

import {
  authSessionStore,
  getAuthSessionAccessToken,
  getCurrentAuthSession,
  hasCurrentAuthSession,
  logoutAuthSession,
} from './auth-session-entry';

// 经生产装配（真实 store + 浏览器持久化适配器 + Apollo cache 适配器）直测入口读取
// 与失效清理，不复制业务规则；jsdom 提供真实的 window.sessionStorage。
const AUTH_SESSION_STORAGE_KEY = 'lithography-platform.auth-session.v1';

describe('auth session entry', () => {
  afterEach(() => {
    authSessionStore.clearSession();
  });

  it('reports no session and no access token in the anonymous state', () => {
    authSessionStore.clearSession();

    expect(getCurrentAuthSession()).toBeNull();
    expect(hasCurrentAuthSession()).toBe(false);
    expect(getAuthSessionAccessToken()).toBeNull();
  });

  it('exposes the established session and its access token', () => {
    authSessionStore.establishSession({
      accessToken: 'entry-access-token',
      accountId: 900201,
      role: 'CUSTOMER',
      userInfo: { accessGroup: ['CUSTOMER'], nickname: '测试会话' },
    });

    expect(hasCurrentAuthSession()).toBe(true);
    expect(getAuthSessionAccessToken()).toBe('entry-access-token');
    expect(getCurrentAuthSession()).toMatchObject({
      accountId: 900201,
      role: 'CUSTOMER',
    });
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('logout clears the session owner and the persisted storage', async () => {
    authSessionStore.establishSession({
      accessToken: 'entry-access-token',
      accountId: 900201,
      role: 'CUSTOMER',
      userInfo: null,
    });
    expect(hasCurrentAuthSession()).toBe(true);

    await logoutAuthSession();

    expect(hasCurrentAuthSession()).toBe(false);
    expect(getCurrentAuthSession()).toBeNull();
    expect(getAuthSessionAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });
});
