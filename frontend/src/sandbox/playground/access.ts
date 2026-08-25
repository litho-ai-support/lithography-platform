// src/sandbox/playground/access.ts

import type { AppEnv } from '@/shared/env';

export function canAccessSandboxPlayground(env: AppEnv) {
  return env === 'dev' || env === 'test';
}
