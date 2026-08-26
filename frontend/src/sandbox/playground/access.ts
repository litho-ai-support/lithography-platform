// src/sandbox/playground/access.ts

import { type AppEnv, isDevOrTestEnv } from '@/shared/env';

export function canAccessSandboxPlayground(env: AppEnv) {
  return isDevOrTestEnv(env);
}
