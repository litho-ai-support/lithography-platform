// src/features/auth-session/application/auth-session-policy.spec.ts

import { describe, expect, it } from 'vitest';

import {
  createAuthSessionSnapshot,
  isAuthSessionRoleAllowedAt,
  resolveAuthSessionEntryPath,
  resolveAuthSessionHomePath,
  resolveEntryRouteRedirect,
  resolveLoginRouteRedirect,
  resolveProtectedRouteRedirect,
  resolveSafeReturnTo,
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

  it('enters the role default entry from the backend role', () => {
    expect(resolveAuthSessionEntryPath({ role: 'SUPER_ADMIN' }, null)).toBe('/admin');
    expect(resolveAuthSessionEntryPath({ role: 'ENGINEER' }, null)).toBe('/engineer');
    expect(resolveAuthSessionEntryPath({ role: 'CUSTOMER' }, null)).toBe('/customer');
  });

  it('adopts a safe in-role returnTo and falls back to the default entry otherwise', () => {
    expect(resolveAuthSessionEntryPath({ role: 'ENGINEER' }, '/engineer?tab=open')).toBe(
      '/engineer?tab=open',
    );
    expect(resolveAuthSessionEntryPath({ role: 'ENGINEER' }, '/customer')).toBe('/engineer');
    expect(resolveAuthSessionEntryPath({ role: 'ENGINEER' }, 'https://example.com')).toBe(
      '/engineer',
    );
  });

  it('lets SUPER_ADMIN inherit ENGINEER and CUSTOMER route access', () => {
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/admin')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/engineer')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/customer')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('ENGINEER', '/engineer')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('ENGINEER', '/customer')).toBe(false);
    expect(isAuthSessionRoleAllowedAt('ENGINEER', '/admin')).toBe(false);
    expect(isAuthSessionRoleAllowedAt('CUSTOMER', '/customer')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('CUSTOMER', '/engineer')).toBe(false);
  });

  it('allows role sub-pages and trailing slashes but rejects lookalike prefixes', () => {
    expect(isAuthSessionRoleAllowedAt('CUSTOMER', '/customer/')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('CUSTOMER', '/customer/repair-requests/new')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('CUSTOMER', '/customer-admin')).toBe(false);
    expect(isAuthSessionRoleAllowedAt('CUSTOMER', '/customerABC')).toBe(false);
    expect(isAuthSessionRoleAllowedAt('ENGINEER', '/engineer/repair-requests/1')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('ENGINEER', '/customer/repair-requests/1')).toBe(false);
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/admin/settings')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/engineer/repair-requests/1')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/customer/repair-requests/new')).toBe(true);
    expect(isAuthSessionRoleAllowedAt('SUPER_ADMIN', '/admin-console')).toBe(false);
  });

  it('guards role sub-pages through the shared role path policy', () => {
    const engineerSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: null,
    });
    const customerSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900201,
      role: 'CUSTOMER',
      userInfo: null,
    });
    const superAdminSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900001,
      role: 'SUPER_ADMIN',
      userInfo: null,
    });

    expect(
      resolveProtectedRouteRedirect(engineerSession, '/engineer/repair-requests/1'),
    ).toBeNull();
    expect(resolveProtectedRouteRedirect(engineerSession, '/customer/repair-requests/1')).toBe(
      '/engineer',
    );
    expect(resolveProtectedRouteRedirect(customerSession, '/customer/')).toBeNull();
    expect(resolveProtectedRouteRedirect(customerSession, '/customer-admin')).toBe('/customer');
    expect(resolveProtectedRouteRedirect(superAdminSession, '/admin/settings')).toBeNull();
    expect(
      resolveProtectedRouteRedirect(superAdminSession, '/customer/repair-requests/new'),
    ).toBeNull();
  });

  it('adopts a same-role sub-page returnTo and rejects cross-role or lookalike targets', () => {
    expect(resolveAuthSessionEntryPath({ role: 'CUSTOMER' }, '/customer/repair-requests/new')).toBe(
      '/customer/repair-requests/new',
    );
    expect(resolveAuthSessionEntryPath({ role: 'ENGINEER' }, '/customer/repair-requests/new')).toBe(
      '/engineer',
    );
    expect(resolveAuthSessionEntryPath({ role: 'CUSTOMER' }, '/customer-admin')).toBe('/customer');
    expect(resolveLoginRouteRedirect({ role: 'CUSTOMER' }, '/customer/repair-requests/new')).toBe(
      '/customer/repair-requests/new',
    );
  });

  it('sends anonymous users to the login route with a safe return target', () => {
    expect(resolveProtectedRouteRedirect(null, '/engineer?tab=open')).toBe(
      '/login?returnTo=%2Fengineer%3Ftab%3Dopen',
    );
  });

  it('dispatches the entry route by login state without a return target', () => {
    const customerSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900201,
      role: 'CUSTOMER',
      userInfo: null,
    });

    expect(resolveEntryRouteRedirect(null)).toBe('/login');
    expect(resolveEntryRouteRedirect({ role: 'SUPER_ADMIN' })).toBe('/admin');
    expect(resolveEntryRouteRedirect({ role: 'ENGINEER' })).toBe('/engineer');
    expect(resolveEntryRouteRedirect(customerSession)).toBe('/customer');
  });

  it('only allows the requested protected path for the session role', () => {
    const engineerSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: null,
    });
    const superAdminSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900001,
      role: 'SUPER_ADMIN',
      userInfo: null,
    });

    expect(resolveProtectedRouteRedirect(engineerSession, '/engineer')).toBeNull();
    expect(resolveProtectedRouteRedirect(engineerSession, '/customer')).toBe('/engineer');
    expect(resolveProtectedRouteRedirect(superAdminSession, '/customer?tab=open')).toBeNull();
  });

  it('honours a safe in-role returnTo after login and rejects everything else', () => {
    const engineerSession = createAuthSessionSnapshot({
      accessToken: 'access-token',
      accountId: 900101,
      role: 'ENGINEER',
      userInfo: null,
    });

    expect(resolveLoginRouteRedirect(engineerSession, '/engineer?tab=open')).toBe(
      '/engineer?tab=open',
    );
    expect(resolveLoginRouteRedirect(engineerSession, '/customer')).toBe('/engineer');
    expect(resolveLoginRouteRedirect(engineerSession, 'https://example.com/admin')).toBe(
      '/engineer',
    );
    expect(resolveLoginRouteRedirect(engineerSession, null)).toBe('/engineer');
    expect(resolveLoginRouteRedirect(engineerSession, '')).toBe('/engineer');
    expect(resolveLoginRouteRedirect(engineerSession, '/engineer\ttab')).toBe('/engineer');
    expect(resolveLoginRouteRedirect(engineerSession, '/engineer\u007Ftab')).toBe('/engineer');
  });

  it('accepts only same-origin absolute return paths', () => {
    expect(resolveSafeReturnTo('/engineer?tab=open#latest')).toBe('/engineer?tab=open#latest');
    expect(resolveSafeReturnTo('https://example.com/admin')).toBeNull();
    expect(resolveSafeReturnTo('//example.com/admin')).toBeNull();
    expect(resolveSafeReturnTo('/\\example.com/admin')).toBeNull();
    expect(resolveSafeReturnTo(' /admin')).toBeNull();
    expect(resolveSafeReturnTo('/admin\n')).toBeNull();
    expect(resolveSafeReturnTo('relative/admin')).toBeNull();
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
