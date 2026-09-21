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

/**
 * 仅更新当前会话显示昵称的窄入口（账号设置资料保存成功后的回写面）。
 *
 * 只收窄到「昵称」这一件事：accountId 必须与当前会话一致、新昵称经 snapshot
 * 工厂校验后，内存状态与 sessionStorage 持久化同步更新并发布订阅；其余情况
 * 一律不更新。返回是否发生了更新。不暴露 Token / 角色等任何其他会话字段的
 * 写入口。
 */
export function updateCurrentAuthSessionNickname(accountId: number, nickname: string): boolean {
  return authSessionStore.updateNickname({ accountId, nickname });
}

// loginWithPassword 仅供 feature 内部（LoginForm）相对导入使用，不属于模块公开 API；
// 公开出口以 index.ts 为准。
export function loginWithPassword(input: Parameters<typeof executeLoginWithPassword>[0]) {
  return executeLoginWithPassword(input);
}
