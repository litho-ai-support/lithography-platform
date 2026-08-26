// src/entities/upstream-access/application/upstream-access.types.ts

import type { UpstreamAccess } from '../domain/upstream-access';

import type { RollingUpstreamAccessResult } from './upstream-access-rolling';

// application 拥有的 persistence port；具体 storage adapter 由 infrastructure 实现，
// application 不导入任何 storage 实现，见 docs/infrastructure-rules.md。
export type UpstreamAccessPersistence = {
  clear: () => void;
  read: (accountId: number) => UpstreamAccess | null;
  write: (access: UpstreamAccess) => void;
};

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

export type RollingUpstreamAccessInput = {
  expiresAt?: string | null;
  upstreamAccessToken: string;
  upstreamLoginId?: string | null;
};

export type UseUpstreamAccessOptions = {
  account: UpstreamAccessAccountIdentity | null;
  keepAlive?: boolean;
  refreshLeadTimeMs?: number;
  requestAccess: RequestUpstreamAccess;
  requestRefreshAccess?: RequestUpstreamAccessRefresh;
};
