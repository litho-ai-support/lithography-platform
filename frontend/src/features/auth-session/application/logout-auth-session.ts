// src/features/auth-session/application/logout-auth-session.ts

import type { AuthSessionIdentity } from './auth-session.types';

export type AuthSessionClearer = {
  clearSession: () => void;
};

export type AuthSessionCacheClearer = {
  clearCache: () => Promise<void>;
};

export type AuthSessionIdentityClearer = {
  clearSessionIfIdentityMatches: (identity: AuthSessionIdentity | null) => boolean;
};

type LogoutAuthSessionDependencies = {
  cache: AuthSessionCacheClearer;
  session: AuthSessionClearer;
};

type ConditionalLogoutAuthSessionDependencies = {
  cache: AuthSessionCacheClearer;
  session: AuthSessionIdentityClearer;
};

export function createLogoutAuthSessionUsecase({ cache, session }: LogoutAuthSessionDependencies) {
  return async function logoutAuthSession(): Promise<void> {
    session.clearSession();
    await cache.clearCache();
  };
}

/**
 * 条件登出：仅当 identity 仍描述「当前会话」（同账号且同会话代次）时清理会话真源
 * 与 GraphQL 缓存并返回 true。identity 为 null（装配层未接入采样）或不匹配
 * （改密响应在途期间退出重登 / 已切换账号）时不做任何清理并返回 false——
 * 迟到响应不得打断当前会话。缓存清理失败仍向外传播（会话已清理，由调用方
 * 决定是否继续跳转）。
 */
export function createConditionalLogoutAuthSessionUsecase({
  cache,
  session,
}: ConditionalLogoutAuthSessionDependencies) {
  return async function logoutAuthSessionIfIdentityMatches(
    identity: AuthSessionIdentity | null,
  ): Promise<boolean> {
    if (!session.clearSessionIfIdentityMatches(identity)) {
      return false;
    }

    await cache.clearCache();

    return true;
  };
}
