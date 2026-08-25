// src/usecases/verification/types/consume.types.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { VerificationRecordType } from '@app-types/models/verification-record.types';
import type { VerificationRecordView } from '@src/modules/verification-record/verification-record.types';
import { PasswordResetHandlerResult } from '@src/usecases/verification/password/reset-password-result.types';

/**
 * 密码重置载荷
 */
export interface ResetPasswordPayload {
  /** 新密码 */
  newPassword: string;
}

/**
 * 验证流程输入参数
 */
export interface ConsumeVerificationFlowParams {
  /** 验证 token */
  token: string;
  /** 消费者账号 ID（可选，某些类型允许匿名消费） */
  consumedByAccountId?: number;
  /** 期望的验证记录类型（可选但强烈建议提供） */
  expectedType?: VerificationRecordType;
  /** 客户端类型（可选，用于上下文匹配） */
  audience?: AudienceTypeEnum | null;
  /** 邮箱地址（可选，用于上下文匹配） */
  email?: string;
  /** 手机号码（可选，用于上下文匹配） */
  phone?: string;
  /** 可选的事务上下文 */
  transactionContext?: PersistenceTransactionContext;
  /** 密码重置载荷（仅用于密码重置类型） */
  resetPassword?: ResetPasswordPayload;
}

/**
 * 验证流程上下文
 */
export interface VerificationFlowContext {
  /** 验证记录视图 */
  recordView: VerificationRecordView;
  /** 消费者账号 ID */
  consumedByAccountId?: number;
  /** 事务上下文 */
  transactionContext: PersistenceTransactionContext;
  /** 密码重置载荷（仅用于密码重置类型） */
  resetPassword?: ResetPasswordPayload;
}

// TODO: 临时注释其他验证类型，专注于密码重置功能
// /**
//  * 邮箱验证结果
//  */
// export interface EmailVerificationResult {
//   /** 验证记录视图 */
//   record: VerificationRecordView;
//   /** 验证的邮箱地址 */
//   email: string;
//   /** 关联的账号 ID（如果有） */
//   accountId?: number;
// }

// TODO: 临时注释其他验证类型，专注于密码重置功能
// /**
//  * 魔法链接登录结果
//  */
// export interface MagicLinkLoginResult {
//   /** 验证记录视图 */
//   record: VerificationRecordView;
//   /** 登录的账号 ID */
//   accountId: number;
//   /** JWT token */
//   accessToken: string;
//   /** 刷新 token */
//   refreshToken?: string;
// }

// /**
//  * 短信验证结果
//  */
// export interface SmsVerificationResult {
//   /** 验证记录视图 */
//   record: VerificationRecordView;
//   /** 验证的手机号 */
//   phone: string;
//   /** 关联的账号 ID（如果有） */
//   accountId?: number;
// }

// /**
//  * 第三方绑定结果
//  */
// export interface ThirdPartyBindResult {
//   /** 验证记录视图 */
//   record: VerificationRecordView;
//   /** 绑定的账号 ID */
//   accountId: number;
//   /** 第三方平台类型 */
//   platform: 'weapp' | 'wechat' | 'alipay';
//   /** 第三方用户 ID */
//   thirdPartyUserId: string;
// }

/**
 * 验证流程结果联合类型
 * 支持多种验证流程的结果类型
 */
export type VerificationFlowResult = PasswordResetHandlerResult;
// TODO: 后续可扩展更多类型
// export type VerificationFlowResult =
//   | EmailVerificationResult
//   | PasswordResetResult
//   | MagicLinkLoginResult
//   | InviteAcceptResult
//   | SmsVerificationResult
//   | ThirdPartyBindResult;

/**
 * 验证流程处理器接口
 */
export interface VerificationFlowHandler<
  T extends VerificationFlowResult = VerificationFlowResult,
> {
  /**
   * 支持的验证记录类型
   */
  readonly supportedTypes: VerificationRecordType[];

  /**
   * 处理验证流程
   * @param context 验证流程上下文
   * @returns 处理结果
   */
  handle(context: VerificationFlowContext): Promise<T>;
}
