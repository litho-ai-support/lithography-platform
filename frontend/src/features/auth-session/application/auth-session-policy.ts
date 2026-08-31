// src/features/auth-session/application/auth-session-policy.ts

import { sanitizeRedirectTarget } from '@/shared/navigation';

import {
  AUTH_LOGIN_REASON_SESSION_EXPIRED,
  composeLoginRedirectPath,
  composeSessionExpiredLoginRedirectPath,
  extractUrlPathname,
} from '../infrastructure/auth-return-to-url';

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
// 这里登记的是各角色允许访问的路由根路径；根路径下的子页面（如 /customer/）
// 由 isRolePathAllowed 的带边界前缀匹配统一放行，不在别处维护第二份角色路径表。
const AUTH_SESSION_ROLE_ALLOWED_ROOT_PATHS: Record<AuthSessionRole, readonly string[]> = {
  CUSTOMER: ['/customer'],
  ENGINEER: ['/engineer'],
  SUPER_ADMIN: ['/admin', '/customer', '/engineer'],
};

// 角色路由拒绝清单：优先于根路径表生效，匹配语义与根路径表一致（精确或带边界子路径）。
// 2026-08-29 负责人裁定：SUPER_ADMIN 第一版不代客户创建维修申请（后端精确仅接受
// CUSTOMER）。继承放行会让超管进入「型号加载即被拒」的残缺页面，前后端口径不一致，
// 故在此显式拒绝创建页，与 ENGINEER 一致跳回各自个人主页；后端约束保持不变。
const AUTH_SESSION_ROLE_DENIED_PATHS: Record<AuthSessionRole, readonly string[]> = {
  CUSTOMER: [],
  ENGINEER: [],
  SUPER_ADMIN: ['/customer/repair-requests/new'],
};

export function resolveAuthSessionHomePath(role: AuthSessionRole): string {
  return AUTH_SESSION_ROLE_HOME_PATHS[role];
}

// 角色路由放行判断的唯一实现：精确等于根路径，或位于根路径的带边界子路径下。
// 带边界前缀可放行 /customer/、/customer/repair-requests/new，
// 同时拒绝相似前缀 /customer-admin、/customerABC。
export function isAuthSessionRolePathAllowed(path: string, rootPath: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

export function isAuthSessionRoleAllowedAt(role: AuthSessionRole, path: string): boolean {
  const denied = AUTH_SESSION_ROLE_DENIED_PATHS[role].some((deniedPath) =>
    isAuthSessionRolePathAllowed(path, deniedPath),
  );

  if (denied) {
    return false;
  }

  return AUTH_SESSION_ROLE_ALLOWED_ROOT_PATHS[role].some((rootPath) =>
    isAuthSessionRolePathAllowed(path, rootPath),
  );
}

export type AuthSessionRoleCarrier = Pick<AuthSessionSnapshot, 'role'>;

// 登录/守卫共用的入口路径决策唯一实现；resolveLoginRouteRedirect、
// resolveEntryRouteRedirect 与 app/router 的登录后跳转都委托这里，
// 避免在组合根出现第二份决策。
export function resolveAuthSessionEntryPath(
  session: AuthSessionRoleCarrier,
  returnToCandidate?: unknown,
): string {
  const safeReturnTo = resolveSafeReturnTo(returnToCandidate);

  if (safeReturnTo && isAuthSessionRoleAllowedAt(session.role, extractUrlPathname(safeReturnTo))) {
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
    return composeLoginRedirectPath(requestedPath);
  }

  if (!isAuthSessionRoleAllowedAt(session.role, extractUrlPathname(requestedPath))) {
    return resolveAuthSessionHomePath(session.role);
  }

  return null;
}

// 入口路由恒跳转，因此没有请求目标与 returnTo：匿名去 /login，
// 已登录去角色默认入口；不带 returnTo 避免登录后多一次中转。
export function resolveEntryRouteRedirect(session: AuthSessionRoleCarrier | null): string {
  if (!session) {
    return '/login';
  }

  return resolveAuthSessionEntryPath(session);
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

// 失效原因的受控判定：仅预定义的 session-expired 成立；后端原始 message、
// errorCode、Token 或任意字符串都不被视为失效原因。
export function isAuthSessionExpiredReason(value: unknown): boolean {
  return value === AUTH_LOGIN_REASON_SESSION_EXPIRED;
}

// 失效跳转目标的唯一决策：恒定携带固定失效原因；仅安全站内路径才作为
// returnTo；当前已在 /login 前缀下（含 /login/ 等尾随形式）时不携带，避免循环。
// /login 是叶子路由，其子路径都不是有效的返回目标，判定口径与角色路径表一致。
export function resolveSessionExpiredLoginPath(currentPath?: unknown): string {
  const safeReturnTo = resolveSafeReturnTo(currentPath);
  const returnToPathname = safeReturnTo === null ? null : extractUrlPathname(safeReturnTo);

  if (returnToPathname === null || isAuthSessionRolePathAllowed(returnToPathname, '/login')) {
    return composeSessionExpiredLoginRedirectPath(null);
  }

  return composeSessionExpiredLoginRedirectPath(safeReturnTo);
}
