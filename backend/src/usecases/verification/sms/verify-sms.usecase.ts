// src/usecases/verification/sms/verify-sms.usecase.ts
// src/usecases/verification/verify-sms.usecase.ts

import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationFlowResult } from '../types/consume.types';

/**
 * 短信验证用例参数
 */
export interface VerifySmsUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 其他参数 */
  [key: string]: unknown;
}

/**
 * 短信验证用例
 *
 * 负责处理短信验证流程，包括：
 * - 验证短信验证码的有效性
 * - 检查用户权限
 * - 验证手机号码
 * - 更新验证状态
 */
@Injectable()
export class VerifySmsUsecase {
  /**
   * 执行短信验证流程
   *
   * @param params 用例参数
   * @returns 验证结果
   */
  execute(_params: VerifySmsUsecaseParams): Promise<VerificationFlowResult> {
    // TODO: 实现短信验证逻辑
    throw new DomainError(
      VERIFICATION_RECORD_ERROR.OPERATION_NOT_SUPPORTED,
      '短信验证功能暂未实现',
    );
  }
}
