// src/entities/upstream-access/index.ts

// 公开 API 只暴露 domain 模型、port、生命周期编排与 hook；
// 持久化形状（StoredUpstreamAccess）属于 infrastructure 防腐细节，不作为公开出口。
export type {
  RequestUpstreamAccess,
  RequestUpstreamAccessRefresh,
  RollingUpstreamAccessInput,
  UpstreamAccessAccountIdentity,
  UpstreamAccessKeepAliveFailure,
  UpstreamAccessLoginInput,
  UpstreamAccessPersistence,
  UpstreamAccessTokenResult,
  UseUpstreamAccessOptions,
} from './application/upstream-access.types';
export {
  createUpstreamAccessController,
  type UpstreamAccessController,
} from './application/upstream-access-controller';
export {
  isExpiredUpstreamAccessError,
  readUpstreamAccessGraphQLErrorDetail,
  resolveUpstreamAccessErrorMessage,
  resolveUpstreamAccessKeepAliveFailure,
} from './application/upstream-access-error';
export type {
  PersistUpstreamAccessFromResult,
  RollingUpstreamAccessResult,
} from './application/upstream-access-rolling';
export { hasRollingUpstreamAccessResult } from './application/upstream-access-rolling';
export type { UpstreamAccess } from './domain/upstream-access';
export {
  DEFAULT_UPSTREAM_ACCESS_REFRESH_LEAD_TIME_MS,
  MIN_UPSTREAM_ACCESS_REFRESH_DELAY_MS,
  resolveUpstreamAccessRefreshDelay,
  UPSTREAM_ACCESS_STORAGE_VERSION,
} from './domain/upstream-access';
export {
  browserUpstreamAccessPersistence,
  createUpstreamAccessPersistence,
  type UpstreamAccessStorageBackend,
} from './infrastructure/upstream-access-storage';
export { useUpstreamAccess } from './ui/use-upstream-access';
