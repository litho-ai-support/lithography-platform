// src/app/bootstrap/graphql-runtime.ts

import { navigateToLogin } from '@/app/router';

import { getAuthSessionAccessToken, logoutAuthSession } from '@/features/auth-session';

import { configureGraphQLRuntime } from '@/shared/graphql';

// 并发受保护请求可能同时收到 UNAUTHENTICATED，失效处理必须幂等，见
// frontend/docs/project-convention/graphql-ingress-auth-boundary.md。
let isHandlingAuthFailure = false;

function handleGraphQLAuthFailure() {
  if (isHandlingAuthFailure) {
    return;
  }

  isHandlingAuthFailure = true;

  void (async () => {
    try {
      await logoutAuthSession();
      navigateToLogin();
    } catch {
      // 失效处理不能因清理失败而静默断开；导航兜底仍要回到登录页。
      navigateToLogin();
    } finally {
      isHandlingAuthFailure = false;
    }
  })();
}

// P0 非目标：不新建 refresh token 接口。未注入 refreshSession，受保护请求遇到 auth 错误时，
// shared/graphql 会直接调用 onAuthFailure（见 ingress auth boundary 契约）。
export function bootstrapGraphQLRuntime() {
  configureGraphQLRuntime({
    getAccessToken: getAuthSessionAccessToken,
    onAuthFailure: handleGraphQLAuthFailure,
  });
}
