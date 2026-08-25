// src/modules/verification-record/repositories/verification-record.read.repo.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { normalizeEmail, normalizePhone } from '@core/common/normalize/normalize.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { Repository } from 'typeorm';
import { VerificationRecordEntity } from '../verification-record.entity';

/**
 * 验证记录只读查询仓库
 * 专门负责查询操作，不涉及数据修改
 *
 * 职责范围：
 * - 根据 token 指纹查找活跃记录
 * - 上下文匹配校验（audience、email、phone）
 * - 只读查询优化
 */
@Injectable()
export class VerificationRecordReadRepository {
  constructor(
    @InjectRepository(VerificationRecordEntity)
    private readonly repository: Repository<VerificationRecordEntity>,
  ) {}

  /**
   * 根据 token 指纹查找活跃的验证记录
   *
   * @param tokenFp token 指纹（Buffer 格式）
   * @param transactionContext 可选的事务上下文
   * @returns 活跃的验证记录或 null
   */
  async findActiveByTokenFp(
    tokenFp: Buffer,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<VerificationRecordEntity | null> {
    try {
      const repository = this.getRepository(transactionContext);
      return await repository.findOne({
        where: {
          tokenFp,
          status: VerificationRecordStatus.ACTIVE,
        },
      });
    } catch (error) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.QUERY_FAILED,
        '查询活跃验证记录失败',
        {
          tokenFpLength: tokenFp.length,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }

  async tokenFingerprintExists(
    tokenFp: Buffer,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<boolean> {
    const repository = this.getRepository(transactionContext);
    const count = await repository.count({ where: { tokenFp } });
    return count > 0;
  }

  async findActiveConsumableRecord(params: {
    where: { id?: number; tokenFp?: Buffer };
    forAccountId?: number;
    expectedType?: VerificationRecordType;
    ignoreTargetRestriction?: boolean;
    now?: Date;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<VerificationRecordEntity | null> {
    const { where, forAccountId, expectedType, ignoreTargetRestriction, transactionContext } =
      params;
    const now = params.now ?? new Date();
    const repository = this.getRepository(transactionContext);

    const queryBuilder = repository
      .createQueryBuilder('record')
      .where('record.status = :activeStatus', {
        activeStatus: VerificationRecordStatus.ACTIVE,
      })
      .andWhere('record.expiresAt > :now', { now })
      .andWhere('(record.notBefore IS NULL OR record.notBefore <= :now)', { now });

    if (where.id !== undefined) {
      queryBuilder.andWhere('record.id = :recordId', { recordId: where.id });
    }
    if (where.tokenFp !== undefined) {
      queryBuilder.andWhere('record.tokenFp = :tokenFp', { tokenFp: where.tokenFp });
    }

    const hasForAccountId = forAccountId !== undefined;
    const shouldIgnoreTargetRestriction =
      ignoreTargetRestriction === true ||
      (!hasForAccountId && expectedType === VerificationRecordType.PASSWORD_RESET);
    if (!shouldIgnoreTargetRestriction) {
      if (hasForAccountId) {
        queryBuilder.andWhere(
          '(record.targetAccountId IS NULL OR record.targetAccountId = :forAccountId)',
          {
            forAccountId,
          },
        );
      } else {
        queryBuilder.andWhere('record.targetAccountId IS NULL');
      }
    }

    if (expectedType) {
      queryBuilder.andWhere('record.type = :expectedType', { expectedType });
    }

    return await queryBuilder.getOne();
  }

  async getTargetAccountIdByRecordId(params: {
    recordId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<number | null> {
    const repository = this.getRepository(params.transactionContext);
    const record = await repository.findOne({
      where: { id: params.recordId },
      select: { id: true, targetAccountId: true },
    });
    return record?.targetAccountId ?? null;
  }

  /**
   * 确保验证记录与上下文匹配
   *
   * 校验规则（严格匹配）：
   * - audience：如果调用方提供，记录必须有对应字段且值匹配
   * - email：如果调用方提供，记录必须有对应字段且值匹配（标准化后比较）
   * - phone：如果调用方提供，记录必须有对应字段且值匹配（标准化后比较）
   * - 记录缺字段或值不匹配均视为校验失败
   *
   * @param record 验证记录实体
   * @param audience 客户端类型（可选）
   * @param email 邮箱地址（可选）
   * @param phone 手机号码（可选）
   * @throws DomainError 当上下文不匹配时抛出错误
   */
  /**
   * 确保上下文匹配
   * 校验验证记录的上下文信息是否与期望值匹配
   * @param record 验证记录实体
   * @param audience 期望的受众类型
   * @param email 期望的邮箱地址
   * @param phone 期望的手机号码
   */
  ensureContextMatch(
    record: VerificationRecordEntity,
    audience?: AudienceTypeEnum | null,
    email?: string | null,
    phone?: string | null,
  ): void {
    const payload = record.payload ?? {};

    // 类型收窄：确保字段为字符串类型，并进行枚举类型校验
    const isAudience = (v: unknown): v is AudienceTypeEnum =>
      typeof v === 'string' && Object.values(AudienceTypeEnum).includes(v as AudienceTypeEnum);

    const rawAudience = payload.audience;
    const recordAudience = isAudience(rawAudience) ? rawAudience : null;
    const recordEmail = typeof payload.email === 'string' ? payload.email : null;
    const recordPhone = typeof payload.phone === 'string' ? payload.phone : null;

    // 分别校验各个字段
    this.validateAudienceMatch(record, audience, recordAudience);
    this.validateEmailMatch(record, email, recordEmail);
    this.validatePhoneMatch(record, phone, recordPhone);
  }

  /**
   * 校验 phone 上下文匹配
   * @param record 验证记录
   * @param expectedPhone 期望的 phone
   * @param recordPhone 记录中的 phone
   */
  private validatePhoneMatch(
    record: VerificationRecordEntity,
    expectedPhone?: string | null,
    recordPhone?: string | null,
  ): void {
    // 辅助函数：检查字符串是否有效（非空且非纯空格）
    const hasValidString = (s?: string | null) => typeof s === 'string' && s.trim().length > 0;

    if (!hasValidString(expectedPhone)) return;

    if (!recordPhone) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '上下文不匹配', {
        field: 'phone',
        reason: 'missing',
        expected: expectedPhone,
        actual: null,
        recordId: record.id,
      });
    }

    // 轻量标准化：去除非数字字符
    const normalizedExpected = normalizePhone(expectedPhone!);
    const normalizedActual = normalizePhone(recordPhone);

    if (normalizedActual !== normalizedExpected) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '上下文不匹配', {
        field: 'phone',
        reason: 'value_mismatch',
        expected: normalizedExpected,
        actual: normalizedActual,
        originalExpected: expectedPhone,
        originalActual: recordPhone,
        recordId: record.id,
      });
    }
  }

  /**
   * 校验 email 上下文匹配
   * @param record 验证记录
   * @param expectedEmail 期望的 email
   * @param recordEmail 记录中的 email
   */
  private validateEmailMatch(
    record: VerificationRecordEntity,
    expectedEmail?: string | null,
    recordEmail?: string | null,
  ): void {
    // 辅助函数：检查字符串是否有效（非空且非纯空格）
    const hasValidString = (s?: string | null) => typeof s === 'string' && s.trim().length > 0;

    if (!hasValidString(expectedEmail)) return;

    if (!recordEmail) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '上下文不匹配', {
        field: 'email',
        reason: 'missing',
        expected: expectedEmail,
        actual: null,
        recordId: record.id,
      });
    }

    // 轻量标准化：转小写 + 去空格
    const normalizedExpected = normalizeEmail(expectedEmail!);
    const normalizedActual = normalizeEmail(recordEmail);

    if (normalizedActual !== normalizedExpected) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '上下文不匹配', {
        field: 'email',
        reason: 'value_mismatch',
        expected: normalizedExpected,
        actual: normalizedActual,
        originalExpected: expectedEmail,
        originalActual: recordEmail,
        recordId: record.id,
      });
    }
  }

  /**
   * 校验 audience 上下文匹配
   * @param record 验证记录
   * @param expectedAudience 期望的 audience
   * @param recordAudience 记录中的 audience
   */
  private validateAudienceMatch(
    record: VerificationRecordEntity,
    expectedAudience?: AudienceTypeEnum | null,
    recordAudience?: AudienceTypeEnum | null,
  ): void {
    if (!expectedAudience) return;

    if (!recordAudience) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '上下文不匹配', {
        field: 'audience',
        reason: 'missing',
        expected: expectedAudience,
        actual: null,
        recordId: record.id,
      });
    }

    if (recordAudience !== expectedAudience) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '上下文不匹配', {
        field: 'audience',
        reason: 'value_mismatch',
        expected: expectedAudience,
        actual: recordAudience,
        recordId: record.id,
      });
    }
  }

  /**
   * 检查值是否存在且不为 null
   * @param value 待检查的值
   * @returns 是否存在
   */
  private has(value: unknown): boolean {
    return value !== undefined && value !== null;
  }

  private getRepository(
    transactionContext?: PersistenceTransactionContext,
  ): Repository<VerificationRecordEntity> {
    const manager = transactionContext ? getTypeOrmEntityManager(transactionContext) : undefined;
    return manager ? manager.getRepository(VerificationRecordEntity) : this.repository;
  }
}
