// src/types/models/account.types.ts
export interface LoginHistoryItemModel {
  ip: string; // 登录 IP 地址
  timestamp: string; // 登录时间（ISO 格式）
  audience?: string; // 可选：客户端类型
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE', // 正常
  BANNED = 'BANNED', // 封禁
  DELETED = 'DELETED', // 账号删除
  PENDING = 'PENDING', // 待激活/待审核
  SUSPENDED = 'SUSPENDED', // 暂停使用
  INACTIVE = 'INACTIVE', // 长期不活跃
}

export enum IdentityTypeEnum {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  GUEST = 'GUEST',
  REGISTRANT = 'REGISTRANT',
}

export enum LoginTypeEnum {
  PASSWORD = 'PASSWORD',
  SMS = 'SMS',
  WECHAT = 'WECHAT',
}

/**
 * 第三方登录提供商枚举
 */
export enum ThirdPartyProviderEnum {
  WEAPP = 'WEAPP',
  WECHAT = 'WECHAT',
  QQ = 'QQ',
  GOOGLE = 'GOOGLE',
  GITHUB = 'GITHUB',
}

/**
 * 第三方登录输入可选平台枚举
 * 当前仅开放已完成集成的平台
 */
export enum ThirdPartyLoginProviderEnum {
  WEAPP = 'WEAPP',
}

/**
 * 包含访问组的账户信息
 */
export type AccountWithAccessGroup = {
  id: number;
  loginName: string;
  loginEmail: string;
  accessGroup: IdentityTypeEnum[];
};

export type UserAccountView = {
  id: number;
  loginName: string | null;
  loginEmail: string | null;
  status: AccountStatus;
  identityHint: string | null;
  recentLoginHistory: LoginHistoryItemModel[] | null;
  createdAt: Date;
  updatedAt: Date;
};

export enum AudienceTypeEnum {
  DESKTOP = 'DESKTOP',
  SSTSTEST = 'SSTSTEST',
  SSTSWEB = 'SSTSWEB',
  SSTSWEAPP = 'SSTSWEAPP',
  SJWEB = 'SJWEB',
  SJWEAPP = 'SJWEAPP',
}

/**
 * 就业状态枚举
 * 适用于通用工作人员状态
 */
export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  LEFT = 'LEFT',
}

/**
 * 用户信息（包含昵称）
 */
export type UserWithAccessGroup = {
  id: number;
  nickname: string; // 使用昵称作为用户名
  loginEmail: string;
  accessGroup: string[];
};
