// src/features/auth-session/application/auth-session-policy.spec.ts

import { describe, expect, it } from 'vitest';

import {
  createAuthSessionSnapshot,
  resolveAuthSessionHomePath,
  resolveLoginRouteRedirect,
} from './auth-session-policy';

describe('auth session policy', () => {
  it('maps each known role to its frozen home route', () => {
    expect(resolveAuthSessionHomePath('SUPER_ADMIN')).toBe('/admin');
    expect(resolveAuthSessionHomePath('ENGINEER')).toBe('/engineer');
    expect(resolveAuthSessionHomePath('CUSTOMER')).toBe('/customer');
  });

  it('redirects authenticated sessions away from the login route', () => {
    const session = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900201,
      role: 'CUSTOMER',
      userInfo: null,
    });

    expect(resolveLoginRouteRedirect(session)).toBe('/customer');
    expect(resolveLoginRouteRedirect(null)).toBeNull();
  });

  it('creates a normalized minimal session snapshot', () => {
    expect(
      createAuthSessionSnapshot({
        accessToken: ' access-token ',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: {
          accessGroup: ['ENGINEER'],
          nickname: ' 陈工 ',
        },
      }),
    ).toEqual({
      accessToken: 'access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: {
        accessGroup: ['ENGINEER'],
        nickname: '陈工',
      },
    });
  });

  it('rejects invalid session invariants', () => {
    expect(() =>
      createAuthSessionSnapshot({
        accessToken: ' ',
        accountId: 900101,
        role: 'ENGINEER',
        userInfo: null,
      }),
    ).toThrow('Cannot establish an invalid auth session.');

    expect(() =>
      createAuthSessionSnapshot({
        accessToken: 'access-token',
        accountId: 900201,
        role: 'CUSTOMER',
        userInfo: {
          accessGroup: ['ENGINEER'],
          nickname: '错误身份',
        },
      }),
    ).toThrow('Cannot establish an invalid auth session.');
  });
});
