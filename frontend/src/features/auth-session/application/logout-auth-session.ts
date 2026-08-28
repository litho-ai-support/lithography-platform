// src/features/auth-session/application/logout-auth-session.ts

export type AuthSessionClearer = {
  clearSession: () => void;
};

export type AuthSessionCacheClearer = {
  clearCache: () => Promise<void>;
};

type LogoutAuthSessionDependencies = {
  cache: AuthSessionCacheClearer;
  session: AuthSessionClearer;
};

export function createLogoutAuthSessionUsecase({ cache, session }: LogoutAuthSessionDependencies) {
  return async function logoutAuthSession(): Promise<void> {
    session.clearSession();
    await cache.clearCache();
  };
}
