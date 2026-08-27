// src/features/auth-session/infrastructure/auth-return-to-url.ts

// 认证链路 URL 参数适配的唯一收口：returnTo 读取、登录跳转 query 编码、
// 请求目标拼接与 pathname 解析都属于技术格式适配，见 docs/infrastructure-rules.md。
// application 只决定是否接受目标路径以及跳往哪里。
export const AUTH_RETURN_TO_PARAM_KEY = 'returnTo';

export function readAuthReturnToParam(searchParams: URLSearchParams): string | null {
  return searchParams.get(AUTH_RETURN_TO_PARAM_KEY);
}

export function readAuthReturnToFromRequest(request: Request): string | null {
  return readAuthReturnToParam(new URL(request.url).searchParams);
}

export function composeProtectedRequestTarget(request: Request): string {
  const requestUrl = new URL(request.url);

  return requestUrl.pathname + requestUrl.search;
}

export function composeLoginRedirectPath(requestedPath: string): string {
  return `/login?${AUTH_RETURN_TO_PARAM_KEY}=${encodeURIComponent(requestedPath)}`;
}

export function extractUrlPathname(value: string): string {
  try {
    return new URL(value, 'https://lithography.local').pathname;
  } catch {
    return value;
  }
}
