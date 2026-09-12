// src/features/admin-user-management/application/admin-user-management-policy.ts

/**
 *
 * - 单一角色、可写角色、可写状态、SUPER_ADMIN 只读等展示判断只在这里实现，
 *   ui 层不得再各自派生第二份只读/可写语义；
 * - 前端策略只控制展示，后端（Usecase 精确授权 + 转换矩阵）仍是权限与业务真源；
 *   前端隐藏入口不构成安全边界。
 */

import type {
  AdminUserRole,
  AdminUserRow,
  AdminUserStatusFilter,
  AdminUserWritableRole,
} from './admin-user-management.types';

/** 列表角色筛选是查看值域（含 SUPER_ADMIN），与可写角色是两个口径 */
export const ADMIN_USER_ROLE_FILTER_OPTIONS: readonly AdminUserRole[] = [
  'SUPER_ADMIN',
  'ENGINEER',
  'CUSTOMER',
];

/** 管理员可写角色值域：普通用户写入只接受单值 ENGINEER / CUSTOMER */
export const ADMIN_USER_WRITABLE_ROLES: readonly AdminUserWritableRole[] = ['ENGINEER', 'CUSTOMER'];

/** 状态筛选与启停写入口都只开放 ACTIVE / INACTIVE */
export const ADMIN_USER_STATUS_FILTER_OPTIONS: readonly AdminUserStatusFilter[] = [
  'ACTIVE',
  'INACTIVE',
];

/**
 * 创建表单的登录名展示校验口径：与管理员创建入口的后端协议校验一致
 * （4~30 个字符、只允许英文字母/数字/下划线/短横线）。
 * 后端 `core/account/policy/login-name.policy.ts` 是格式与唯一性的唯一真源；
 * 这里的常量只服务表单即时反馈，不作为安全校验。
 */
export const ADMIN_USER_LOGIN_NAME_MIN_LENGTH = 4;
export const ADMIN_USER_LOGIN_NAME_MAX_LENGTH = 30;
export const ADMIN_USER_LOGIN_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const ADMIN_USER_ROW_READ_ONLY_REASON = 'SUPER_ADMIN 账号为只读，不可编辑、停用或重置密码。';

/**
 * 展示标签统一口径：panel 与各弹窗共用，不各自维护第二份映射。
 */
export const ADMIN_USER_ROLE_LABELS: Record<AdminUserRole, string> = {
  SUPER_ADMIN: '超级管理员',
  ENGINEER: '工程师',
  CUSTOMER: '客户',
};

export const ADMIN_USER_STATUS_LABELS: Record<AdminUserStatusFilter, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
};

/**
 * 昵称展示长度上限：真源为基线迁移的 `base_user_info.nickname varchar(50)`
 * （基线不可修改）；后端协议层未设昵称长度约束，此常量只服务表单即时反馈。
 */
export const ADMIN_USER_NICKNAME_MAX_LENGTH = 50;

export function isAdminUserRowReadOnly(row: AdminUserRow): boolean {
  return row.role === 'SUPER_ADMIN';
}

/**
 * 行状态是否在可写值域（ACTIVE / INACTIVE）内。
 * 页面只识别这两态并开放启停/重置入口；其余状态（防御性兜底）一律不可写，仅展示原值。
 */
export function isAdminUserStatusWritable(status: string): status is AdminUserStatusFilter {
  return status === 'ACTIVE' || status === 'INACTIVE';
}

export function canEditAdminUserProfile(row: AdminUserRow): boolean {
  return !isAdminUserRowReadOnly(row);
}

/** 启停要求目标行状态在 ACTIVE / INACTIVE 两态内（与后端转换矩阵的展示镜像一致） */
export function canToggleAdminUserStatus(row: AdminUserRow): boolean {
  return !isAdminUserRowReadOnly(row) && isAdminUserStatusWritable(row.status);
}

/** 密码重置与启停同边界：仅可写状态值域内的普通账号开放入口（展示镜像，后端是矩阵真源） */
export function canResetAdminUserPassword(row: AdminUserRow): boolean {
  return !isAdminUserRowReadOnly(row) && isAdminUserStatusWritable(row.status);
}

export function isKnownAdminUserRole(value: unknown): value is AdminUserRole {
  return value === 'SUPER_ADMIN' || value === 'ENGINEER' || value === 'CUSTOMER';
}

export type AdminUserCreateCredentialIssue = 'login-identifier-missing' | 'login-name-invalid';

/**
 * 且提供了登录名时校验其格式。返回 null 表示通过。
 */
export function findAdminUserCreateCredentialIssue(
  loginName: string,
  loginEmail: string,
): AdminUserCreateCredentialIssue | null {
  const trimmedLoginName = loginName.trim();
  const trimmedLoginEmail = loginEmail.trim();

  if (!trimmedLoginName && !trimmedLoginEmail) {
    return 'login-identifier-missing';
  }

  if (
    trimmedLoginName &&
    (trimmedLoginName.length < ADMIN_USER_LOGIN_NAME_MIN_LENGTH ||
      trimmedLoginName.length > ADMIN_USER_LOGIN_NAME_MAX_LENGTH ||
      !ADMIN_USER_LOGIN_NAME_PATTERN.test(trimmedLoginName))
  ) {
    return 'login-name-invalid';
  }

  return null;
}
