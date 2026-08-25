// src/usecases/verification/magic-link/magic-link-login.usecase.ts
// src/usecases/verification/magic-link-login.usecase.ts

import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationFlowResult } from '../types/consume.types';

/**
 * 魔法链接登录用例参数
 */
export interface MagicLinkLoginUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 其他参数 */
  [key: string]: unknown;
}

/**
 * 魔法链接登录用例
 *
 * 负责处理魔法链接登录流程，包括：
 * - 验证链接的有效性
 * - 检查用户权限
 * - 生成登录凭证
 * - 更新登录状态
 */
@Injectable()
export class MagicLinkLoginUsecase {
  /**
   * 执行魔法链接登录流程
   *
   * @param params 用例参数
   * @returns 登录结果
   */
  execute(_params: MagicLinkLoginUsecaseParams): Promise<VerificationFlowResult> {
    // TODO: 实现魔法链接登录逻辑
    throw new DomainError(
      VERIFICATION_RECORD_ERROR.OPERATION_NOT_SUPPORTED,
      '魔法链接登录功能暂未实现',
    );
  }
}
