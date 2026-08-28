// src/features/auth-session/infrastructure/auth-return-to-url.spec.ts

import { describe, expect, it } from 'vitest';

import {
  composeLoginRedirectPath,
  composeProtectedRequestTarget,
  extractUrlPathname,
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
