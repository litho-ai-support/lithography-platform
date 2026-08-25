// src/usecases/verification-record/consume-verification-record.usecase.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import {
  DomainError,
  PERMISSION_ERROR,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import {
  VerificationRecordDetailView,
  VerificationRecordQueryService,
  VerificationRecordView,
} from '@src/modules/verification-record/queries/verification-record.query.service';
import {
  VerificationRecordService,
  type VerificationRecordConsumeTargetConstraint,
  type VerificationRecordValidationSnapshot,
} from '@src/modules/verification-record/verification-record.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';

/**
 * 通过 token 消费验证记录用例参数
 */
export interface ConsumeByTokenUsecaseParams {
  /** 验证 token */
  token: string;
  /** 消费者账号 ID（可选，某些类型允许匿名消费） */
  consumedByAccountId?: number;
  /** 期望的验证记录类型（可选但强烈建议提供） */
  expectedType?: VerificationRecordType;
  /** 主体类型（可选，用于记录消费后的主体信息） */
  subjectType?: SubjectType;
  /** 主体 ID（可选，用于记录消费后的主体信息） */
  subjectId?: number;
  /** 可选的事务上下文 */
  transactionContext?: PersistenceTransactionContext;
}

/**
 * 通过 ID 消费验证记录用例参数
 */
export interface ConsumeByIdUsecaseParams {
  /** 记录 ID */
  recordId: number;
  /** 消费者账号 ID（可选，某些类型允许匿名消费） */
  consumedByAccountId?: number;
  /** 期望的验证记录类型（可选但强烈建议提供） */
  expectedType?: VerificationRecordType;
  /** 主体类型（可选，用于记录消费后的主体信息） */
  subjectType?: SubjectType;
  /** 主体 ID（可选，用于记录消费后的主体信息） */
  subjectId?: number;
  /** 可选的事务上下文 */
  transactionContext?: PersistenceTransactionContext;
}

/**
 * 撤销验证记录用例参数
 */
export interface RevokeRecordUsecaseParams {
  /** 记录 ID */
  recordId: number;
  /** 可选的事务上下文 */
  transactionContext?: PersistenceTransactionContext;
}

/**
 * 验证失败原因检查器
 */
interface FailureChecker {
  check: (
    record: VerificationRecordValidationSnapshot,
    context: ValidationContext,
  ) => DomainError | null;
  priority: number;
}

/**
 * 验证上下文
 */
interface ValidationContext {
  expectedType?: VerificationRecordType;
  consumedByAccountId?: number;
  subjectType?: SubjectType;
  subjectId?: number;
  now: Date;
}

/**
 * 消费验证记录用例
 * 负责验证记录的消费操作，包括正常消费和撤销消费
 */
@Injectable()
export class ConsumeVerificationRecordUsecase {
  /**
   * 验证失败检查器列表，按优先级排序
   */
  private readonly failureCheckers: FailureChecker[] = [
    {
      priority: 1,
      check: (record, context) =>
        context.expectedType && record.type !== context.expectedType
          ? new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '验证码类型不匹配')
          : null,
    },
    {
      priority: 2,
      check: (record, context) => {
        // PASSWORD_RESET 类型允许匿名消费，即使有 targetAccountId 限制
        if (record.type === VerificationRecordType.PASSWORD_RESET) {
          return null;
        }

        // 如果记录有 targetAccountId 限制，但消费者未提供账号 ID，则拒绝
        if (record.targetAccountId && !context.consumedByAccountId) {
          return new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '此验证码需要登录后使用');
        }
        // 如果记录有 targetAccountId 限制，且消费者账号不匹配，则拒绝
        if (
          record.targetAccountId &&
          context.consumedByAccountId &&
          record.targetAccountId !== context.consumedByAccountId
        ) {
          return new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '您无权使用此验证码', {
            targetAccountId: record.targetAccountId,
            consumedByAccountId: context.consumedByAccountId,
          });
        }
        return null;
      },
    },
    {
      priority: 3,
      check: (record) =>
        record.status !== VerificationRecordStatus.ACTIVE
          ? new DomainError(
              VERIFICATION_RECORD_ERROR.RECORD_ALREADY_CONSUMED,
              '验证码已被使用或已失效',
            )
          : null,
    },
    {
      priority: 4,
      check: (record, context) => {
        // 检查是否已过期（包含 180 秒宽限期）
        const gracePeriodMs = 180 * 1000; // 180 秒宽限期
        const expiresAtWithGracePeriod = new Date(record.expiresAt.getTime() + gracePeriodMs);

        return expiresAtWithGracePeriod <= context.now
          ? new DomainError(VERIFICATION_RECORD_ERROR.RECORD_EXPIRED, '验证码已过期，请重新获取')
          : null;
      },
    },
    {
      priority: 5,
      check: (record, context) =>
        record.notBefore && record.notBefore > context.now
          ? new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_ACTIVE_YET, '验证码尚未到使用时间')
          : null,
    },
  ];

  constructor(
    private readonly verificationRecordService: VerificationRecordService,
    private readonly verificationRecordQueryService: VerificationRecordQueryService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  /**
   * 通过 token 消费验证记录
   * @param params 消费参数
   * @returns 更新后的验证记录实体
   */
  async consumeByToken(params: ConsumeByTokenUsecaseParams): Promise<VerificationRecordView> {
    const { token, consumedByAccountId, expectedType, subjectType, subjectId, transactionContext } =
      params;
    const tokenFp = this.verificationRecordService.generateTokenFingerprint(token);

    return this.executeConsumption({
      where: { tokenFp },
      notFoundError: VERIFICATION_RECORD_ERROR.INVALID_TOKEN,
      notFoundMessage: '无效的验证 token',
      context: { consumedByAccountId, expectedType, subjectType, subjectId, now: new Date() },
      errorDetails: { consumedByAccountId, expectedType },
      transactionContext,
    });
  }

  /**
   * 通过记录 ID 消费验证记录
   * @param params 消费参数
   * @returns 更新后的验证记录实体
   */
  async consumeById(params: ConsumeByIdUsecaseParams): Promise<VerificationRecordView> {
    const {
      recordId,
      consumedByAccountId,
      expectedType,
      subjectType,
      subjectId,
      transactionContext,
    } = params;

    return this.executeConsumption({
      where: { id: recordId },
      notFoundError: VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND,
      notFoundMessage: '验证记录不存在或已失效',
      context: { consumedByAccountId, expectedType, subjectType, subjectId, now: new Date() },
      errorDetails: { recordId, consumedByAccountId, expectedType },
      transactionContext,
    });
  }

  /**
   * 在事务中通过 token 消费验证记录
   * @param token 验证 token
   * @param consumedByAccountId 消费者账号 ID（可选）
   * @param expectedType 期望的验证记录类型（可选但强烈建议提供）
   * @returns 更新后的验证记录实体
   */
  async consumeByTokenInTransaction(
    token: string,
    consumedByAccountId?: number,
    expectedType?: VerificationRecordType,
  ): Promise<VerificationRecordView> {
    return this.transactionRunner.run(async (transactionContext) => {
      return this.consumeByToken({
        token,
        consumedByAccountId,
        expectedType,
        transactionContext,
      });
    });
  }

  /**
   * 在事务中通过 ID 消费验证记录
   * @param recordId 记录 ID
   * @param consumedByAccountId 消费者账号 ID（可选）
   * @returns 更新后的验证记录实体
   */
  async consumeByIdInTransaction(
    recordId: number,
    consumedByAccountId?: number,
  ): Promise<VerificationRecordView> {
    return this.transactionRunner.run(async (transactionContext) => {
      return this.consumeById({ recordId, consumedByAccountId, transactionContext });
    });
  }

  /**
   * 撤销验证记录
   * @param params 撤销参数
   * @returns 更新后的验证记录实体
   */
  async revokeRecord(params: RevokeRecordUsecaseParams): Promise<VerificationRecordDetailView> {
    const { recordId, transactionContext } = params;

    const run = async (
      activeTransactionContext: PersistenceTransactionContext,
    ): Promise<VerificationRecordDetailView> => {
      try {
        const { affected, updatedRecord, currentRecord } =
          await this.verificationRecordService.revokeRecord({
            recordId,
            transactionContext: activeTransactionContext,
          });

        if (affected === 0) {
          if (!currentRecord) {
            throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
          }
          throw new DomainError(
            VERIFICATION_RECORD_ERROR.STATUS_NOT_ALLOWED,
            '验证记录状态不允许撤销操作',
            { recordId, currentStatus: currentRecord.status },
          );
        }

        if (!updatedRecord) {
          throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
        }

        return this.verificationRecordQueryService.toDetailView(updatedRecord);
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }

        throw new DomainError(
          VERIFICATION_RECORD_ERROR.REVOCATION_FAILED,
          '撤销验证记录失败',
          { recordId, error: error instanceof Error ? error.message : '未知错误' },
          error,
        );
      }
    };

    return transactionContext
      ? await run(transactionContext)
      : await this.transactionRunner.run(run);
  }

  /**
   * 在事务中撤销验证记录
   * @param recordId 记录 ID
   * @returns 更新后的验证记录实体
   */
  async revokeRecordInTransaction(recordId: number): Promise<VerificationRecordDetailView> {
    return this.revokeRecord({ recordId });
  }

  /**
   * 执行消费操作的通用方法
   */
  private async executeConsumption(options: {
    where: { id?: number; tokenFp?: Buffer };
    notFoundError: string;
    notFoundMessage: string;
    context: ValidationContext;
    errorDetails: Record<string, unknown>;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<VerificationRecordView> {
    const { where, notFoundError, notFoundMessage, context, errorDetails, transactionContext } =
      options;

    try {
      const targetConstraint = this.resolveTargetConstraint(context);
      const { affected, updatedRecord, validationRecord } =
        await this.verificationRecordService.consumeRecord({
          where,
          context: { ...context, targetConstraint },
          transactionContext,
        });

      if (affected === 0) {
        this.handleUpdateFailure(validationRecord, context, notFoundError, notFoundMessage);
      }

      if (!updatedRecord) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
      }

      return this.verificationRecordQueryService.toCleanView(updatedRecord);
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CONSUMPTION_FAILED,
        '消费验证记录失败',
        {
          ...errorDetails,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }

  /**
   * 处理更新失败的情况
   */
  private handleUpdateFailure(
    record: VerificationRecordValidationSnapshot | null,
    context: ValidationContext,
    notFoundError: string,
    notFoundMessage: string,
  ): never {
    if (!record) {
      throw new DomainError(notFoundError, notFoundMessage);
    }

    // 按优先级检查失败原因
    for (const checker of this.failureCheckers) {
      const error = checker.check(record, context);
      if (error) {
        throw error;
      }
    }

    // 如果所有检查都通过，说明是未知错误
    throw new DomainError(VERIFICATION_RECORD_ERROR.CONSUMPTION_FAILED, '验证码已被使用或已失效');
  }

  private resolveTargetConstraint(
    context: ValidationContext,
  ): VerificationRecordConsumeTargetConstraint {
    const { consumedByAccountId, expectedType } = context;
    if (consumedByAccountId !== undefined) {
      return { mode: 'MATCH_OR_NULL', accountId: consumedByAccountId };
    }
    if (expectedType === VerificationRecordType.PASSWORD_RESET) {
      return { mode: 'IGNORE' };
    }
    return { mode: 'NULL_ONLY' };
  }
}
