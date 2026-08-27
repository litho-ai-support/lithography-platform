// src/features/auth-session/ui/auth-session-context.ts

import { createContext, useContext } from 'react';

import type { AuthSessionViewState } from '../application/auth-session.types';

// 会话视图只读；退出动作统一走 logoutAuthSession（同时清理会话与 Apollo 缓存），
// 不在 context 上暴露只清会话的裸操作，避免出现第二条退出口径。
export type AuthSessionContextValue = AuthSessionViewState;

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider.');
  }

  return context;
}
