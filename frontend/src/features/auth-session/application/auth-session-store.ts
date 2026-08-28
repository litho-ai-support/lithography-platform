// src/features/auth-session/application/auth-session-store.ts

import type {
  AuthSessionPersistence,
  AuthSessionState,
  EstablishAuthSessionInput,
} from './auth-session.types';
import { createAuthSessionSnapshot } from './auth-session-policy';

type AuthSessionListener = () => void;

const ANONYMOUS_AUTH_SESSION_STATE: AuthSessionState = {
  session: null,
  status: 'anonymous',
};

export type AuthSessionStore = {
  clearSession: () => void;
  establishSession: (input: EstablishAuthSessionInput) => void;
  getSnapshot: () => AuthSessionState;
  restoreSession: () => void;
  subscribe: (listener: AuthSessionListener) => () => void;
};

function restoreState(persistence: AuthSessionPersistence): AuthSessionState {
  const session = persistence.read();

  return session
    ? {
        session,
        status: 'authenticated',
      }
    : ANONYMOUS_AUTH_SESSION_STATE;
}

export function createAuthSessionStore(persistence: AuthSessionPersistence): AuthSessionStore {
  const listeners = new Set<AuthSessionListener>();
  let state = restoreState(persistence);

  function publish(nextState: AuthSessionState) {
    state = nextState;
    listeners.forEach((listener) => listener());
  }

  return {
    clearSession() {
      persistence.clear();
      publish(ANONYMOUS_AUTH_SESSION_STATE);
    },
    establishSession(input) {
      const session = createAuthSessionSnapshot(input);

      persistence.write(session);
      publish({ session, status: 'authenticated' });
    },
    getSnapshot() {
      return state;
    },
    restoreSession() {
      publish(restoreState(persistence));
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
