// src/usecases/repair-request/get-my-repair-request-detail.usecase.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { Injectable } from '@nestjs/common';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { RepairRequestDetailView } from '@src/modules/lithography/lithography.types';
import { RepairRequestQueryService } from '@src/modules/lithography/queries/repair-request.query.service';
import { enrichRepairRequestDetailNicknames } from './enrich-repair-request-nicknames';

/**
 * 客户查询自己的维修申请详情用例（客户详情入口，含回复时间线）
 *
 * - 数据范围按客户身份判定（仅本人且未删除）；细粒度权限在 QueryService 内
 * - 回复中的工程师昵称跨域经账号域 QueryService 实时关联（不存快照）
 * - 账号仅取自 JWT/Session；角色准入（CUSTOMER，SUPER_ADMIN 按继承规则同准入）
 *   由 adapter 层守卫决策
 */
@Injectable()
export class GetMyRepairRequestDetailUsecase {
  constructor(
    private readonly repairRequestQueryService: RepairRequestQueryService,
    private readonly accountQueryService: AccountQueryService,
  ) {}

  async execute(params: {
    requestId: number;
    session: UsecaseSession;
  }): Promise<RepairRequestDetailView> {
    const result = await this.repairRequestQueryService.findDetail({
      requestId: params.requestId,
      session: params.session,
      scope: 'CUSTOMER',
    });
    return enrichRepairRequestDetailNicknames(this.accountQueryService, result);
  }
}
