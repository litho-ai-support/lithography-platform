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
});
