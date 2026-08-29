// src/features/auth-session/auth-session-entry.ts

import { createAuthSessionStore } from './application/auth-session-store';
import { createLoginWithPasswordUsecase } from './application/login-with-password';
import { createLogoutAuthSessionUsecase } from './application/logout-auth-session';
import { apolloAuthSessionCache } from './infrastructure/apollo-session-cache';
import { graphQLAuthLoginGateway } from './infrastructure/auth-login-graphql';
import { browserAuthSessionPersistence } from './infrastructure/auth-session-storage';

export const authSessionStore = createAuthSessionStore(browserAuthSessionPersistence);
const executeLoginWithPassword = createLoginWithPasswordUsecase({
  gateway: graphQLAuthLoginGateway,
  session: authSessionStore,
});
export const logoutAuthSession = createLogoutAuthSessionUsecase({
  cache: apolloAuthSessionCache,
  session: authSessionStore,
});

export function getCurrentAuthSession() {
  return authSessionStore.getSnapshot().session;
}

export function hasCurrentAuthSession(): boolean {
  return getCurrentAuthSession() !== null;
}

export function getAuthSessionAccessToken(): string | null {
  return getCurrentAuthSession()?.accessToken ?? null;
}

// loginWithPassword 仅供 feature 内部（LoginForm）相对导入使用，不属于模块公开 API；
// 公开出口以 index.ts 为准。
export function loginWithPassword(input: Parameters<typeof executeLoginWithPassword>[0]) {
  return executeLoginWithPassword(input);
}
