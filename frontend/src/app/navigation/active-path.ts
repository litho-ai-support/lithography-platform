// src/app/navigation/active-path.ts

import type { NavigationItem } from './types';

// 带边界前缀匹配：/customer/repair-requests 命中其子路由，但不命中 /customer-abc。
// 与 auth-session 的 isAuthSessionRolePathAllowed 同语义；这里只做展示层选中态
// 计算，不参与授权判断。
function isActivePathPrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * 按 pathname 计算菜单选中态：业务子路由命中其菜单项，最长前缀优先
 * （/admin/users 选中「用户管理」而非前缀更短的「文档数据库」；
 * /customer/repair-requests/new 选中「发起申请」而非「我的申请」）。
 * 无业务项命中时回落到首页（角色主页即首页工作台，含根路径重定向后的落点）。
 */
export function resolveActiveNavigationPath(
  pathname: string,
  items: readonly NavigationItem[],
): string | undefined {
  const homeItem = items.find((item) => item.path === '/');
  let bestMatch: NavigationItem | undefined;

  for (const item of items) {
    if (item.path === '/' || !isActivePathPrefix(item.path, pathname)) {
      continue;
    }

    if (!bestMatch || item.path.length > bestMatch.path.length) {
      bestMatch = item;
    }
  }

  return (bestMatch ?? homeItem)?.path;
}
