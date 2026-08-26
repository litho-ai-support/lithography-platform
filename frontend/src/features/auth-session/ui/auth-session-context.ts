// src/features/auth-session/ui/auth-session-context.ts

import { createContext, useContext } from 'react';

import type { AuthSessionViewState } from '../application/auth-session.types';

export type AuthSessionContextValue = AuthSessionViewState & {
  clearSession: () => void;
};

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider.');
  }

  return context;
}
