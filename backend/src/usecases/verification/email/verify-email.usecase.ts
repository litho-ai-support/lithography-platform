// src/usecases/verification/email/verify-email.usecase.ts

// TODO: 临时注释掉整个文件内容以避免 ESLint 错误
// 这个文件包含邮箱验证的业务逻辑，需要在后续开发中重新实现

import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationFlowResult } from '../types/consume.types';

/**
 * 邮箱验证用例参数
 */
export interface VerifyEmailUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 验证记录实体 */
  record: unknown;
}

/**
 * 邮箱验证用例
 * 处理邮箱验证的具体业务逻辑
 */
@Injectable()
export class VerifyEmailUsecase {
  /**
   * 执行邮箱验证
   *
   * @param _params 验证参数
   * @returns 验证结果
   */
  execute(_params: VerifyEmailUsecaseParams): Promise<VerificationFlowResult> {
    // TODO: 实现邮箱验证逻辑
    throw new DomainError(
      VERIFICATION_RECORD_ERROR.OPERATION_NOT_SUPPORTED,
      '邮箱验证功能暂未实现',
    );
  }
}
