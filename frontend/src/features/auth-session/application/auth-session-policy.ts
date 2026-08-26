// src/features/auth-session/application/auth-session-policy.ts

import {
  AUTH_SESSION_ROLES,
  type AuthSessionRole,
  type AuthSessionSnapshot,
  type AuthSessionUserSummary,
  type AuthSessionView,
  type EstablishAuthSessionInput,
} from './auth-session.types';

export function isAuthSessionRole(value: unknown): value is AuthSessionRole {
  return typeof value === 'string' && (AUTH_SESSION_ROLES as readonly string[]).includes(value);
}

function normalizeUserSummary(
  value: AuthSessionUserSummary | null,
  activeRole: AuthSessionRole,
): AuthSessionUserSummary | null {
  if (value === null) {
    return null;
  }

  const nickname = value.nickname.trim();
  const accessGroup = value.accessGroup;

  if (
    !nickname ||
    !Array.isArray(accessGroup) ||
    accessGroup.length === 0 ||
    !accessGroup.every(isAuthSessionRole) ||
    !accessGroup.includes(activeRole)
  ) {
    throw new Error('Cannot establish an invalid auth session.');
  }

  return {
    accessGroup: [...accessGroup],
    nickname,
  };
}

export function createAuthSessionSnapshot(input: EstablishAuthSessionInput): AuthSessionSnapshot {
  const accessToken = input.accessToken.trim();
  const { accountId, role } = input;

  if (
    !accessToken ||
    typeof accountId !== 'number' ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    !isAuthSessionRole(role)
  ) {
    throw new Error('Cannot establish an invalid auth session.');
  }

  return {
    accessToken,
    accountId,
    role,
    userInfo: normalizeUserSummary(input.userInfo, role),
  };
}
export function createAuthSessionView(session: AuthSessionSnapshot): AuthSessionView {
  return {
    accountId: session.accountId,
    role: session.role,
    userInfo: session.userInfo,
  };
}

const AUTH_SESSION_ROLE_HOME_PATHS: Record<AuthSessionRole, string> = {
  CUSTOMER: '/customer',
  ENGINEER: '/engineer',
  SUPER_ADMIN: '/admin',
};

export function resolveAuthSessionHomePath(role: AuthSessionRole): string {
  return AUTH_SESSION_ROLE_HOME_PATHS[role];
}

export function resolveLoginRouteRedirect(session: AuthSessionView | null): string | null {
  if (!session) {
    return null;
  }

  return resolveAuthSessionHomePath(session.role);
}
