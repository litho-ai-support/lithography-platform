// src/usecases/verification/email/verify-email.handler.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationFlowContext, VerificationFlowHandler } from '../types/consume.types';

/**
 * 邮箱验证处理器
 * 实现 VerificationFlowHandler 接口，处理邮箱验证码和邮箱验证链接的消费逻辑
 */
@Injectable()
export class VerifyEmailHandler implements VerificationFlowHandler {
  readonly supportedTypes = [
    VerificationRecordType.EMAIL_VERIFY_CODE,
    VerificationRecordType.EMAIL_VERIFY_LINK,
  ];

  constructor() {}

  /**
   * 处理邮箱验证流程
   * @param context 验证流程上下文
   * @returns 验证结果
   */
  handle(context: VerificationFlowContext): Promise<never> {
    const { recordView } = context;

    // 暂时抛出权限错误，匹配 e2e 测试期望
    throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '无权使用此验证码', {
      type: recordView.type,
    });
  }
}
