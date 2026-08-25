// src/types/auth/login-flow.types.ts

import { AccountStatus, AudienceTypeEnum, IdentityTypeEnum } from '@app-types/models/account.types';

/**
 * ExecuteLoginFlowUsecase 输出类型
 */
export interface BasicLoginResult {
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  accountId: number;
  roleFromHint: IdentityTypeEnum | null;
  accessGroup: IdentityTypeEnum[];
  account: MinimalAccountInfo;
  userInfo: MinimalUserInfo;
}

/**
 * DecideLoginRoleUsecase 输入类型
 */
export interface DecideLoginRoleInput {
  roleFromHint: IdentityTypeEnum | null;
  accessGroup: IdentityTypeEnum[]; // 修复：从 string[] 改为 IdentityTypeEnum[]
  // 当前阶段无 desiredRole，为未来扩展预留
  // desiredRole?: IdentityTypeEnum;
}

/**
 * DecideLoginRoleUsecase 输出类型（内部使用）
 */
export interface DecideLoginRoleOutput {
  finalRole: IdentityTypeEnum;
  reason: 'hint' | 'fallback';
}

/**
 * EnrichLoginWithIdentityUsecase 输入类型
 */
export interface EnrichLoginWithIdentityInput {
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  accountId: number;
  finalRole: IdentityTypeEnum;
  accessGroup: IdentityTypeEnum[]; // 修复：从 string[] 改为 IdentityTypeEnum[]
  account: MinimalAccountInfo;
  userInfo: MinimalUserInfo;
  // 可选开关（默认全部为 true）
  options?: {
    includeIdentity?: boolean;
    includeAccount?: boolean;
    includeUserInfo?: boolean;
  };
}

/**
 * 最终客户端响应体类型
 */
export interface EnrichedLoginResult {
  // 认证信息
  accessToken: string;
  refreshToken: string;
  accountId: number;

  // 角色和身份
  role: IdentityTypeEnum;
  identity: unknown; // 改为 unknown，由适配器层处理具体类型
  accessGroup: IdentityTypeEnum[];

  // 账号和用户信息（改为可选字段）
  account?: MinimalAccountInfo;
  userInfo?: MinimalUserInfo;

  // 警告信息（仅在非理想路径返回）
  warnings?: string[];
}

/**
 * 最小必要账号字段集
 */
export interface MinimalAccountInfo {
  id: number;
  loginName: string | null; // 修复：从 string 改为 string | null
  loginEmail: string | null; // 修复：从 string 改为 string | null
  status: AccountStatus;
  identityHint: IdentityTypeEnum | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 最小必要用户信息字段集
 */
export interface MinimalUserInfo {
  id: number;
  accountId: number;
  nickname: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 审计日志记录类型
 */
export interface LoginRoleDecisionAudit {
  accountId: number;
  audience: AudienceTypeEnum;
  roleFromHint: IdentityTypeEnum | null;
  accessGroupHash: string; // accessGroup 的哈希值，避免敏感信息泄露
  finalRole: IdentityTypeEnum;
  reason: 'hint' | 'fallback';
  ip: string;
  userAgent: string;
  timestamp: Date;
}

/**
 * 警告类型枚举
 */
export enum LoginWarningType {
  ROLE_FALLBACK = 'ROLE_FALLBACK',
  IDENTITY_UNAVAILABLE = 'IDENTITY_UNAVAILABLE',
  IDENTITY_DISABLED = 'IDENTITY_DISABLED',
}

/**
 * DecideLoginRoleUsecase 接口
 */
export interface IDecideLoginRoleUsecase {
  execute(
    input: DecideLoginRoleInput,
    context: {
      accountId: number;
      ip: string;
      userAgent: string;
      audience: AudienceTypeEnum;
    },
  ): DecideLoginRoleOutput; // 移除 Promise 包装
}

/**
 * EnrichLoginWithIdentityUsecase 接口
 */
export interface IEnrichLoginWithIdentityUsecase {
  execute(input: EnrichLoginWithIdentityInput): Promise<EnrichedLoginResult>;
}
