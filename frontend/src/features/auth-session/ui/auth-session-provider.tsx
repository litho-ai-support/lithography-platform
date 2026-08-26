// src/features/auth-session/ui/auth-session-provider.tsx

import { type ReactNode, useMemo, useSyncExternalStore } from 'react';

import { createAuthSessionView } from '../application/auth-session-policy';
import { authSessionStore } from '../auth-session-entry';

import { AuthSessionContext, type AuthSessionContextValue } from './auth-session-context';

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    authSessionStore.subscribe,
    authSessionStore.getSnapshot,
    authSessionStore.getSnapshot,
  );
  const value = useMemo<AuthSessionContextValue>(
    () =>
      state.status === 'authenticated'
        ? {
            clearSession: authSessionStore.clearSession,
            session: createAuthSessionView(state.session),
            status: state.status,
          }
        : {
            clearSession: authSessionStore.clearSession,
            session: null,
            status: state.status,
          },
    [state],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}
