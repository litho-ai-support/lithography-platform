// src/modules/lithography/repair-request.service.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { QueryFailedError, Repository } from 'typeorm';
import { RepairRequestEntity } from './entities/repair-request.entity';
import { RepairRequestInsertData, RepairRequestSnapshot } from './lithography.types';

/**
 * 维修申请写服务
 *
 * 职责范围：
 * - 维修申请细粒度插入（显式落初始状态：未接单、未作废）
 * - 维修申请编号存在性读取（供 usecase 做唯一编号冲突检测）
 *
 * 不包含：
 * - 权限判断、输入规范化、编号生成、contentMd 组装等业务决策（归 usecase）
 * - 事务开启（事务边界由 usecase 通过 TransactionRunner 持有）
 */
@Injectable()
export class RepairRequestService {
  constructor(
    @InjectRepository(RepairRequestEntity)
    private readonly repository: Repository<RepairRequestEntity>,
  ) {}

  /**
   * 插入维修申请记录
   *
   * 初始状态由本方法统一保证：
   * - isAccepted = false，接单工程师与接单时间为 NULL
   * - deprecated = false，deletedAt 为 NULL
   *
   * @param data 已完成业务判定的写入数据
   * @param transactionContext 可选的事务上下文
   * @returns 写入完成后的维修申请快照
   */
  async insertRequest(
    data: RepairRequestInsertData,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<RepairRequestSnapshot> {
    const repository = this.getRepository(transactionContext);
    try {
      const entity = repository.create({
        requestNo: data.requestNo,
        customerAccountId: data.customerAccountId,
        equipmentModelId: data.equipmentModelId,
        errorCode: data.errorCode,
        faultDescription: data.faultDescription,
        contentMd: data.contentMd,
        isAccepted: false,
        deprecated: false,
      });
      const saved = await repository.save(entity);
      return this.toSnapshot(saved);
    } catch (error) {
      // 本表唯一索引仅 uk_repair_request_no，唯一约束冲突即申请编号撞号，
      // 抛出可区分错误码交由 usecase 重新生成编号重试
      if (this.isUniqueConstraintViolation(error)) {
        throw new DomainError(
          REPAIR_REQUEST_ERROR.REQUEST_NO_CONFLICT,
          '维修申请编号冲突',
          { requestNo: data.requestNo },
          error,
        );
      }
      // 客户端可见的 details 不得携带原始数据库错误（可能含表名/约束/输入内容）；
      // 底层异常仅以 cause 保留，供服务端日志与排查使用（全局 GraphQL Filter 会将
      // details 原样写入响应）
      throw new DomainError(
        REPAIR_REQUEST_ERROR.CREATION_FAILED,
        '维修申请创建失败，请稍后重试',
        { requestNo: data.requestNo },
        error,
      );
    }
  }

  /**
   * 检测是否为唯一约束冲突错误（与验证记录服务同源判定逻辑）
   */
  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const errorObj = error as unknown as Record<string, unknown>;

    // TypeORM v0.3: 优先从 driverError 字段读取稳定的错误信息（MySQL: ER_DUP_ENTRY / 1062 / 23000）
    const driverError = errorObj.driverError as Record<string, unknown> | undefined;
    if (driverError) {
      if (
        driverError.code === 'ER_DUP_ENTRY' ||
        driverError.errno === 1062 ||
        driverError.sqlState === '23000'
      ) {
        return true;
      }
    }

    // 兼容性回退：driverError 缺失时直接读取 error 对象
    return (
      errorObj.code === 'ER_DUP_ENTRY' || errorObj.errno === 1062 || errorObj.sqlState === '23000'
    );
  }

  /**
   * 检查维修申请编号是否已存在
   *
   * @param requestNo 待检查的申请编号
   * @param transactionContext 可选的事务上下文
   * @returns 是否已存在同号申请
   */
  async requestNoExists(
    requestNo: string,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<boolean> {
    const repository = this.getRepository(transactionContext);
    const count = await repository.count({ where: { requestNo } });
    return count > 0;
  }

  private toSnapshot(entity: RepairRequestEntity): RepairRequestSnapshot {
    return {
      id: entity.id,
      requestNo: entity.requestNo,
      customerAccountId: entity.customerAccountId,
      equipmentModelId: entity.equipmentModelId,
      errorCode: entity.errorCode,
      faultDescription: entity.faultDescription,
      createdAt: entity.createdAt,
      isAccepted: entity.isAccepted,
    };
  }

  private getRepository(
    transactionContext?: PersistenceTransactionContext,
  ): Repository<RepairRequestEntity> {
    const manager = transactionContext ? getTypeOrmEntityManager(transactionContext) : undefined;
    return manager ? manager.getRepository(RepairRequestEntity) : this.repository;
  }
}
