// src/app/bootstrap/graphql-runtime.ts

import { configureGraphQLRuntime } from '@/shared/graphql';

export function bootstrapGraphQLRuntime() {
  configureGraphQLRuntime({
    getAccessToken: () => null,
  });
}
