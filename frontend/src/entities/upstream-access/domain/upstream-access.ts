// src/entities/upstream-access/domain/upstream-access.ts

// upstream access 的业务对象模型；存储持久化形状（含 version 字段）属于
// infrastructure 的防腐细节，不出现在 domain 与公开 API 中。
// 存储约束见 docs/project-convention/upstream-access-frontend-ownership.md。
export type UpstreamAccess = {
  accountId: number;
  expiresAt: string | null;
  upstreamAccessToken: string;
  upstreamLoginId: string | null;
};

export const UPSTREAM_ACCESS_STORAGE_VERSION = 1;

// keepAlive 默认提前量与最小刷新间隔，属于 token 生命周期本身的规则。
export const DEFAULT_UPSTREAM_ACCESS_REFRESH_LEAD_TIME_MS = 2 * 60 * 1000;
export const MIN_UPSTREAM_ACCESS_REFRESH_DELAY_MS = 1000;

export function resolveUpstreamAccessRefreshDelay(
  expiresAt: string | null,
  nowMs: number,
  leadTimeMs = DEFAULT_UPSTREAM_ACCESS_REFRESH_LEAD_TIME_MS,
): number | null {
  if (!expiresAt) {
    return null;
  }

  const expiresAtTimestamp = new Date(expiresAt).getTime();

  if (Number.isNaN(expiresAtTimestamp)) {
    return null;
  }

  return Math.max(expiresAtTimestamp - nowMs - leadTimeMs, MIN_UPSTREAM_ACCESS_REFRESH_DELAY_MS);
}
