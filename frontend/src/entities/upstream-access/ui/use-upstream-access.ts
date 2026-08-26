// src/entities/upstream-access/ui/use-upstream-access.ts

// upstream access 的 UI 边界：React 状态宿主、keepAlive 定时器生命周期与
// concrete persistence adapter 装配；业务编排全部委托 application controller。
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  RollingUpstreamAccessInput,
  UpstreamAccessKeepAliveFailure,
  UpstreamAccessLoginInput,
  UseUpstreamAccessOptions,
} from '../application/upstream-access.types';
import {
  createUpstreamAccessController,
  type UpstreamAccessController,
} from '../application/upstream-access-controller';
import { resolveUpstreamAccessKeepAliveFailure } from '../application/upstream-access-error';
import type { RollingUpstreamAccessResult } from '../application/upstream-access-rolling';
import { resolveUpstreamAccessRefreshDelay, type UpstreamAccess } from '../domain/upstream-access';
import { browserUpstreamAccessPersistence } from '../infrastructure/upstream-access-storage';

export function useUpstreamAccess(options: UseUpstreamAccessOptions) {
  const { account, keepAlive, refreshLeadTimeMs, requestAccess, requestRefreshAccess } = options;
  const [, setStorageRevision] = useState(0);
  const [keepAliveFailure, setKeepAliveFailure] = useState<UpstreamAccessKeepAliveFailure | null>(
    null,
  );
  const accountId = account?.accountId ?? null;
  const controller = useMemo<UpstreamAccessController>(
    () =>
      createUpstreamAccessController({
        persistence: browserUpstreamAccessPersistence,
        requestAccess,
        requestRefreshAccess,
      }),
    [requestAccess, requestRefreshAccess],
  );
  const access = controller.read(accountId);

  const bumpStorageRevision = useCallback(() => {
    setStorageRevision((revision) => revision + 1);
  }, []);

  const clear = useCallback(() => {
    controller.clear();
    setKeepAliveFailure(null);
    bumpStorageRevision();
  }, [bumpStorageRevision, controller]);

  const login = useCallback(
    async (input: UpstreamAccessLoginInput) => {
      const nextAccess = await controller.login(accountId, input);

      setKeepAliveFailure(null);
      bumpStorageRevision();
      return nextAccess;
    },
    [accountId, bumpStorageRevision, controller],
  );

  const persistRollingAccess = useCallback(
    (currentAccess: UpstreamAccess, input: RollingUpstreamAccessInput) => {
      const nextAccess = controller.persistRollingAccess(currentAccess, input);

      bumpStorageRevision();
      return nextAccess;
    },
    [bumpStorageRevision, controller],
  );

  const persistAccessFromResult = useCallback(
    (currentAccess: UpstreamAccess, result: RollingUpstreamAccessResult) => {
      const nextAccess = controller.persistAccessFromResult(currentAccess, result);

      if (nextAccess !== currentAccess) {
        bumpStorageRevision();
      }

      return nextAccess;
    },
    [bumpStorageRevision, controller],
  );

  const refreshAccess = useCallback(
    async (currentAccess?: UpstreamAccess) => {
      const accessToRefresh = currentAccess ?? access;

      try {
        const nextAccess = await controller.refresh(accessToRefresh);

        setKeepAliveFailure(null);
        bumpStorageRevision();
        return nextAccess;
      } catch (error) {
        setKeepAliveFailure(
          resolveUpstreamAccessKeepAliveFailure(error, accessToRefresh?.upstreamLoginId ?? null),
        );
        bumpStorageRevision();
        throw error;
      }
    },
    [access, bumpStorageRevision, controller],
  );

  useEffect(() => {
    if (!keepAlive || !requestRefreshAccess) {
      return undefined;
    }

    const delay = resolveUpstreamAccessRefreshDelay(
      access?.expiresAt ?? null,
      Date.now(),
      refreshLeadTimeMs,
    );

    if (delay === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      refreshAccess(access ?? undefined).catch(() => undefined);
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
