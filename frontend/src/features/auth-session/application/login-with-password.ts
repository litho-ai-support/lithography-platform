// src/features/auth-session/application/login-with-password.ts

import type { AuthSessionView, EstablishAuthSessionInput } from './auth-session.types';
import { createAuthSessionView } from './auth-session-policy';

export type LoginWithPasswordInput = {
  loginName: string;
  loginPassword: string;
};

export type AuthLoginGateway = {
  loginWithPassword: (input: LoginWithPasswordInput) => Promise<EstablishAuthSessionInput>;
};

type AuthSessionEstablisher = {
  establishSession: (input: EstablishAuthSessionInput) => void;
};

type LoginWithPasswordDependencies = {
  gateway: AuthLoginGateway;
  session: AuthSessionEstablisher;
};

export function createLoginWithPasswordUsecase({
  gateway,
  session,
}: LoginWithPasswordDependencies) {
  return async function loginWithPassword(input: LoginWithPasswordInput): Promise<AuthSessionView> {
    const authenticatedSession = await gateway.loginWithPassword({
      loginName: input.loginName.trim(),
      loginPassword: input.loginPassword,
    });

    session.establishSession(authenticatedSession);

    return createAuthSessionView(authenticatedSession);
  };
}
