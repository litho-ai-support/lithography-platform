// src/entities/upstream-access/application/upstream-access-controller.ts

// upstream access 生命周期的纯编排实现：登录、滚动覆盖、刷新与失效清理。
// 只依赖 application 拥有的 port 与 domain 模型，不导入 React、storage 实现或定时器；
// UI lifecycle（状态宿主、keepAlive 定时器）见 ui/use-upstream-access.ts。
import type { UpstreamAccess } from '../domain/upstream-access';

import type {
  RequestUpstreamAccess,
  RequestUpstreamAccessRefresh,
  RollingUpstreamAccessInput,
  UpstreamAccessLoginInput,
  UpstreamAccessPersistence,
} from './upstream-access.types';
import {
  hasRollingUpstreamAccessResult,
  type RollingUpstreamAccessResult,
} from './upstream-access-rolling';

type UpstreamAccessControllerDependencies = {
  persistence: UpstreamAccessPersistence;
  requestAccess: RequestUpstreamAccess;
  requestRefreshAccess?: RequestUpstreamAccessRefresh;
};

export type UpstreamAccessController = {
  clear: () => void;
  login: (accountId: number | null, input: UpstreamAccessLoginInput) => Promise<UpstreamAccess>;
  persistAccessFromResult: (
    currentAccess: UpstreamAccess,
    result: RollingUpstreamAccessResult,
  ) => UpstreamAccess;
  persistRollingAccess: (
    currentAccess: UpstreamAccess,
    input: RollingUpstreamAccessInput,
  ) => UpstreamAccess;
  read: (accountId: number | null) => UpstreamAccess | null;
  refresh: (currentAccess: UpstreamAccess | null) => Promise<UpstreamAccess>;
};

function mergeRollingInput(
  currentAccess: UpstreamAccess,
  input: RollingUpstreamAccessInput,
): UpstreamAccess {
  return {
    accountId: currentAccess.accountId,
    expiresAt: input.expiresAt ?? currentAccess.expiresAt,
    upstreamAccessToken: input.upstreamAccessToken,
    upstreamLoginId: input.upstreamLoginId ?? currentAccess.upstreamLoginId,
  };
}

export function createUpstreamAccessController({
  persistence,
  requestAccess,
  requestRefreshAccess,
}: UpstreamAccessControllerDependencies): UpstreamAccessController {
  let inflightRefresh: Promise<UpstreamAccess> | null = null;

  function persistRollingAccess(currentAccess: UpstreamAccess, input: RollingUpstreamAccessInput) {
    const nextAccess = mergeRollingInput(currentAccess, input);

    persistence.write(nextAccess);

    return persistence.read(currentAccess.accountId) ?? nextAccess;
  }

  function persistAccessFromResult(
    currentAccess: UpstreamAccess,
    result: RollingUpstreamAccessResult,
  ) {
    if (!hasRollingUpstreamAccessResult(result)) {
      return currentAccess;
    }

    return persistRollingAccess(currentAccess, {
      expiresAt: result.expiresAt,
      upstreamAccessToken: result.upstreamAccessToken,
      upstreamLoginId: result.upstreamLoginId,
    });
  }

  return {
    clear() {
      persistence.clear();
    },
    async login(accountId, input) {
      if (accountId === null) {
        throw new Error('当前登录账号尚未就绪，请稍后再试。');
      }

      const normalizedLoginId = input.loginId.trim();
      const tokenResult = await requestAccess({
        loginId: normalizedLoginId,
        secret: input.secret,
      });
      const rawUpstreamLoginId = tokenResult.upstreamLoginId ?? normalizedLoginId;
      const nextAccess: UpstreamAccess = {
        accountId,
        expiresAt: tokenResult.expiresAt,
        upstreamAccessToken: tokenResult.upstreamAccessToken,
        upstreamLoginId: rawUpstreamLoginId.trim() || null,
      };

      persistence.write(nextAccess);

      return nextAccess;
    },
    persistAccessFromResult,
    persistRollingAccess,
    read(accountId) {
      return accountId === null ? null : persistence.read(accountId);
    },
    refresh(currentAccess) {
      if (!currentAccess) {
        throw new Error('尚未建立 upstream access。');
      }

      if (!requestRefreshAccess) {
        throw new Error('当前 upstream access 未配置刷新能力。');
      }

      if (inflightRefresh) {
        return inflightRefresh;
      }

      inflightRefresh = (async () => {
        try {
          const result = await requestRefreshAccess({
            upstreamAccessToken: currentAccess.upstreamAccessToken,
          });

          return persistAccessFromResult(currentAccess, result);
        } catch (error) {
          persistence.clear();
          throw error;
        } finally {
          inflightRefresh = null;
        }
      })();

      return inflightRefresh;
    },
  };
}
