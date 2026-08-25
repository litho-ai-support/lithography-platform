// src/entities/upstream-access/application/upstream-access-rolling.ts

import type { StoredUpstreamAccess } from '../infrastructure/upstream-access-storage';

export type RollingUpstreamAccessResult = {
  expiresAt?: string | null;
  upstreamAccessToken?: string | null;
  upstreamLoginId?: string | null;
};

export type PersistUpstreamAccessFromResult = (
  currentAccess: StoredUpstreamAccess,
  result: RollingUpstreamAccessResult,
) => StoredUpstreamAccess;

export function hasRollingUpstreamAccessResult(
  value: RollingUpstreamAccessResult | null | undefined,
): value is RollingUpstreamAccessResult & {
  expiresAt: string;
  upstreamAccessToken: string;
} {
  return Boolean(
    typeof value?.upstreamAccessToken === 'string' &&
    value.upstreamAccessToken.trim() &&
    typeof value.expiresAt === 'string' &&
    value.expiresAt.trim(),
  );
}
