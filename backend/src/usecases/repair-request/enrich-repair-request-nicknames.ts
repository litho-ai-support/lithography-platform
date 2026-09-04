// src/usecases/repair-request/enrich-repair-request-nicknames.ts

import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import {
  EngineerResponseView,
  RepairRequestDetailQueryResult,
  RepairRequestDetailView,
} from '@src/modules/lithography/lithography.types';

/** 昵称缺失时的安全回落展示（负责人 20260901 裁定 3） */
const ENGINEER_NICKNAME_FALLBACK = '工程师';

/**
 * 单条回复昵称解析：与详情批量富集共用「昵称缺失回落工程师」规则
 * （回复写用例在开启写事务前读取当前工程师安全昵称时使用）
 */
export async function resolveEngineerNickname(
  accountQueryService: AccountQueryService,
  engineerAccountId: number,
): Promise<string> {
  const nicknames = await accountQueryService.findNicknamesByAccountIds([engineerAccountId]);
  return nicknames.get(engineerAccountId) ?? ENGINEER_NICKNAME_FALLBACK;
}

/**
 * 回复装配/写入结果 → 稳定读视图（单一映射口径，避免批量与单条各自拼装）；
 * 参数仅要求读视图除昵称外的四个字段，详情批量装配结果与写事务快照均可直接传入
 */
export function toEngineerResponseView(
  response: Omit<EngineerResponseView, 'engineerNickname'>,
  engineerNickname: string,
): EngineerResponseView {
  return {
    id: response.id,
    engineerNickname,
    resolutionStatus: response.resolutionStatus,
    responseText: response.responseText,
    createdAt: response.createdAt,
  };
}

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
    responses: result.responses.map((response) =>
      toEngineerResponseView(
        response,
        nicknames.get(response.engineerAccountId) ?? ENGINEER_NICKNAME_FALLBACK,
      ),
    ),
  };
}
