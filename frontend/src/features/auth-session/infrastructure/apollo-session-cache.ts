// src/features/auth-session/infrastructure/apollo-session-cache.ts

import { clearGraphQLClientCache } from '@/shared/graphql';

import type { AuthSessionCacheClearer } from '../application/logout-auth-session';

export function createApolloAuthSessionCache(): AuthSessionCacheClearer {
  return {
    clearCache: clearGraphQLClientCache,
  };
}

export const apolloAuthSessionCache = createApolloAuthSessionCache();
