// src/features/auth-session/application/auth-session.types.ts

export const AUTH_SESSION_ROLES = ['SUPER_ADMIN', 'ENGINEER', 'CUSTOMER'] as const;

export type AuthSessionRole = (typeof AUTH_SESSION_ROLES)[number];

export type AuthSessionUserSummary = {
  accessGroup: readonly AuthSessionRole[];
  nickname: string;
};

export type AuthSessionSnapshot = {
  accessToken: string;
  accountId: number;
  role: AuthSessionRole;
  userInfo: AuthSessionUserSummary | null;
};

export type EstablishAuthSessionInput = AuthSessionSnapshot;

export type AuthSessionState =
  | {
      session: null;
      status: 'anonymous';
    }
  | {
      session: AuthSessionSnapshot;
      status: 'authenticated';
    };

export type AuthSessionPersistence = {
  clear: () => void;
  read: () => AuthSessionSnapshot | null;
  write: (session: AuthSessionSnapshot) => void;
};

export type AuthSessionView = Omit<AuthSessionSnapshot, 'accessToken'>;

export type AuthSessionViewState =
  | {
      session: null;
      status: 'anonymous';
    }
  | {
      session: AuthSessionView;
      status: 'authenticated';
    };
