// src/usecases/repair-request/enrich-repair-request-nicknames.ts

import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import {
  RepairRequestDetailQueryResult,
  RepairRequestDetailView,
} from '@src/modules/lithography/lithography.types';

/** 昵称缺失时的安全回落展示（负责人 20260901 裁定 3） */
const ENGINEER_NICKNAME_FALLBACK = '工程师';

/**
 * 详情昵称富集：把 QueryService 装配结果中的工程师账号 ID 关联为当前安全昵称。
 *
 * - 跨域读取经账号域 QueryService 契约（usecase 编排，不直接跨域读表）
 * - 一次批量查询，避免逐条回复 N+1
 * - 昵称缺失/空白回落「工程师」；工程师账号 ID 不进入对外视图
 */
export async function enrichRepairRequestDetailNicknames(
  accountQueryService: AccountQueryService,
  result: RepairRequestDetailQueryResult,
): Promise<RepairRequestDetailView> {
  const engineerAccountIds = result.responses.map((response) => response.engineerAccountId);
  const nicknames = await accountQueryService.findNicknamesByAccountIds(engineerAccountIds);
  return {
    ...result,
    responses: result.responses.map((response) => ({
      id: response.id,
      engineerNickname: nicknames.get(response.engineerAccountId) ?? ENGINEER_NICKNAME_FALLBACK,
      resolutionStatus: response.resolutionStatus,
      responseText: response.responseText,
      createdAt: response.createdAt,
    })),
  };
}
