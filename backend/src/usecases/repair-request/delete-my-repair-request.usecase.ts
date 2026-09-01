// src/usecases/repair-request/delete-my-repair-request.usecase.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import {
  DomainError,
  PERMISSION_ERROR,
  REPAIR_REQUEST_ERROR,
} from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { RepairRequestService } from '@src/modules/lithography/repair-request.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import {
  DeleteMyRepairRequestCommand,
  DeleteMyRepairRequestResult,
} from './delete-my-repair-request.types';

/**
 * 删除维修申请用例（客户软删除自己的未接单申请）
 *
 * 业务流程：
 * 1. 角色决策：仅真实 CUSTOMER 可删除；SUPER_ADMIN 不能以客户身份删除
 *    （负责人 20260901 裁定 2），守卫仅放行 @Roles(CUSTOMER)，此处兜底
 * 2. 输入决策：requestId 必须为正整数
 * 3. 事务内原子条件软删除（接单/删除互斥由条件更新保证，不用「先查询再普通 update」）；
 *    条件未命中时按写服务重读的状态事实区分拒绝原因
 * 4. 结果映射（裁定 5）：不存在/非本人统一 NOT_FOUND（防探测他人申请存在性）；
 *    已接单 CONFLICT + REPAIR_REQUEST_ALREADY_ACCEPTED；本人重复删除幂等成功
 *
 * customerAccountId 仅取自会话（JWT），客户端不可传入
 */
@Injectable()
export class DeleteMyRepairRequestUsecase {
  constructor(
    private readonly repairRequestService: RepairRequestService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  /**
   * 执行删除维修申请流程
   *
   * @param command 删除命令（含会话身份快照）
   * @returns 删除完成后的申请标识（重复删除幂等成功返回同形状结果）
   */
  async execute(command: DeleteMyRepairRequestCommand): Promise<DeleteMyRepairRequestResult> {
    this.assertCustomerRole(command.session.roles);

    if (!Number.isInteger(command.requestId) || command.requestId <= 0) {
      throw new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, '维修申请 ID 无效', {
        requestId: command.requestId,
      });
    }

    return this.transactionRunner.run((transactionContext) =>
      this.doDelete(command, transactionContext),
    );
  }

  /**
   * 事务内执行：原子条件软删除 → 按状态事实映射结果
   */
  private async doDelete(
    command: DeleteMyRepairRequestCommand,
    transactionContext: PersistenceTransactionContext,
  ): Promise<DeleteMyRepairRequestResult> {
    const outcome = await this.repairRequestService.softDeleteRequest(
      { requestId: command.requestId, customerAccountId: command.session.accountId },
      transactionContext,
    );

    switch (outcome.kind) {
      case 'DELETED':
      case 'ALREADY_DELETED':
        // 幂等成功（裁定 5）：本人重复删除返回与首次删除一致的结果
        return { id: outcome.id, requestNo: outcome.requestNo };
      case 'NOT_FOUND_OR_NOT_OWNER':
        // 不存在与非本人统一拒绝，不泄露他人申请存在性（裁定 5）
        throw new DomainError(REPAIR_REQUEST_ERROR.NOT_FOUND, '维修申请不存在或不可删除', {
          id: outcome.id,
        });
      case 'ALREADY_ACCEPTED':
        // 已接单与删除互斥，明确告知原因（裁定 5）
        throw new DomainError(REPAIR_REQUEST_ERROR.ALREADY_ACCEPTED, '已接单的维修申请不能删除', {
          id: outcome.id,
          requestNo: outcome.requestNo,
        });
    }
  }

  /**
   * 角色兜底决策：仅客户可删除，SUPER_ADMIN 不放行（裁定 2）
   * 守卫层 @Roles(CUSTOMER) 已拦截，此处兜底防止守卫被绕过或角色数据漂移；
   * session.roles 已在 adapter 边界（mapJwtToUsecaseSession）归一化为大写，
   * 此处仅做精确匹配，不重复归一化（禁止 hasRole 层级展开——超管不继承删除能力）
   */
  private assertCustomerRole(roles: readonly string[]): void {
    // String() 取枚举字面值与归一化角色串精确匹配
    const requiredRole = String(IdentityTypeEnum.CUSTOMER);
    if (!roles.includes(requiredRole)) {
      throw new DomainError(
        PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
        '仅客户账号可以删除维修申请',
        { roles: [...roles] },
      );
    }
  }
}
