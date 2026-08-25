// src/entities/upstream-access/application/upstream-access-controller.ts

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clearStoredUpstreamAccess,
  readStoredUpstreamAccess,
  type StoredUpstreamAccess,
  writeStoredUpstreamAccess,
} from '../infrastructure/upstream-access-storage';

import {
  isExpiredUpstreamAccessError,
  resolveUpstreamAccessErrorMessage,
} from './upstream-access-error';
import {
  hasRollingUpstreamAccessResult,
  type RollingUpstreamAccessResult,
} from './upstream-access-rolling';

export type UpstreamAccessAccountIdentity = {
  accountId: number;
  displayName?: string;
};

export type UpstreamAccessLoginInput = {
  loginId: string;
  secret: string;
};

export type UpstreamAccessTokenResult = {
  expiresAt: string | null;
  upstreamAccessToken: string;
  upstreamLoginId?: string | null;
};

export type RequestUpstreamAccess = (
  input: UpstreamAccessLoginInput,
) => Promise<UpstreamAccessTokenResult>;

export type RequestUpstreamAccessRefresh = (input: {
  upstreamAccessToken: string;
}) => Promise<RollingUpstreamAccessResult>;

export type UpstreamAccessKeepAliveFailure = {
  message: string;
  upstreamLoginId: string | null;
};

type RollingUpstreamAccessInput = {
  expiresAt?: string | null;
  upstreamAccessToken: string;
  upstreamLoginId?: string | null;
};

type UseUpstreamAccessOptions = {
  account: UpstreamAccessAccountIdentity | null;
  keepAlive?: boolean;
  refreshLeadTimeMs?: number;
  requestAccess: RequestUpstreamAccess;
  requestRefreshAccess?: RequestUpstreamAccessRefresh;
};

const DEFAULT_REFRESH_LEAD_TIME_MS = 2 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 1000;

function persistUpstreamAccess(access: StoredUpstreamAccess, input: RollingUpstreamAccessInput) {
  writeStoredUpstreamAccess({
    accountId: access.accountId,
    expiresAt: input.expiresAt ?? access.expiresAt,
    upstreamAccessToken: input.upstreamAccessToken,
    upstreamLoginId: input.upstreamLoginId ?? access.upstreamLoginId,
  });

  return (
    readStoredUpstreamAccess(access.accountId) ?? {
      ...access,
      expiresAt: input.expiresAt ?? access.expiresAt,
      upstreamAccessToken: input.upstreamAccessToken,
      upstreamLoginId: input.upstreamLoginId ?? access.upstreamLoginId,
    }
  );
}

function createUpstreamAccess(input: {
  accountId: number;
  expiresAt: string | null;
  upstreamAccessToken: string;
  upstreamLoginId?: string | null;
}): StoredUpstreamAccess {
  return {
    accountId: input.accountId,
    expiresAt: input.expiresAt,
    upstreamAccessToken: input.upstreamAccessToken,
    upstreamLoginId: input.upstreamLoginId?.trim() || null,
    version: 1,
  };
}

export function useUpstreamAccess(options: UseUpstreamAccessOptions) {
  const { account, keepAlive, refreshLeadTimeMs, requestAccess, requestRefreshAccess } = options;
  const [, setStorageRevision] = useState(0);
  const [keepAliveFailure, setKeepAliveFailure] = useState<UpstreamAccessKeepAliveFailure | null>(
    null,
  );
  const refreshPromiseRef = useRef<Promise<StoredUpstreamAccess> | null>(null);
  const accountId = account?.accountId ?? null;
  const access = accountId ? readStoredUpstreamAccess(accountId) : null;
  const refreshStoredAccess = useCallback(() => {
    setStorageRevision((revision) => revision + 1);
  }, []);

  const persistRollingAccess = useCallback(
    (currentAccess: StoredUpstreamAccess, input: RollingUpstreamAccessInput) => {
      const nextAccess = persistUpstreamAccess(currentAccess, input);

      refreshStoredAccess();
      return nextAccess;
    },
    [refreshStoredAccess],
  );

  const persistAccessFromResult = useCallback(
    (currentAccess: StoredUpstreamAccess, result: RollingUpstreamAccessResult) => {
      if (!hasRollingUpstreamAccessResult(result)) {
        return currentAccess;
      }

      return persistRollingAccess(currentAccess, {
        expiresAt: result.expiresAt,
        upstreamAccessToken: result.upstreamAccessToken,
        upstreamLoginId: result.upstreamLoginId,
      });
    },
    [persistRollingAccess],
  );

  const clear = useCallback(() => {
    clearStoredUpstreamAccess();
    setKeepAliveFailure(null);
    refreshStoredAccess();
  }, [refreshStoredAccess]);

  const commitAccess = useCallback(
    (nextAccess: StoredUpstreamAccess) => {
      writeStoredUpstreamAccess(nextAccess);
      refreshStoredAccess();
    },
    [refreshStoredAccess],
  );

  const login = useCallback(
    async (input: UpstreamAccessLoginInput) => {
      if (!accountId) {
        throw new Error('当前登录账号尚未就绪，请稍后再试。');
      }

      const normalizedLoginId = input.loginId.trim();
      const upstreamAccess = await requestAccess({
        loginId: normalizedLoginId,
        secret: input.secret,
      });
      const nextAccess = createUpstreamAccess({
        accountId,
        expiresAt: upstreamAccess.expiresAt,
        upstreamAccessToken: upstreamAccess.upstreamAccessToken,
        upstreamLoginId: upstreamAccess.upstreamLoginId ?? normalizedLoginId,
      });

      commitAccess(nextAccess);
      setKeepAliveFailure(null);
      return nextAccess;
    },
    [accountId, commitAccess, requestAccess],
  );

  const refreshAccess = useCallback(
    async (currentAccess?: StoredUpstreamAccess) => {
      const accessToRefresh = currentAccess ?? access;

      if (!accessToRefresh) {
        throw new Error('尚未建立 upstream access。');
      }

      if (!requestRefreshAccess) {
        throw new Error('当前 upstream access 未配置刷新能力。');
      }

      if (refreshPromiseRef.current) {
        return refreshPromiseRef.current;
      }

      refreshPromiseRef.current = (async () => {
        try {
          const result = await requestRefreshAccess({
            upstreamAccessToken: accessToRefresh.upstreamAccessToken,
          });
          const nextAccess = persistAccessFromResult(accessToRefresh, result);

          setKeepAliveFailure(null);
          return nextAccess;
        } catch (error) {
          clearStoredUpstreamAccess();
          setKeepAliveFailure({
            message: isExpiredUpstreamAccessError(error)
              ? 'upstream access 已失效，请重新授权后继续。'
              : resolveUpstreamAccessErrorMessage(
                  error,
                  'upstream access 刷新失败，请重新授权后继续。',
                ),
            upstreamLoginId: accessToRefresh.upstreamLoginId,
          });
          refreshStoredAccess();
          throw error;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();

      return refreshPromiseRef.current;
    },
    [access, persistAccessFromResult, refreshStoredAccess, requestRefreshAccess],
  );

  useEffect(() => {
    if (!keepAlive || !requestRefreshAccess || !access?.expiresAt) {
      return undefined;
    }

    const expiresAtTimestamp = new Date(access.expiresAt).getTime();

    if (Number.isNaN(expiresAtTimestamp)) {
      return undefined;
    }

    const leadTime = refreshLeadTimeMs ?? DEFAULT_REFRESH_LEAD_TIME_MS;
    const delay = Math.max(expiresAtTimestamp - Date.now() - leadTime, MIN_REFRESH_DELAY_MS);
    const timeoutId = window.setTimeout(() => {
      refreshAccess(access).catch(() => undefined);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [access, keepAlive, refreshAccess, refreshLeadTimeMs, requestRefreshAccess]);

  return {
    access,
    clear,
    keepAliveFailure,
    login,
    persistAccessFromResult,
    persistRollingAccess,
    refreshAccess,
  };
}
