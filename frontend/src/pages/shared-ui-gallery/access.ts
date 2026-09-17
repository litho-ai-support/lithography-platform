// src/pages/shared-ui-gallery/access.ts

import type { AppEnv } from '@/shared/env';

// 组件组合页与 labs/sandbox 同策略：仅 dev/test 环境可达（路由 loader 使用）。
export function canAccessSharedUiGallery(env: AppEnv) {
  return env === 'dev' || env === 'test';
}
