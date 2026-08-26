// src/features/auth-session/auth-session-entry.ts

import { createAuthSessionStore } from './application/auth-session-store';
import { createLoginWithPasswordUsecase } from './application/login-with-password';
import { graphQLAuthLoginGateway } from './infrastructure/auth-login-graphql';
import { browserAuthSessionPersistence } from './infrastructure/auth-session-storage';

export const authSessionStore = createAuthSessionStore(browserAuthSessionPersistence);
const executeLoginWithPassword = createLoginWithPasswordUsecase({
  gateway: graphQLAuthLoginGateway,
  session: authSessionStore,
});

export function getCurrentAuthSession() {
  return authSessionStore.getSnapshot().session;
}

export function getAuthSessionAccessToken(): string | null {
  return getCurrentAuthSession()?.accessToken ?? null;
}

export function loginWithPassword(input: Parameters<typeof executeLoginWithPassword>[0]) {
  return executeLoginWithPassword(input);
}
