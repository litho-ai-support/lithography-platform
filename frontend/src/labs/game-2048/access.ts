// src/labs/game-2048/access.ts

import type { AppEnv } from '@/shared/env';

export function canAccessGame2048Lab(env: AppEnv) {
  return env === 'dev' || env === 'test';
}
