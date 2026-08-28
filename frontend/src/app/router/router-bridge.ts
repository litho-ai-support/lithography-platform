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

export function navigateToLogin() {
  if (appRouter) {
    void appRouter.navigate('/login');
  }
}
