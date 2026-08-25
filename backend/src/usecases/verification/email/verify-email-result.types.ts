// src/usecases/verification/email/verify-email-result.types.ts

/**
 * 邮箱验证处理器结果类型
 */
export interface VerifyEmailHandlerResult {
  success: boolean;
  message: string;
  data: {
    type: 'EMAIL_VERIFY_CODE' | 'EMAIL_VERIFY_LINK';
    recordId: string;
    consumedByAccountId: string;
    verifiedEmail: string;
  };
}
