// src/features/auth-session/application/auth-session-policy.ts

import { sanitizeRedirectTarget } from '@/shared/navigation';

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

// SUPER_ADMIN 按后端角色层级继承 ENGINEER 与 CUSTOMER 的访问能力，见
// backend/docs/api/auth-session-current.md 与 docs/development/task-acceptance.md。
const AUTH_SESSION_ROLE_ALLOWED_PATHS: Record<AuthSessionRole, readonly string[]> = {
  CUSTOMER: ['/customer'],
  ENGINEER: ['/engineer'],
  SUPER_ADMIN: ['/admin', '/customer', '/engineer'],
};

export function resolveAuthSessionHomePath(role: AuthSessionRole): string {
  return AUTH_SESSION_ROLE_HOME_PATHS[role];
}

export function isAuthSessionRoleAllowedAt(role: AuthSessionRole, path: string): boolean {
  return AUTH_SESSION_ROLE_ALLOWED_PATHS[role].includes(path);
}

function extractPathname(value: string): string {
  try {
    return new URL(value, 'https://lithography.local').pathname;
  } catch {
    return value;
  }
}

export type AuthSessionRoleCarrier = Pick<AuthSessionSnapshot, 'role'>;

// 登录/守卫共用的入口路径决策唯一实现；resolveLoginRouteRedirect 与
// app/router 的登录后跳转都委托这里，避免在组合根出现第二份决策。
export function resolveAuthSessionEntryPath(
  session: AuthSessionRoleCarrier,
  returnToCandidate?: unknown,
): string {
  const safeReturnTo = resolveSafeReturnTo(returnToCandidate);

  if (safeReturnTo && isAuthSessionRoleAllowedAt(session.role, extractPathname(safeReturnTo))) {
    return safeReturnTo;
  }

  return resolveAuthSessionHomePath(session.role);
}

export function resolveLoginRouteRedirect(
  session: AuthSessionRoleCarrier | null,
  returnToCandidate?: unknown,
): string | null {
  if (!session) {
    return null;
  }

  return resolveAuthSessionEntryPath(session, returnToCandidate);
}

export function resolveProtectedRouteRedirect(
  session: AuthSessionRoleCarrier | null,
  requestedPath: string,
): string | null {
  if (!session) {
    return `/login?returnTo=${encodeURIComponent(requestedPath)}`;
  }

  if (!isAuthSessionRoleAllowedAt(session.role, extractPathname(requestedPath))) {
    return resolveAuthSessionHomePath(session.role);
  }

  return null;
}

export function resolveSafeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    return null;
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }

  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0);

    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

  if (hasControlCharacter) {
    return null;
  }

  // 同源归一化复用 shared/navigation 的既有实现；它失败时回退 '/'，
  // 仅在输入本身就是 '/' 时才视为合法结果。
  const sanitized = sanitizeRedirectTarget(value);

  if (sanitized === '/' && value !== '/') {
    return null;
  }

  return sanitized;
}
