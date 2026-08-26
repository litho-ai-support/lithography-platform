// src/entities/upstream-access/infrastructure/upstream-access-storage.ts

// localStorage adapter：实现 application 拥有的 UpstreamAccessPersistence port。
// 持久化形状（version 字段）与字段清洗只停留在 infrastructure，不外泄到 domain 或公开 API。
import type { UpstreamAccessPersistence } from '../application/upstream-access.types';
import { UPSTREAM_ACCESS_STORAGE_VERSION, type UpstreamAccess } from '../domain/upstream-access';

type StoredUpstreamAccess = UpstreamAccess & {
  version: number;
};

const UPSTREAM_ACCESS_STORAGE_KEY = 'aigc-friendly-frontend.upstream.access.v1';

export type UpstreamAccessStorageBackend = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

function getBrowserLocalStorage(): UpstreamAccessStorageBackend | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredUpstreamAccess(value: unknown): value is StoredUpstreamAccess {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.version === UPSTREAM_ACCESS_STORAGE_VERSION &&
    typeof candidate.accountId === 'number' &&
    Number.isInteger(candidate.accountId) &&
    candidate.accountId > 0 &&
    typeof candidate.upstreamAccessToken === 'string' &&
    candidate.upstreamAccessToken.trim().length > 0 &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === 'string') &&
    (candidate.upstreamLoginId === null || typeof candidate.upstreamLoginId === 'string')
  );
}

export function createUpstreamAccessPersistence(
  getStorage: () => UpstreamAccessStorageBackend | null = getBrowserLocalStorage,
): UpstreamAccessPersistence {
  function clear() {
    try {
      getStorage()?.removeItem(UPSTREAM_ACCESS_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  function readRawStoredUpstreamAccess(): StoredUpstreamAccess | null {
    let rawValue: string | null;

    try {
      rawValue = getStorage()?.getItem(UPSTREAM_ACCESS_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }

    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;

      if (!isStoredUpstreamAccess(parsed)) {
        clear();
        return null;
      }

      return parsed;
    } catch {
      clear();
      return null;
    }
  }

  return {
    clear,
    read(accountId) {
      const storedAccess = readRawStoredUpstreamAccess();

      if (!storedAccess) {
        return null;
      }

      // token 只归属当前本站账号；切换账号后的残留必须失效并清空。
      if (storedAccess.accountId !== accountId) {
        clear();
        return null;
      }

      return {
        accountId: storedAccess.accountId,
        expiresAt: storedAccess.expiresAt,
        upstreamAccessToken: storedAccess.upstreamAccessToken,
        upstreamLoginId: storedAccess.upstreamLoginId,
      };
    },
    write(access) {
      const nextValue: StoredUpstreamAccess = {
        accountId: access.accountId,
        expiresAt: access.expiresAt ?? null,
        upstreamAccessToken: access.upstreamAccessToken.trim(),
        upstreamLoginId: access.upstreamLoginId?.trim() || null,
        version: UPSTREAM_ACCESS_STORAGE_VERSION,
      };

      if (!nextValue.upstreamAccessToken) {
        clear();
        return;
      }

      try {
        getStorage()?.setItem(UPSTREAM_ACCESS_STORAGE_KEY, JSON.stringify(nextValue));
      } catch {
        // Keep the in-memory access usable even when persistence is unavailable.
      }
    },
  };
}

export const browserUpstreamAccessPersistence = createUpstreamAccessPersistence();
