// src/features/auth-session/infrastructure/auth-return-to-url.spec.ts

import { describe, expect, it } from 'vitest';

import {
  composeLoginRedirectPath,
  composeProtectedRequestTarget,
  composeSessionExpiredLoginRedirectPath,
  extractUrlPathname,
  readAuthLoginReasonParam,
  readAuthReturnToFromRequest,
  readAuthReturnToParam,
} from './auth-return-to-url';

describe('auth return-to url adapter', () => {
  it('reads the returnTo param from search params and requests', () => {
    expect(readAuthReturnToParam(new URLSearchParams('returnTo=%2Fengineer'))).toBe('/engineer');
    expect(readAuthReturnToParam(new URLSearchParams())).toBeNull();
    expect(
      readAuthReturnToFromRequest(new Request('http://localhost/login?returnTo=%2Fadmin')),
    ).toBe('/admin');
  });

  it('round-trips the login redirect target through the same param key', () => {
    const redirectPath = composeLoginRedirectPath('/engineer?tab=open');

    expect(redirectPath).toBe('/login?returnTo=%2Fengineer%3Ftab%3Dopen');
    expect(readAuthReturnToParam(new URL(`http://localhost${redirectPath}`).searchParams)).toBe(
      '/engineer?tab=open',
    );
  });

  it('reads the login reason param when present', () => {
    expect(readAuthLoginReasonParam(new URLSearchParams('reason=session-expired'))).toBe(
      'session-expired',
    );
    expect(readAuthLoginReasonParam(new URLSearchParams())).toBeNull();
  });

  it('composes the session-expired login redirect with and without a return target', () => {
    expect(composeSessionExpiredLoginRedirectPath(null)).toBe('/login?reason=session-expired');

    const redirectPath = composeSessionExpiredLoginRedirectPath('/customer/repair-requests/new');

    expect(redirectPath).toBe(
      '/login?reason=session-expired&returnTo=%2Fcustomer%2Frepair-requests%2Fnew',
    );
    expect(readAuthReturnToParam(new URL(`http://localhost${redirectPath}`).searchParams)).toBe(
      '/customer/repair-requests/new',
    );
    expect(readAuthLoginReasonParam(new URL(`http://localhost${redirectPath}`).searchParams)).toBe(
      'session-expired',
    );
  });

  it('keeps the requested path and query for protected route guards', () => {
    expect(composeProtectedRequestTarget(new Request('http://localhost/admin?tab=open'))).toBe(
      '/admin?tab=open',
    );
  });

  it('extracts pathnames for role checks without trusting full urls', () => {
    expect(extractUrlPathname('/engineer?tab=open')).toBe('/engineer');
    expect(extractUrlPathname('https://example.com/admin')).toBe('/admin');
    expect(extractUrlPathname('relative/admin')).toBe('/relative/admin');
  });
});
