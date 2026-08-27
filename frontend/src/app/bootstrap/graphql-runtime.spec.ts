// src/app/bootstrap/graphql-runtime.spec.ts

import { describe, expect, it, vi } from 'vitest';

import { createGraphQLAuthFailureHandler } from './graphql-auth-failure-handler';

describe('global GraphQL auth failure handling', () => {
  it('runs one cleanup and one navigation for concurrent UNAUTHENTICATED failures', async () => {
    const logoutAuthSession = vi.fn().mockResolvedValue(undefined);
    const navigateToLogin = vi.fn();
    const handleAuthFailure = createGraphQLAuthFailureHandler({
      logoutAuthSession,
      navigateToLogin,
    });

    handleAuthFailure();
    handleAuthFailure();
    handleAuthFailure();

    await vi.waitFor(() => {
      expect(logoutAuthSession).toHaveBeenCalledTimes(1);
    });
    expect(navigateToLogin).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh failure cycle after the previous one settled', async () => {
    const logoutAuthSession = vi.fn().mockResolvedValue(undefined);
    const navigateToLogin = vi.fn();
    const handleAuthFailure = createGraphQLAuthFailureHandler({
      logoutAuthSession,
      navigateToLogin,
    });

    handleAuthFailure();

    await vi.waitFor(() => {
      expect(logoutAuthSession).toHaveBeenCalledTimes(1);
    });

    handleAuthFailure();

    await vi.waitFor(() => {
      expect(logoutAuthSession).toHaveBeenCalledTimes(2);
    });
    expect(navigateToLogin).toHaveBeenCalledTimes(2);
  });

  it('still navigates back to the login page when the cleanup rejects', async () => {
    const logoutAuthSession = vi.fn().mockRejectedValue(new Error('clear failed'));
    const navigateToLogin = vi.fn();
    const handleAuthFailure = createGraphQLAuthFailureHandler({
      logoutAuthSession,
      navigateToLogin,
    });

    handleAuthFailure();

    await vi.waitFor(() => {
      expect(navigateToLogin).toHaveBeenCalledTimes(1);
    });
    expect(logoutAuthSession).toHaveBeenCalledTimes(1);
  });
});
