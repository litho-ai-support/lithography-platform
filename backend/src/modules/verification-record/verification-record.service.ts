// src/modules/verification-record/verification-record.service.ts

import {
  CreateVerificationRecordParams,
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { TokenFingerprintHelper } from '@modules/common/security/token-fingerprint.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { QueryFailedError, Repository } from 'typeorm';
import { VerificationRecordEntity } from './verification-record.entity';

export type VerificationRecordConsumeTargetConstraint =
  { mode: 'IGNORE' } | { mode: 'NULL_ONLY' } | { mode: 'MATCH_OR_NULL'; accountId: number };

export type VerificationRecordValidationSnapshot = {
  id: number;
  type: VerificationRecordType;
  status: VerificationRecordStatus;
  expiresAt: Date;
  notBefore: Date | null;
  targetAccountId: number | null;
};

/**
 * 验证记录服务
 * 提供验证记录的基础数据库操作和工具方法
 *
 * 职责范围：
 * - 基础 CRUD 操作
 * - Token 指纹生成和验证
 * - 数据库查询封装
 * - 事务管理
 *
 * 不包含：
 * - 业务逻辑校验（状态、时效、权限等）
 * - 复杂的业务流程（创建、消费、撤销等）
 * - 这些功能已移至对应的 Usecase 中
 */
@Injectable()
export class VerificationRecordService {
  constructor(
    @InjectRepository(VerificationRecordEntity)
    private readonly verificationRecordRepository: Repository<VerificationRecordEntity>,
  ) {}

  /**
   * 检测是否为唯一约束冲突错误
   *
   * @param error 捕获的错误对象
   * @returns 是否为唯一约束冲突
   */
  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const errorObj = error as unknown as Record<string, unknown>;

    // TypeORM v0.3: 优先从 driverError 字段读取稳定的错误信息
    const driverError = errorObj.driverError as Record<string, unknown> | undefined;

    // MySQL: 检查 MySQL 的重复键错误
    // 读取顺序：driverError.code / driverError.errno / driverError.sqlState
    if (driverError) {
      if (
        driverError.code === 'ER_DUP_ENTRY' ||
        driverError.errno === 1062 ||
        driverError.sqlState === '23000'
      ) {
        return true;
      }

      // PostgreSQL: 唯一约束冲突错误码 23505
      if (driverError.code === '23505') {
        return true;
      }
    }

    // 兼容性处理：如果 driverError 不存在，回退到直接读取 error 对象
    // 这是为了向后兼容旧版本 TypeORM 或特殊情况
    if (
      errorObj.code === 'ER_DUP_ENTRY' ||
      errorObj.errno === 1062 ||
      errorObj.sqlState === '23000' ||
      errorObj.code === '23505'
    ) {
      return true;
    }

    return false;
  }

  /**
   * 生成 token 指纹
   * @param token 明文 token
   * @returns Buffer 格式的指纹
   */
  generateTokenFingerprint(token: string): Buffer {
    return TokenFingerprintHelper.generateTokenFingerprint({ token });
  }

  /**
   * 创建验证记录（基础数据库操作）
   *
   * ⚠️ 此方法仅提供基础的数据库插入操作
   * 业务逻辑（如 token 生成、重复检查等）应在 Usecase 中处理
   *
   * @param params 创建参数
   * @param transactionContext 可选的事务上下文
   * @returns 创建的验证记录实体
   */
  async createRecord(
    params: CreateVerificationRecordParams,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<VerificationRecordEntity> {
    const repository = this.getRepository(transactionContext);

    try {
      // 生成 token 指纹
      const tokenFp = this.generateTokenFingerprint(params.token);

      // 创建实体
      const record = repository.create({
        type: params.type,
        tokenFp,
        status: VerificationRecordStatus.ACTIVE,
        expiresAt: params.expiresAt,
        notBefore: params.notBefore || null,
        targetAccountId: params.targetAccountId || null,
        subjectType: params.subjectType || null,
        subjectId: params.subjectId || null,
        payload: params.payload || null,
        issuedByAccountId: params.issuedByAccountId || null,
        consumedByAccountId: null,
        consumedAt: null,
      });

      // 保存到数据库
      return await repository.save(record);
    } catch (error) {
      // 处理唯一约束冲突（token 指纹重复）
      if (this.isUniqueConstraintViolation(error)) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.CREATION_FAILED,
          '验证记录创建失败：token 已存在',
          { type: params.type },
          error,
        );
      }

      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败',
        { type: params.type, error: error instanceof Error ? error.message : '未知错误' },
        error,
      );
    }
  }

  /**
   * 更新验证记录状态（基础数据库操作）
   *
   * ⚠️ 此方法仅提供基础的状态更新操作
   * 业务逻辑校验（权限、时效等）应在 Usecase 中处理
   *
   * @param recordId 记录 ID
   * @param status 新状态
   * @param consumedByAccountId 消费者账号 ID（仅在消费时需要）
   * @param transactionContext 可选的事务上下文
   * @returns 更新后的验证记录实体
   */
  async updateRecordStatus(
    recordId: number,
    status: VerificationRecordStatus,
    consumedByAccountId?: number,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<VerificationRecordEntity> {
    const repository = this.getRepository(transactionContext);

    try {
      const record = await repository.findOne({ where: { id: recordId } });
      if (!record) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
      }

      // 更新状态
      record.status = status;

      // 如果是消费操作，设置消费相关字段
      if (status === VerificationRecordStatus.CONSUMED && consumedByAccountId) {
        record.consumedByAccountId = consumedByAccountId;
        record.consumedAt = new Date();
      }

      return await repository.save(record);
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        VERIFICATION_RECORD_ERROR.UPDATE_FAILED,
        '更新验证记录状态失败',
        { recordId, status, error: error instanceof Error ? error.message : '未知错误' },
        error,
      );
    }
  }

  async consumeRecord(params: {
    where: { id?: number; tokenFp?: Buffer };
    context: {
      expectedType?: VerificationRecordType;
      consumedByAccountId?: number;
      subjectType?: SubjectType;
      subjectId?: number;
      now: Date;
      targetConstraint: VerificationRecordConsumeTargetConstraint;
    };
    transactionContext?: PersistenceTransactionContext;
  }): Promise<{
    affected: number;
    updatedRecord: VerificationRecordEntity | null;
    validationRecord: VerificationRecordValidationSnapshot | null;
  }> {
    const { where, context, transactionContext } = params;
    const repository = this.getRepository(transactionContext);
    const { consumedByAccountId, expectedType, subjectType, subjectId, now, targetConstraint } =
      context;

    const updateFields: Record<string, unknown> = {
      status: VerificationRecordStatus.CONSUMED,
      consumedAt: now,
    };

    if (consumedByAccountId !== undefined) {
      updateFields.consumedByAccountId = consumedByAccountId;
    }
    if (subjectType !== undefined) {
      updateFields.subjectType = subjectType;
    }
    if (subjectId !== undefined) {
      updateFields.subjectId = subjectId;
    }

    const gracePeriodMs = 180 * 1000;
    const gracePeriodAgo = new Date(now.getTime() - gracePeriodMs);

    const queryBuilder = repository
      .createQueryBuilder()
      .update()
      .set(updateFields)
      .andWhere('status = :activeStatus', { activeStatus: VerificationRecordStatus.ACTIVE })
      .andWhere('expiresAt > :gracePeriodAgo', { gracePeriodAgo })
      .andWhere('(notBefore IS NULL OR notBefore <= :now)', { now });

    if (where.id !== undefined) {
      queryBuilder.andWhere('id = :recordId', { recordId: where.id });
    }
    if (where.tokenFp !== undefined) {
      queryBuilder.andWhere('tokenFp = :tokenFp', { tokenFp: where.tokenFp });
    }

    if (targetConstraint.mode === 'MATCH_OR_NULL') {
      queryBuilder.andWhere('(targetAccountId IS NULL OR targetAccountId = :consumedByAccountId)', {
        consumedByAccountId: targetConstraint.accountId,
      });
    } else if (targetConstraint.mode === 'NULL_ONLY') {
      queryBuilder.andWhere('targetAccountId IS NULL');
    }

    if (expectedType) {
      queryBuilder.andWhere('type = :expectedType', { expectedType });
    }

    const updateResult = await queryBuilder.execute();
    if (updateResult.affected === 0) {
      const record = await repository.findOne({ where });
      return {
        affected: 0,
        updatedRecord: null,
        validationRecord: record
          ? {
              id: record.id,
              type: record.type,
              status: record.status,
              expiresAt: record.expiresAt,
              notBefore: record.notBefore,
              targetAccountId: record.targetAccountId,
            }
          : null,
      };
    }

    const updatedRecord = await repository.findOne({ where });
    return {
      affected: updateResult.affected ?? 0,
      updatedRecord: updatedRecord ?? null,
      validationRecord: null,
    };
  }

  async revokeRecord(params: {
    recordId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<{
    affected: number;
    updatedRecord: VerificationRecordEntity | null;
    currentRecord: VerificationRecordEntity | null;
  }> {
    const { recordId, transactionContext } = params;
    const repository = this.getRepository(transactionContext);

    const result = await repository
      .createQueryBuilder()
      .update()
      .set({ status: VerificationRecordStatus.REVOKED })
      .where('id = :recordId', { recordId })
      .andWhere('status = :activeStatus', { activeStatus: VerificationRecordStatus.ACTIVE })
      .execute();

    if (result.affected === 0) {
      const currentRecord = await repository.findOne({ where: { id: recordId } });
      return {
        affected: 0,
        updatedRecord: null,
        currentRecord,
      };
    }

    const updatedRecord = await repository.findOne({ where: { id: recordId } });
    return {
      affected: result.affected ?? 0,
      updatedRecord: updatedRecord ?? null,
      currentRecord: null,
    };
  }

  /**
   * 检查验证记录是否有效（工具方法）
   * 验证记录状态、过期时间和生效时间
   *
   * ⚠️ 此方法仅提供基础的有效性检查
   * 不包含权限校验，权限校验应在 Usecase 中处理
   *
   * @param record 验证记录实体
   * @returns 是否有效
   */
  isRecordValid(record: VerificationRecordEntity): boolean {
    const now = new Date();

    // 检查状态
    if (record.status !== VerificationRecordStatus.ACTIVE) {
      return false;
    }

    // 检查是否过期
    if (record.expiresAt <= now) {
      return false;
    }

    // 检查是否已生效
    if (record.notBefore && record.notBefore > now) {
      return false;
    }

    return true;
  }

  /**
   * 获取内部 Repository 实例（用于高级查询）
   * @param transactionContext 可选的事务上下文
   * @returns Repository 实例
   */
  private getRepository(
    transactionContext?: PersistenceTransactionContext,
  ): Repository<VerificationRecordEntity> {
    const manager = transactionContext ? getTypeOrmEntityManager(transactionContext) : undefined;
    return manager
      ? manager.getRepository(VerificationRecordEntity)
      : this.verificationRecordRepository;
  }
}
