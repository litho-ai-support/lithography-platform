// src/usecases/repair-request/list-engineer-repair-requests.usecase.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import { applyDefaults, enforceMaxPageSize } from '@core/pagination/pagination.policy';
import { OffsetParams, PaginationParams } from '@core/pagination/pagination.types';
import { Injectable } from '@nestjs/common';
import {
  REPAIR_REQUEST_ENGINEER_LIST_SCOPES,
  RepairRequestEngineerListScope,
  RepairRequestListPage,
} from '@src/modules/lithography/lithography.types';
import { RepairRequestQueryService } from '@src/modules/lithography/queries/repair-request.query.service';

/** 页大小上限：与 GraphQL 边界 PaginationArgs @Max(100) 对齐（统一分页策略） */
const MAX_PAGE_SIZE = 100;

/**
 * 查询工程师维修申请列表用例（scope = AVAILABLE 待接单 / MINE 我的接单）
 *
 * - 范围入参在 GraphQL 层为字符串，由本用例对照共享类型常量校验，
 *   校验通过后才收窄类型（先验证后断言；adapter 不导入 lithography.types 枚举/常量）
 * - 账号仅取自 JWT/Session；角色准入由 adapter 层守卫决策（ENGINEER，
 *   SUPER_ADMIN 按角色继承规则同准入）；页大小上限在传输无关的用例层强制，不依赖入口校验
 */
@Injectable()
export class ListEngineerRepairRequestsUsecase {
  constructor(private readonly repairRequestQueryService: RepairRequestQueryService) {}

  async execute(params: {
    session: UsecaseSession;
    scope: string;
    pagination: PaginationParams;
  }): Promise<RepairRequestListPage> {
    const scopes: readonly string[] = REPAIR_REQUEST_ENGINEER_LIST_SCOPES;
    if (!scopes.includes(params.scope)) {
      throw new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, '工程师列表范围无效', {
        scope: params.scope,
      });
    }
    const scope = params.scope as RepairRequestEngineerListScope;
    if (params.pagination.mode !== 'OFFSET') {
      throw new DomainError(
        REPAIR_REQUEST_ERROR.INVALID_PARAMS,
        '维修申请列表第一版仅支持 OFFSET 分页',
        { mode: params.pagination.mode },
      );
    }
    const { page, pageSize, withTotal } = enforceMaxPageSize(
      applyDefaults(params.pagination, {}),
      MAX_PAGE_SIZE,
    ) as OffsetParams;
    return this.repairRequestQueryService.listByEngineer({
      engineerAccountId: params.session.accountId,
      scope,
      pagination: { page, pageSize, withTotal: withTotal ?? false },
    });
  }
}
