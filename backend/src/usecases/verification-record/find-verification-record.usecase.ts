// src/usecases/verification-record/find-verification-record.usecase.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import {
  VerificationRecordQueryService,
  VerificationRecordView,
} from '@src/modules/verification-record/queries/verification-record.query.service';

/**
 * 查找验证记录用例参数
 */
export interface FindVerificationRecordUsecaseParams {
  /** 验证 token */
  token: string;
  /** 消费者账号 ID，用于权限校验（可选，公开验证时可为 undefined） */
  forAccountId?: number;
  /** 期望的验证记录类型（可选） */
  expectedType?: VerificationRecordType;
  /** 是否忽略 target 限制（用于公开验证） */
  ignoreTargetRestriction?: boolean;
}

/**
 * 查找验证记录用例
 * 专门负责查找可消费的活跃验证记录，包含完整的业务逻辑校验
 */
@Injectable()
export class FindVerificationRecordUsecase {
  constructor(private readonly verificationRecordQueryService: VerificationRecordQueryService) {}

  /**
   * 根据 token 查找可消费的活跃验证记录
   * 内置完整的状态、时效和权限校验
   * @param params 查找参数
   * @returns 可消费的验证记录实体或 null
   */
  async findActiveConsumableByToken(
    params: FindVerificationRecordUsecaseParams,
  ): Promise<VerificationRecordView | null> {
    try {
      const now = new Date();
      const { token, forAccountId, expectedType, ignoreTargetRestriction } = params;

      return await this.verificationRecordQueryService.findActiveConsumableByToken({
        token,
        forAccountId,
        expectedType,
        ignoreTargetRestriction,
        now,
      });
    } catch (error) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.QUERY_FAILED,
        '查询可消费验证记录失败',
        {
          forAccountId: params.forAccountId,
          expectedType: params.expectedType,
          ignoreTargetRestriction: params.ignoreTargetRestriction,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }

  /**
   * 根据记录 ID 查找可消费的活跃验证记录
   * 内置完整的状态、时效和权限校验
   * @param recordId 记录 ID
   * @param forAccountId 消费者账号 ID
   * @returns 可消费的验证记录实体或 null
   */
  async findActiveConsumableById(
    recordId: number,
    forAccountId: number,
  ): Promise<VerificationRecordView | null> {
    try {
      const now = new Date();
      return await this.verificationRecordQueryService.findActiveConsumableById({
        recordId,
        forAccountId,
        now,
      });
    } catch (error) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.QUERY_FAILED,
        '查询可消费验证记录失败',
        {
          recordId,
          forAccountId,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }
}
