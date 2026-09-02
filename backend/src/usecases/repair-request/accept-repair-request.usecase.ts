// src/usecases/repair-request/accept-repair-request.usecase.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  DomainError,
  PERMISSION_ERROR,
  REPAIR_REQUEST_ERROR,
} from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { RepairRequestDetailView } from '@src/modules/lithography/lithography.types';
import { RepairRequestService } from '@src/modules/lithography/repair-request.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import { GetEngineerRepairRequestDetailUsecase } from './get-engineer-repair-request-detail.usecase';

/**
 * 工程师接单用例
 *
 * 业务流程：
 * 1. 角色兜底：仅精确 ENGINEER 业务身份可接单（不展开角色继承，
 *    SUPER_ADMIN 只继承既有读权限，读权限继承不等于写权限继承）
 * 2. 事务内原子条件更新：未删除且未接单才可写入，竞争时仅一方成功
 * 3. 未命中（affected = 0）时按最小状态读取裁决错误类别：
 *    不存在/已删除 → NOT_FOUND；已接单 → CONFLICT
 * 4. 接单成功后复用现有工程师详情读链路返回更新后的详情
 *    （读权限判定与昵称富集不重复实现）
 *
 * 接单人（engineerAccountId）仅取自后端 Session，接单时间（acceptedAt）
 * 仅取后端系统事件时间，两者均不接受客户端传入
 */
@Injectable()
export class AcceptRepairRequestUsecase {
  constructor(
    private readonly repairRequestService: RepairRequestService,
    private readonly getEngineerRepairRequestDetailUsecase: GetEngineerRepairRequestDetailUsecase,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  /**
   * 执行接单流程
   *
   * @param params requestId 与当前会话身份快照
   * @returns 接单成功后的工程师详情视图（与工程师详情 Query 同一稳定读模型）
   */
  async execute(params: {
    requestId: number;
    session: UsecaseSession;
  }): Promise<RepairRequestDetailView> {
    this.assertEngineerRole(params.session.roles);

    if (!Number.isInteger(params.requestId) || params.requestId <= 0) {
      throw new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, '维修申请 ID 无效', {
        requestId: params.requestId,
      });
    }

    await this.transactionRunner.run(async (transactionContext) => {
      // acceptedAt 使用后端系统事件时间，客户端不可传入
      const writeResult = await this.repairRequestService.acceptRequest(
        {
          requestId: params.requestId,
          engineerAccountId: params.session.accountId,
          acceptedAt: new Date(),
        },
        transactionContext,
      );
      if (writeResult.affected !== 1) {
        await this.rejectAcceptMiss(params.requestId, transactionContext);
      }
    });

    // 写后读复用现有工程师详情读链路（含细粒度读权限与昵称富集），
    // 不在本用例复制权限判断或装配逻辑
    return this.getEngineerRepairRequestDetailUsecase.execute({
      requestId: params.requestId,
      session: params.session,
    });
  }

  /**
   * 角色兜底决策：仅精确 ENGINEER 可接单
   * 守卫层已按 @Roles(ENGINEER) 拦截，此处兜底防止守卫被绕过或角色数据漂移；
   * UsecaseSession.roles 已大写归一，直接精确匹配，不使用按角色继承展开的 hasRole，
   * 否则 SUPER_ADMIN 会经继承链被误放行
   */
  private assertEngineerRole(roles: readonly string[]): void {
    if (!roles.includes(IdentityTypeEnum.ENGINEER)) {
      throw new DomainError(
        PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
        '仅工程师账号可以接单维修申请',
        { accessGroup: [...roles] },
      );
    }
  }

  /**
   * 条件更新未命中裁决（同事务内最小状态读取）：
   * - 不存在或已删除：对外 NOT_FOUND；
   * - 已接单：对外 CONFLICT（业务细节码 REPAIR_REQUEST_ALREADY_ACCEPTED）；
   *   最小快照不读接单人，无法区分本人重复接单与他人接单，
   *   文案中性，不泄漏接单工程师身份；
   * - 两者皆否属不应出现的状态，按系统失败上报
   */
  private async rejectAcceptMiss(
    requestId: number,
    transactionContext: PersistenceTransactionContext,
  ): Promise<never> {
    const status = await this.repairRequestService.findAcceptanceStatus(
      requestId,
      transactionContext,
    );
    if (!status || status.deprecated) {
      throw new DomainError(REPAIR_REQUEST_ERROR.NOT_FOUND, '维修申请不存在或已删除', {
        requestId,
      });
    }
    if (status.isAccepted) {
      throw new DomainError(
        REPAIR_REQUEST_ERROR.ALREADY_ACCEPTED,
        '维修申请已被接单，请刷新后查看最新状态',
        {
          requestId,
        },
      );
    }
    throw new DomainError(REPAIR_REQUEST_ERROR.ACCEPT_FAILED, '维修申请接单失败，请稍后重试', {
      requestId,
    });
  }
}
