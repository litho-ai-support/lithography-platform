// src/entities/upstream-access/infrastructure/upstream-access-storage.ts

export type StoredUpstreamAccess = {
  accountId: number;
  expiresAt: string | null;
  upstreamAccessToken: string;
  upstreamLoginId: string | null;
  version: 1;
};

const UPSTREAM_ACCESS_STORAGE_KEY = 'aigc-friendly-frontend.upstream.access.v1';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isStoredUpstreamAccess(value: unknown): value is StoredUpstreamAccess {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.version === 1 &&
    typeof candidate.accountId === 'number' &&
    Number.isInteger(candidate.accountId) &&
    candidate.accountId > 0 &&
    typeof candidate.upstreamAccessToken === 'string' &&
    candidate.upstreamAccessToken.trim().length > 0 &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === 'string') &&
    (candidate.upstreamLoginId === null || typeof candidate.upstreamLoginId === 'string')
  );
}

function readRawStoredUpstreamAccess(): StoredUpstreamAccess | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(UPSTREAM_ACCESS_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!isStoredUpstreamAccess(parsed)) {
      window.localStorage.removeItem(UPSTREAM_ACCESS_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(UPSTREAM_ACCESS_STORAGE_KEY);
    return null;
  }
}

export function clearStoredUpstreamAccess() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(UPSTREAM_ACCESS_STORAGE_KEY);
}

export function readStoredUpstreamAccess(accountId: number): StoredUpstreamAccess | null {
  const access = readRawStoredUpstreamAccess();

  if (!access) {
    return null;
  }

  if (access.accountId !== accountId) {
    clearStoredUpstreamAccess();
    return null;
  }

  return access;
}

export function writeStoredUpstreamAccess(input: {
  accountId: number;
  expiresAt?: string | null;
  upstreamAccessToken: string;
  upstreamLoginId?: string | null;
}) {
  if (!canUseStorage()) {
    return;
  }

  const nextValue: StoredUpstreamAccess = {
    accountId: input.accountId,
    expiresAt: input.expiresAt ?? null,
    upstreamAccessToken: input.upstreamAccessToken.trim(),
    upstreamLoginId: input.upstreamLoginId?.trim() || null,
    version: 1,
  };

  if (!nextValue.upstreamAccessToken) {
    clearStoredUpstreamAccess();
    return;
  }

  window.localStorage.setItem(UPSTREAM_ACCESS_STORAGE_KEY, JSON.stringify(nextValue));
}
