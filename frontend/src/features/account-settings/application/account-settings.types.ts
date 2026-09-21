// src/features/account-settings/application/account-settings.types.ts

/**
 * 账号设置 feature 的内部模型（防腐层输出面）。
 * application 与 ui 一律消费本文件类型，不接触 infrastructure 的原始 GraphQL DTO。
 * 枚举成员与后端契约对齐（IdentityTypeEnum / AccountStatus），未知值由 mapper 失败关闭。
 */

export const ACCOUNT_SETTINGS_ROLES = ['SUPER_ADMIN', 'ENGINEER', 'CUSTOMER'] as const;

export type AccountSettingsRole = (typeof ACCOUNT_SETTINGS_ROLES)[number];

export const ACCOUNT_SETTINGS_STATUSES = [
  'ACTIVE',
  'BANNED',
  'DELETED',
  'PENDING',
  'SUSPENDED',
  'INACTIVE',
] as const;

export type AccountSettingsStatus = (typeof ACCOUNT_SETTINGS_STATUSES)[number];

/** 角色展示名映射：仅展示用途；角色事实以后端返回的 role 为准 */
export const ACCOUNT_SETTINGS_ROLE_LABELS: Record<AccountSettingsRole, string> = {
  CUSTOMER: '客户',
  ENGINEER: '工程师',
  SUPER_ADMIN: '管理员',
};

/** 状态展示名映射（只读展示） */
export const ACCOUNT_SETTINGS_STATUS_LABELS: Record<AccountSettingsStatus, string> = {
  ACTIVE: '正常',
  BANNED: '已封禁',
  DELETED: '已删除',
  INACTIVE: '已停用',
  PENDING: '待激活',
  SUSPENDED: '已暂停',
};

/** 当前账号设置的稳定读视图（与后端 myAccountSettings 契约同形，不含 accountId） */
export type AccountSettingsView = {
  companyName: string | null;
  contactEmail: string | null;
  loginEmail: string | null;
  loginName: string | null;
  nickname: string;
  phone: string | null;
  role: AccountSettingsRole;
  status: AccountSettingsStatus;
  /** 后端 Date 标量序列化为 ISO 字符串；展示层经 shared formatDateTimeText 兜底 */
  updatedAt: string;
};

/**
 * 资料更新的三态草稿（与后端 updateMyAccountSettings 的三态语义一一对应）：
 * - `undefined`：不修改该字段（序列化时省略该键）；
 * - `null`：清空该字段（仅限允许清空的字段，`nickname` 无 `null` 成员）；
 * - `string`：设置该字段（已 trim 的非空值）。
 */
export type AccountSettingsProfileDraft = {
  companyName?: string | null;
  contactEmail?: string | null;
  loginEmail?: string | null;
  loginName?: string | null;
  nickname?: string;
  phone?: string | null;
};

export type AccountSettingsProfileFailureReason =
  | 'duplicate-credential'
  | 'forbidden'
  | 'invalid-input'
  | 'update-failed';

export type AccountSettingsProfileUpdateResult =
  | { isUpdated: boolean; ok: true; settings: AccountSettingsView }
  | { message: string; ok: false; reason: AccountSettingsProfileFailureReason };

export type ChangeMyPasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ChangeMyPasswordFailureReason = 'forbidden' | 'invalid-input' | 'update-failed';

/**
 * 改密请求发起时采样的会话身份（不含 Token；与 auth-session 的窄身份同构，
 * feature 之间禁止互相引用，故在本 feature 内独立声明）。epoch 为会话代次：
 * 同一账号退出后重新登录会得到不同代次。null 表示装配层未接入采样。
 */
export type ChangePasswordSessionIdentity = {
  accountId: number;
  epoch: number;
};

/**
 * adapter 归一后的改密业务结果（尚未附加发起时会话身份；身份采样发生在
 * useAccountSettings 的请求发起前，见 updatePassword）。
 */
export type ChangeMyPasswordOutcome =
  | { notice: string; ok: true }
  | { message: string; ok: false; reason: ChangeMyPasswordFailureReason };

export type ChangeMyPasswordResult =
  | { initiatedIdentity: ChangePasswordSessionIdentity | null; notice: string; ok: true }
  | { message: string; ok: false; reason: ChangeMyPasswordFailureReason };
