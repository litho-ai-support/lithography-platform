// src/app/router/router-bridge.ts

// 供应用级装配（如 app/bootstrap 的全局会话失效处理）在 React 树外发起导航。
// 这不是全局导航事实源（声明式菜单见 src/app/navigation/），只是路由组合根
// （app.tsx）暴露的最小程序化入口。
import type { createBrowserRouter } from 'react-router';

type AppRouter = ReturnType<typeof createBrowserRouter>;

let appRouter: AppRouter | null = null;

export function registerAppRouter(router: AppRouter) {
  appRouter = router;
}

// 树外读取当前站内路径（含 query）的唯一入口：失效链路在会话清理前取此值，
// 用于生成安全 returnTo；只读路由真源，不维护第二份位置状态。
export function getCurrentAppRouterPath(): string | null {
  if (!appRouter) {
    return null;
  }

  const { pathname, search } = appRouter.state.location;

  return `${pathname}${search}`;
}

export function navigateToLogin(targetPath: string = '/login') {
  if (appRouter) {
    void appRouter.navigate(targetPath);
  }
}
