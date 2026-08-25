// 文件位置：src/core/account/policy/role-access.policy.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';

export const roleHierarchy: Readonly<Record<IdentityTypeEnum, ReadonlyArray<IdentityTypeEnum>>> = {
  ADMIN: [IdentityTypeEnum.STAFF, IdentityTypeEnum.GUEST],
  STAFF: [IdentityTypeEnum.GUEST],
  GUEST: [],
  REGISTRANT: [],
};

export function expandRoles(roles: ReadonlyArray<string | IdentityTypeEnum>): IdentityTypeEnum[] {
  const normalized = roles
    .map((r) => String(r).toUpperCase())
    .filter((r): r is IdentityTypeEnum =>
      (Object.values(IdentityTypeEnum) as string[]).includes(r),
    );

  const result = new Set<IdentityTypeEnum>();
  const dfs = (role: IdentityTypeEnum) => {
    if (result.has(role)) return;
    result.add(role);
    (roleHierarchy[role] || []).forEach(dfs);
  };

  normalized.forEach((r) => dfs(r));
  return Array.from(result);
}

export function hasRole(
  roles: ReadonlyArray<string | IdentityTypeEnum>,
  target: IdentityTypeEnum,
): boolean {
  return expandRoles(roles).includes(target);
}
