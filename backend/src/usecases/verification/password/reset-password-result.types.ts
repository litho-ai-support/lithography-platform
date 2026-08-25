// src/usecases/verification/password/reset-password-result.types.ts

/**
 * 密码重置成功结果
 * 提供明确的结果结构，避免使用 'newPasswordHash' in result 的判断方式
 */
export interface PasswordResetSuccessResult {
  /**
   * 重置密码的账户 ID
   */
  accountId: number;

  /**
   * 验证记录 ID
   */
  recordId: number;

  /**
   * 操作成功标识
   */
  success: true;
}

/**
 * 密码重置结果类型
 * 统一的密码重置操作结果
 */
export type PasswordResetHandlerResult = PasswordResetSuccessResult;
