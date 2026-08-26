// src/app/router/route-guards.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSessionRole } from '@/features/auth-session';
import * as authSessionFeature from '@/features/auth-session';

import { loginLoader, protectedRouteLoader } from './route-guards';

vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return {
    ...actual,
    getCurrentAuthSession: vi.fn(),
  };
});

const mockedGetCurrentAuthSession = vi.mocked(authSessionFeature.getCurrentAuthSession);

function createSnapshot(role: AuthSessionRole) {
  return {
    accessToken: 'access-token',
    accountId: 900101,
    role,
    userInfo: null,
  };
}

function createLoaderRequest(url: string) {
  return {
    request: new Request(url),
  };
}

function redirectLocation(result: unknown): string | null {
  return result instanceof Response ? result.headers.get('Location') : null;
}

describe('login route guard wiring', () => {
  beforeEach(() => {
    mockedGetCurrentAuthSession.mockReset();
  });

  it('renders the login page for anonymous visitors', () => {
    mockedGetCurrentAuthSession.mockReturnValue(null);

    expect(loginLoader(createLoaderRequest('http://localhost/login'))).toBeNull();
  });

  it('sends an authenticated visitor away from /login to the role default entry', () => {
    mockedGetCurrentAuthSession.mockReturnValue(createSnapshot('ENGINEER'));

    const result = loginLoader(createLoaderRequest('http://localhost/login'));

    expect(redirectLocation(result)).toBe('/engineer');
  });

  it('adopts a safe in-role returnTo and rejects cross-role or unsafe targets', () => {
    mockedGetCurrentAuthSession.mockReturnValue(createSnapshot('ENGINEER'));

    expect(
      redirectLocation(
        loginLoader(
          createLoaderRequest('http://localhost/login?returnTo=%2Fengineer%3Ftab%3Dopen'),
        ),
      ),
    ).toBe('/engineer?tab=open');
    expect(
      redirectLocation(
        loginLoader(createLoaderRequest('http://localhost/login?returnTo=%2Fadmin')),
      ),
    ).toBe('/engineer');
    expect(
      redirectLocation(
        loginLoader(
          createLoaderRequest('http://localhost/login?returnTo=https%3A%2F%2Fexample.com'),
        ),
      ),
    ).toBe('/engineer');
  });
});

describe('protected route guard wiring', () => {
  beforeEach(() => {
    mockedGetCurrentAuthSession.mockReset();
  });

  it('sends anonymous visitors to /login while keeping the safe original target', () => {
    mockedGetCurrentAuthSession.mockReturnValue(null);

    const result = protectedRouteLoader(createLoaderRequest('http://localhost/admin'));

    expect(redirectLocation(result)).toBe('/login?returnTo=%2Fadmin');
  });

  it('lets the owning role and inherited SUPER_ADMIN visits through', () => {
    mockedGetCurrentAuthSession.mockReturnValue(createSnapshot('ENGINEER'));
    expect(protectedRouteLoader(createLoaderRequest('http://localhost/engineer'))).toBeNull();

    mockedGetCurrentAuthSession.mockReturnValue(createSnapshot('SUPER_ADMIN'));
    expect(protectedRouteLoader(createLoaderRequest('http://localhost/engineer'))).toBeNull();
    expect(protectedRouteLoader(createLoaderRequest('http://localhost/customer'))).toBeNull();
  });

  it('never renders another role content and sends cross-role visitors back home', () => {
    mockedGetCurrentAuthSession.mockReturnValue(createSnapshot('ENGINEER'));

    expect(
      redirectLocation(protectedRouteLoader(createLoaderRequest('http://localhost/admin'))),
    ).toBe('/engineer');
    expect(
      redirectLocation(protectedRouteLoader(createLoaderRequest('http://localhost/customer'))),
    ).toBe('/engineer');
  });
});
