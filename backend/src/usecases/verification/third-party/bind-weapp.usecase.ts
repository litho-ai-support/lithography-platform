// src/usecases/verification/third-party/bind-weapp.usecase.ts
// src/usecases/verification/bind-weapp.usecase.ts

import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationFlowResult } from '../types/consume.types';

/**
 * 微信小程序绑定用例参数
 */
export interface BindWeappUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 其他参数 */
  [key: string]: unknown;
}

/**
 * 微信小程序绑定用例
 *
 * 负责处理微信小程序绑定流程，包括：
 * - 验证绑定请求的有效性
 * - 检查用户权限
 * - 建立第三方账号关联
 * - 更新绑定状态
 */
@Injectable()
export class BindWeappUsecase {
  /**
   * 执行微信小程序绑定流程
   *
   * @param params 用例参数
   * @returns 绑定结果
   */
  execute(_params: BindWeappUsecaseParams): Promise<VerificationFlowResult> {
    // TODO: 实现微信小程序绑定逻辑
    throw new DomainError(
      VERIFICATION_RECORD_ERROR.OPERATION_NOT_SUPPORTED,
      '微信小程序绑定功能暂未实现',
    );
  }
}
