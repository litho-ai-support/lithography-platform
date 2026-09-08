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
   * 允许看到该入口的角色（按会话活动角色过滤）；
   * 缺省表示不按角色限制（匿名或任意角色均可见）。
   */
  roles?: readonly AuthSessionRole[];
  tags: readonly string[];
};
