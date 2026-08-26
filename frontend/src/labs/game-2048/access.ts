// src/labs/game-2048/access.ts

import { type AppEnv, isDevOrTestEnv } from '@/shared/env';

export function canAccessGame2048Lab(env: AppEnv) {
  return isDevOrTestEnv(env);
}
