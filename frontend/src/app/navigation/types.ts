// src/app/navigation/types.ts

import type { AuthSessionRole } from '@/features/auth-session';

export type NavigationItemKind = 'stable' | 'labs' | 'sandbox';

export type NavigationItem = {
  description: string;
  id: string;
  kind: NavigationItemKind;
  label: string;
  path: string;
  /**
   * 可选角色白名单：声明该项仅对哪些当前活动角色展示，并按当前会话 activeRole 做展示过滤。
   * 缺省表示不按角色限制（匿名或任意角色均可见）；只做展示过滤，不替代路由守卫。
   * 类型直接引用 auth-session 的 AuthSessionRole，角色值漂移在编译期报错，
   * 不在此建立第二份角色映射。
   */
  roles?: readonly AuthSessionRole[];
  tags: readonly string[];
};
