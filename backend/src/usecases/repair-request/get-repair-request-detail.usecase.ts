// src/usecases/repair-request/get-repair-request-detail.usecase.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { Injectable } from '@nestjs/common';
import { RepairRequestDetailView } from '@src/modules/lithography/lithography.types';
import { RepairRequestQueryService } from '@src/modules/lithography/queries/repair-request.query.service';

/**
 * 查询维修申请详情用例（客户与工程师共用）
 *
 * - 细粒度读权限（本人/待接单/本人已接单/越权拒绝）在 QueryService 内判定
 * - 账号仅取自 JWT/Session；角色准入（CUSTOMER + ENGINEER）由 adapter 层守卫决策，
 *   SUPER_ADMIN 第一版不继承读权限（守卫层即拒）
 */
@Injectable()
export class GetRepairRequestDetailUsecase {
  constructor(private readonly repairRequestQueryService: RepairRequestQueryService) {}

  async execute(params: {
    requestId: number;
    session: UsecaseSession;
  }): Promise<RepairRequestDetailView> {
    return this.repairRequestQueryService.findDetail(params);
  }
}
