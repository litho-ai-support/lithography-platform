// src/app/bootstrap/graphql-auth-failure-handler.ts

export type GraphQLAuthFailureDependencies = {
  logoutAuthSession: () => Promise<void>;
  navigateToLogin: () => void;
};

// 并发受保护请求可能同时收到 UNAUTHENTICATED。这个应用级 handler
// 负责把一次失效周期收敛为一次清理和一次导航。
export function createGraphQLAuthFailureHandler({
  logoutAuthSession,
  navigateToLogin,
}: GraphQLAuthFailureDependencies) {
  let isHandlingAuthFailure = false;

  return function handleGraphQLAuthFailure() {
    if (isHandlingAuthFailure) {
      return;
    }

    isHandlingAuthFailure = true;

    void (async () => {
      try {
        await logoutAuthSession();
        navigateToLogin();
      } catch {
        // 清理失败不能阻断安全回退；仍然返回登录页。
        navigateToLogin();
      } finally {
        isHandlingAuthFailure = false;
      }
    })();
  };
}
