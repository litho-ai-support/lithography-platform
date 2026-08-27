// src/features/auth-session/application/logout-auth-session.spec.ts

import { describe, expect, it, vi } from 'vitest';

import { createLogoutAuthSessionUsecase } from './logout-auth-session';

describe('logout auth session usecase', () => {
  it('clears the single session owner and the GraphQL cache', async () => {
    const clearSession = vi.fn();
    const clearCache = vi.fn().mockResolvedValue(undefined);
    const logoutAuthSession = createLogoutAuthSessionUsecase({
      cache: { clearCache },
      session: { clearSession },
    });

    await logoutAuthSession();

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('clears the session before awaiting the cache reset', async () => {
    const callOrder: string[] = [];
    const logoutAuthSession = createLogoutAuthSessionUsecase({
      cache: {
        clearCache: async () => {
          callOrder.push('cache');
        },
      },
      session: {
        clearSession: () => {
          callOrder.push('session');
        },
      },
    });

    await logoutAuthSession();

    expect(callOrder).toEqual(['session', 'cache']);
  });

  it('still clears the session when the cache reset rejects and propagates the error', async () => {
    const clearSession = vi.fn();
    const clearCache = vi.fn().mockRejectedValue(new Error('cache reset failed'));
    const logoutAuthSession = createLogoutAuthSessionUsecase({
      cache: { clearCache },
      session: { clearSession },
    });

    await expect(logoutAuthSession()).rejects.toThrow('cache reset failed');
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('runs every concurrent call through both ports exactly once', async () => {
    const clearSession = vi.fn();
    const clearCache = vi.fn().mockResolvedValue(undefined);
    const logoutAuthSession = createLogoutAuthSessionUsecase({
      cache: { clearCache },
      session: { clearSession },
    });

    await Promise.all([logoutAuthSession(), logoutAuthSession()]);

    expect(clearSession).toHaveBeenCalledTimes(2);
    expect(clearCache).toHaveBeenCalledTimes(2);
  });
});
