// src/modules/lithography/repair-request.service.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { QueryFailedError, Repository } from 'typeorm';
import { RepairRequestEntity } from './entities/repair-request.entity';
import {
  RepairRequestDeleteOutcome,
  RepairRequestInsertData,
  RepairRequestSnapshot,
} from './lithography.types';

/**
 * 维修申请写服务
 *
 * 职责范围：
 * - 维修申请细粒度插入（显式落初始状态：未接单、未作废）
 * - 维修申请编号存在性读取（供 usecase 做唯一编号冲突检测）
 * - 维修申请原子条件软删除（供 usecase 做客户侧删除，返回状态事实不表决策）
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

  /**
   * 原子条件软删除（负责人 20260901：删除/接单互斥由原子条件更新保证，
   * 禁止「先查询再普通 update」）
   *
   * 条件更新命中（affectedRows = 1）即软删除完成；未命中时在同一事务内
   * 以锁读重读当前状态区分原因（当前读不受 RR 快照时序影响）：
   * - 行不存在或非本人归属 → NOT_FOUND_OR_NOT_OWNER（统一口径，防探测他人申请存在性）
   * - 本人已软删除 → ALREADY_DELETED（幂等成功语义由 usecase 决定）
   * - 本人已接单 → ALREADY_ACCEPTED（删除条件含 is_accepted = 0）
   *
   * 仅返回状态事实；错误映射与幂等决策归 usecase。
   * 客户端可见 details 只含 id 标识，原始异常进 cause。
   */
  async softDeleteRequest(
    params: { requestId: number; customerAccountId: number },
    transactionContext?: PersistenceTransactionContext,
  ): Promise<RepairRequestDeleteOutcome> {
    const repository = this.getRepository(transactionContext);
    let affected: number;
    try {
      const result = await repository.update(
        {
          id: params.requestId,
          customerAccountId: params.customerAccountId,
          isAccepted: false,
          deprecated: false,
        },
        // 软删除固定落库 deleted_at（与实体 chk_repair_request_deletion_consistency 一致）
        { deprecated: true, deletedAt: () => 'CURRENT_TIMESTAMP(3)' },
      );
      affected = result.affected ?? 0;
    } catch (error) {
      throw new DomainError(
        REPAIR_REQUEST_ERROR.DELETION_FAILED,
        '维修申请删除失败，请稍后重试',
        { id: params.requestId },
        error,
      );
    }

    if (affected === 1) {
      const deleted = await repository.findOne({
        where: { id: params.requestId },
        select: { id: true, requestNo: true },
      });
      if (!deleted) {
        // 条件更新命中但行不可见：理论上不可达，防御性按系统故障处理
        throw new DomainError(
          REPAIR_REQUEST_ERROR.DELETION_FAILED,
          '维修申请删除失败，请稍后重试',
          { id: params.requestId },
        );
      }
      return { kind: 'DELETED', id: deleted.id, requestNo: deleted.requestNo };
    }

    const row = await repository.findOne({
      where: { id: params.requestId },
      select: {
        id: true,
        requestNo: true,
        customerAccountId: true,
        isAccepted: true,
        deprecated: true,
      },
      // 锁读（当前读）：取最新已提交版本，分类不受 RR 快照建立时序影响，
      // 也不依赖「事务内本语句前无其他一致性读」的隐含前提
      lock: { mode: 'pessimistic_read' },
    });
    // 先判归属再区分已删/已接单：他人申请一律统一为不存在，不泄露状态（裁定 5）
    if (!row || row.customerAccountId !== params.customerAccountId) {
      return { kind: 'NOT_FOUND_OR_NOT_OWNER', id: params.requestId };
    }
    if (row.deprecated) {
      return { kind: 'ALREADY_DELETED', id: row.id, requestNo: row.requestNo };
    }
    if (row.isAccepted) {
      return { kind: 'ALREADY_ACCEPTED', id: row.id, requestNo: row.requestNo };
    }
    // 锁读下重读已取最新已提交状态，仍满足删除条件却未命中：理论上不可达，
    // 防御性按系统故障处理，避免误判为业务拒绝
    throw new DomainError(REPAIR_REQUEST_ERROR.DELETION_FAILED, '维修申请删除失败，请稍后重试', {
      id: params.requestId,
    });
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
