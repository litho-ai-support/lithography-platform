// src/features/auth-session/application/login-with-password.spec.ts

import { describe, expect, it, vi } from 'vitest';

import type { AuthSessionSnapshot } from './auth-session.types';
import { createLoginWithPasswordUsecase } from './login-with-password';

const ENGINEER_SESSION: AuthSessionSnapshot = {
  accessToken: 'access-token',
  accountId: 900101,
  role: 'ENGINEER',
  userInfo: {
    accessGroup: ['ENGINEER'],
    nickname: '陈工',
  },
};

describe('login with password usecase', () => {
  it('establishes the single session owner and returns a token-free view', async () => {
    const gateway = {
      loginWithPassword: vi.fn().mockResolvedValue(ENGINEER_SESSION),
    };
    const session = {
      establishSession: vi.fn(),
    };
    const loginWithPassword = createLoginWithPasswordUsecase({ gateway, session });

    const result = await loginWithPassword({
      loginName: ' mock_engineer_chen ',
      loginPassword: 'local-password',
    });

    expect(gateway.loginWithPassword).toHaveBeenCalledWith({
      loginName: 'mock_engineer_chen',
      loginPassword: 'local-password',
    });
    expect(session.establishSession).toHaveBeenCalledWith(ENGINEER_SESSION);
    expect(result).toEqual({
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: ENGINEER_SESSION.userInfo,
    });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('does not establish a session when authentication fails', async () => {
    const authenticationError = new Error('authentication failed');
    const gateway = {
      loginWithPassword: vi.fn().mockRejectedValue(authenticationError),
    };
    const session = {
      establishSession: vi.fn(),
    };
    const loginWithPassword = createLoginWithPasswordUsecase({ gateway, session });

    await expect(
      loginWithPassword({
        loginName: 'mock_engineer_chen',
        loginPassword: 'wrong-password',
      }),
    ).rejects.toBe(authenticationError);
    expect(session.establishSession).not.toHaveBeenCalled();
  });
});
