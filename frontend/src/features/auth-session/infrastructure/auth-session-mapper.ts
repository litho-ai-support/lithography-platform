// src/features/auth-session/infrastructure/auth-session-mapper.ts

import type {
  AuthSessionRole,
  AuthSessionSnapshot,
  AuthSessionUserSummary,
} from '../application/auth-session.types';
import { createAuthSessionSnapshot, isAuthSessionRole } from '../application/auth-session-policy';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function decodeAccessGroup(value: unknown): AuthSessionRole[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const roles: AuthSessionRole[] = [];

  for (const role of value) {
    if (!isAuthSessionRole(role)) {
      return null;
    }

    roles.push(role);
  }

  return roles;
}

function decodeUserSummary(value: unknown): AuthSessionUserSummary | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value) || typeof value.nickname !== 'string') {
    return undefined;
  }

  const accessGroup = decodeAccessGroup(value.accessGroup);

  if (!accessGroup) {
    return undefined;
  }

  return {
    accessGroup,
    nickname: value.nickname,
  };
}

export function decodeAuthSessionPayload(value: unknown): AuthSessionSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value.accessToken !== 'string' ||
    typeof value.accountId !== 'number' ||
    !isAuthSessionRole(value.role)
  ) {
    return null;
  }

  const userInfo = decodeUserSummary(value.userInfo);

  if (userInfo === undefined) {
    return null;
  }

  try {
    return createAuthSessionSnapshot({
      accessToken: value.accessToken,
      accountId: value.accountId,
      role: value.role,
      userInfo,
    });
  } catch {
    return null;
  }
}
