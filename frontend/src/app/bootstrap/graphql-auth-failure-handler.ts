// src/app/bootstrap/graphql-auth-failure-handler.ts

export type GraphQLAuthFailureDependencies = {
  getCurrentPath: () => string | null;
  hasAuthSession: () => boolean;
  logoutAuthSession: () => Promise<void>;
  navigateToLogin: (targetPath: string) => void;
  resolveSessionExpiredLoginPath: (currentPath: string | null) => string;
};

// 并发受保护请求可能同时收到 UNAUTHENTICATED。这个应用级 handler
// 负责把一次失效周期收敛为一次清理和一次导航；跳转目标由 auth-session
// 策略合成（固定失效原因 + 安全 returnTo），handler 不接触后端原始错误。
export function createGraphQLAuthFailureHandler({
  getCurrentPath,
  hasAuthSession,
  logoutAuthSession,
  navigateToLogin,
  resolveSessionExpiredLoginPath,
}: GraphQLAuthFailureDependencies) {
  let isHandlingAuthFailure = false;

  return function handleGraphQLAuthFailure() {
    if (isHandlingAuthFailure) {
      return;
    }

    // 只有存在会话时的 UNAUTHENTICATED 才构成失效周期；会话已被清理后的
    // 残余失败请求不再重复清理与跳转，避免重复提示或重复跳转。
    if (!hasAuthSession()) {
      return;
    }

    isHandlingAuthFailure = true;

    // 在清理前取得当前页面路径，保证 returnTo 反映失效前的站内页面。
    const currentPath = getCurrentPath();

    void (async () => {
      try {
        // 复用既有退出链路：先清 Session，后清 Apollo cache。
        await logoutAuthSession();
      } catch {
        // 清理失败不能阻断安全回退；仍然返回登录页。
      } finally {
        // 携带固定失效原因与安全 returnTo 跳转；即使清理失败也必跳转。
        navigateToLogin(resolveSessionExpiredLoginPath(currentPath));
        isHandlingAuthFailure = false;
      }
    })();
  };
}
