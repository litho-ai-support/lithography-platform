// src/features/auth-session/application/auth-session-store.spec.ts

import { describe, expect, it, vi } from 'vitest';

import type { AuthSessionPersistence, AuthSessionSnapshot } from './auth-session.types';
import { createAuthSessionStore } from './auth-session-store';

function createMemoryPersistence(initialSession: AuthSessionSnapshot | null = null) {
  let storedSession = initialSession;
  const persistence: AuthSessionPersistence = {
    clear() {
      storedSession = null;
    },
    read() {
      return storedSession;
    },
    write(session) {
      storedSession = session;
    },
  };

  return {
    getStoredSession: () => storedSession,
    persistence,
  };
}

const ENGINEER_SESSION: AuthSessionSnapshot = {
  accessToken: 'access-token',
  accountId: 900101,
  role: 'ENGINEER',
  userInfo: {
    accessGroup: ['ENGINEER'],
    nickname: '陈工',
  },
};

describe('auth session store', () => {
  it('restores the initial session from the single persistence boundary', () => {
    const { persistence } = createMemoryPersistence(ENGINEER_SESSION);
    const store = createAuthSessionStore(persistence);

    expect(store.getSnapshot()).toEqual({
      session: ENGINEER_SESSION,
      status: 'authenticated',
    });
  });

  it('establishes and clears one atomic session state', () => {
    const { getStoredSession, persistence } = createMemoryPersistence();
    const store = createAuthSessionStore(persistence);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.establishSession({
      accessToken: ENGINEER_SESSION.accessToken,
      accountId: ENGINEER_SESSION.accountId,
      role: ENGINEER_SESSION.role,
      userInfo: ENGINEER_SESSION.userInfo,
    });

    expect(store.getSnapshot().status).toBe('authenticated');
    expect(getStoredSession()).toEqual(ENGINEER_SESSION);

    store.clearSession();

    expect(store.getSnapshot()).toEqual({ session: null, status: 'anonymous' });
    expect(getStoredSession()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('does not persist or publish an invalid session', () => {
    const { getStoredSession, persistence } = createMemoryPersistence();
    const store = createAuthSessionStore(persistence);
    const listener = vi.fn();

    store.subscribe(listener);

    expect(() =>
      store.establishSession({
        accessToken: ' ',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: null,
      }),
    ).toThrow('Cannot establish an invalid auth session.');
    expect(store.getSnapshot()).toEqual({ session: null, status: 'anonymous' });
    expect(getStoredSession()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  describe('updateNickname（显示昵称窄入口）', () => {
    it('accountId 匹配时同步写持久化与内存并发布，昵称经 snapshot 工厂 trim', () => {
      const { getStoredSession, persistence } = createMemoryPersistence(ENGINEER_SESSION);
      const store = createAuthSessionStore(persistence);
      const listener = vi.fn();

      store.subscribe(listener);

      const updated = store.updateNickname({
        accountId: ENGINEER_SESSION.accountId,
        nickname: '  陈工程  ',
      });

      expect(updated).toBe(true);
      expect(store.getSnapshot().session?.userInfo?.nickname).toBe('陈工程');
      expect(getStoredSession()?.userInfo?.nickname).toBe('陈工程');
      expect(listener).toHaveBeenCalledTimes(1);

      store.establishSession(ENGINEER_SESSION);
    });

    it('昵称更新只触碰 userInfo.nickname：Token、accountId、role、accessGroup 逐字段保持不变', () => {
      const { getStoredSession, persistence } = createMemoryPersistence(ENGINEER_SESSION);
      const store = createAuthSessionStore(persistence);

      expect(store.updateNickname({ accountId: 900101, nickname: '同步后的昵称' })).toBe(true);

      const session = store.getSnapshot().session;
      expect(session).not.toBeNull();
      // 除 nickname 外的所有会话字段与更新前逐字段一致（联系方式/凭据类保存不得带来其他改写）
      expect(session?.accessToken).toBe(ENGINEER_SESSION.accessToken);
      expect(session?.accountId).toBe(ENGINEER_SESSION.accountId);
      expect(session?.role).toBe(ENGINEER_SESSION.role);
      expect(session?.userInfo?.accessGroup).toEqual(ENGINEER_SESSION.userInfo?.accessGroup);
      expect(session?.userInfo?.nickname).toBe('同步后的昵称');
      expect(getStoredSession()).toEqual(session);
    });

    it('accountId 不匹配时一律不更新（过期视图不得写入他人会话）', () => {
      const { getStoredSession, persistence } = createMemoryPersistence(ENGINEER_SESSION);
      const store = createAuthSessionStore(persistence);
      const listener = vi.fn();

      store.subscribe(listener);

      const updated = store.updateNickname({ accountId: 999999, nickname: '别人的昵称' });

      expect(updated).toBe(false);
      expect(store.getSnapshot().session?.userInfo?.nickname).toBe('陈工');
      expect(getStoredSession()?.userInfo?.nickname).toBe('陈工');
      expect(listener).not.toHaveBeenCalled();
    });

    it('无会话时返回 false 且不发布', () => {
      const { persistence } = createMemoryPersistence();
      const store = createAuthSessionStore(persistence);
      const listener = vi.fn();

      store.subscribe(listener);

      expect(store.updateNickname({ accountId: 900101, nickname: '新昵称' })).toBe(false);
      expect(store.getSnapshot().status).toBe('anonymous');
      expect(listener).not.toHaveBeenCalled();
    });

    it('无 userInfo 的会话没有显示昵称面，返回 false 且不更新', () => {
      const sessionWithoutUserInfo: AuthSessionSnapshot = {
        accessToken: 'access-token',
        accountId: 900102,
        role: 'CUSTOMER',
        userInfo: null,
      };
      const { getStoredSession, persistence } = createMemoryPersistence(sessionWithoutUserInfo);
      const store = createAuthSessionStore(persistence);
      const listener = vi.fn();

      store.subscribe(listener);

      expect(store.updateNickname({ accountId: 900102, nickname: '新昵称' })).toBe(false);
      expect(store.getSnapshot().session).toEqual(sessionWithoutUserInfo);
      expect(getStoredSession()).toEqual(sessionWithoutUserInfo);
      expect(listener).not.toHaveBeenCalled();
    });

    it('空白昵称触发 snapshot 工厂不变量失败，不持久化、不发布', () => {
      const { getStoredSession, persistence } = createMemoryPersistence(ENGINEER_SESSION);
      const store = createAuthSessionStore(persistence);
      const listener = vi.fn();

      store.subscribe(listener);

      expect(() =>
        store.updateNickname({ accountId: ENGINEER_SESSION.accountId, nickname: '   ' }),
      ).toThrow('Cannot establish an invalid auth session.');
      expect(store.getSnapshot().session?.userInfo?.nickname).toBe('陈工');
      expect(getStoredSession()?.userInfo?.nickname).toBe('陈工');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
