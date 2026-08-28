// src/app/bootstrap/graphql-runtime.ts

import { navigateToLogin } from '@/app/router';

import { getAuthSessionAccessToken, logoutAuthSession } from '@/features/auth-session';

import { configureGraphQLRuntime } from '@/shared/graphql';

import { createGraphQLAuthFailureHandler } from './graphql-auth-failure-handler';

// P0 非目标：不新建 refresh token 接口。未注入 refreshSession，受保护请求遇到 auth 错误时，
// shared/graphql 会直接调用 onAuthFailure（见 ingress auth boundary 契约）。
export function bootstrapGraphQLRuntime() {
  configureGraphQLRuntime({
    getAccessToken: getAuthSessionAccessToken,
    onAuthFailure: createGraphQLAuthFailureHandler({
      logoutAuthSession,
      navigateToLogin,
    }),
  });
}
