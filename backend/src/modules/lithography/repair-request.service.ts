// src/modules/lithography/repair-request.service.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { QueryFailedError, Repository } from 'typeorm';
import { RepairRequestEntity } from './entities/repair-request.entity';
import {
  RepairRequestAcceptanceStatusSnapshot,
  RepairRequestAcceptData,
  RepairRequestAcceptWriteResult,
  RepairRequestInsertData,
  RepairRequestSnapshot,
} from './lithography.types';

/**
 * 维修申请写服务
 *
 * 职责范围：
 * - 维修申请细粒度插入（显式落初始状态：未接单、未作废）
 * - 维修申请编号存在性读取（供 usecase 做唯一编号冲突检测）
 * - 维修申请原子接单条件更新与接单未命中时的最小状态读取（供 usecase 裁决错误类别）
 *
 * 不包含：
 * - 权限判断、输入规范化、编号生成、contentMd 组装、接单结果裁决等业务决策（归 usecase）
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
   * 原子接单：单条带条件 UPDATE，命中条件为主键匹配、未删除且未接单。
   *
   * 并发语义：
   * - 两个工程师竞争时行锁串行化，仅条件先命中的一方写入成功；
   * - 客户删除与接单竞争时，先提交者生效，后到者条件不命中；
   * - affected = 1 才代表接单写入成功，为 0 时由 usecase 裁决错误类别。
   *
   * 三个接单字段在同一语句内同时写入，满足实体接单一致性 CHECK。
   *
   * @param data 接单写入数据（工程师身份与接单时间由 usecase 从 Session / 系统事件时间取得）
   * @param transactionContext 可选的事务上下文
   * @returns 条件更新命中行数（最小写入结果，不返回 ORM Entity）
   */
  async acceptRequest(
    data: RepairRequestAcceptData,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<RepairRequestAcceptWriteResult> {
    const repository = this.getRepository(transactionContext);
    try {
      const result = await repository.update(
        { id: data.requestId, deprecated: false, isAccepted: false },
        {
          isAccepted: true,
          acceptedByEngineerAccountId: data.engineerAccountId,
          acceptedAt: data.acceptedAt,
        },
      );
      return { affected: result.affected ?? 0 };
    } catch (error) {
      // 客户端可见的 details 仅携带申请标识，不得携带表名/SQL/约束等数据库细节；
      // 底层异常仅以 cause 保留，供服务端日志与排查使用（全局 GraphQL Filter 会将
      // details 原样写入响应）
      throw new DomainError(
        REPAIR_REQUEST_ERROR.ACCEPT_FAILED,
        '维修申请接单失败，请稍后重试',
        { requestId: data.requestId },
        error,
      );
    }
  }

  /**
   * 接单最小状态读取：仅供接单 usecase 在条件更新未命中时区分
   * “不存在/已删除”与“已接单”，不得向 Adapter 或前端输出。
   *
   * 数据库异常包装为 ACCEPT_FAILED（与 acceptRequest 同一错误路径）：
   * details 仅携带申请标识，不泄漏 SQL/表名/约束，底层异常仅作 cause 留待日志。
   *
   * @param requestId 目标申请主键
   * @param transactionContext 可选的事务上下文（与条件更新同事务内读取）
   * @returns 最小状态快照；申请不存在时为 null
   */
  async findAcceptanceStatus(
    requestId: number,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<RepairRequestAcceptanceStatusSnapshot | null> {
    const repository = this.getRepository(transactionContext);
    try {
      const entity = await repository.findOne({
        where: { id: requestId },
        select: { id: true, isAccepted: true, deprecated: true },
      });
      if (!entity) {
        return null;
      }
      return {
        id: entity.id,
        isAccepted: entity.isAccepted,
        deprecated: entity.deprecated,
      };
    } catch (error) {
      throw new DomainError(
        REPAIR_REQUEST_ERROR.ACCEPT_FAILED,
        '维修申请接单失败，请稍后重试',
        { requestId },
        error,
      );
    }
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
