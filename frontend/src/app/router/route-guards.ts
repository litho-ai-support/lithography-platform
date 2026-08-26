// src/app/router/route-guards.ts

// 路由守卫与登录后跳转的窄接线：只读取唯一会话事实源并复用
// features/auth-session 的既有策略，不维护第二份会话状态。
// URL 参数解析委托 auth-session 的 URL adapter，守卫只决定何时放行或跳转。
// 拆出独立模块是为了让应用装配层可以被窄范围测试覆盖。
import { redirect } from 'react-router';

import {
  composeProtectedRequestTarget,
  getCurrentAuthSession,
  readAuthReturnToFromRequest,
  resolveLoginRouteRedirect,
  resolveProtectedRouteRedirect,
} from '@/features/auth-session';

type RouteLoaderArgs = {
  request: Request;
};

export function loginLoader({ request }: RouteLoaderArgs) {
  const loginRedirectPath = resolveLoginRouteRedirect(
    getCurrentAuthSession(),
    readAuthReturnToFromRequest(request),
  );

  if (loginRedirectPath) {
    return redirect(loginRedirectPath);
  }

  return null;
}

export function protectedRouteLoader({ request }: RouteLoaderArgs) {
  const protectedRedirectPath = resolveProtectedRouteRedirect(
    getCurrentAuthSession(),
    composeProtectedRequestTarget(request),
  );

  if (protectedRedirectPath) {
    return redirect(protectedRedirectPath);
  }

  return null;
}
