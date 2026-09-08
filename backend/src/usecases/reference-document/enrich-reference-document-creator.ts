// src/usecases/reference-document/enrich-reference-document-creator.ts

import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import {
  ReferenceDocumentDetailQueryResult,
  ReferenceDocumentDetailView,
  ReferenceDocumentListItemQueryResult,
  ReferenceDocumentListItemView,
} from '@src/modules/lithography/lithography.types';

/** 创建人昵称缺失时的安全回落展示（与维修申请 engineerNickname 回落同思路） */
const CREATOR_NICKNAME_FALLBACK = '未知用户';

/** 剥离创建人账号 ID（账号 ID 不进入任何对外视图，见 D 系列边界规则） */
function stripCreatorAccountId<T extends { createdByAccountId: number }>(
  view: T,
): Omit<T, 'createdByAccountId'> {
  const clone = { ...view };
  delete (clone as Partial<T>).createdByAccountId;
  return clone;
}

/**
 * 创建人昵称富集（列表批量）：把装配结果中的 createdByAccountId 关联为当前安全昵称。
 *
 * - 跨域读取经账号域 QueryService 契约（usecase 编排，不直接跨域读表）
 * - 一次批量查询，避免逐行 N+1
 * - 昵称缺失/空白回落「未知用户」；创建人账号 ID 不进入对外视图
 */
export async function enrichReferenceDocumentListCreators(
  accountQueryService: AccountQueryService,
  items: ReferenceDocumentListItemQueryResult[],
): Promise<ReferenceDocumentListItemView[]> {
  if (items.length === 0) {
    return [];
  }
  const creatorAccountIds = items.map((item) => item.createdByAccountId);
  const nicknames = await accountQueryService.findNicknamesByAccountIds(creatorAccountIds);
  return items.map((item) => ({
    ...stripCreatorAccountId(item),
    creatorNickname: nicknames.get(item.createdByAccountId) ?? CREATOR_NICKNAME_FALLBACK,
  }));
}

/** 创建人昵称富集（单条详情） */
export async function enrichReferenceDocumentCreator(
  accountQueryService: AccountQueryService,
  result: ReferenceDocumentDetailQueryResult,
): Promise<ReferenceDocumentDetailView> {
  const nicknames = await accountQueryService.findNicknamesByAccountIds([
    result.createdByAccountId,
  ]);
  return {
    ...stripCreatorAccountId(result),
    creatorNickname: nicknames.get(result.createdByAccountId) ?? CREATOR_NICKNAME_FALLBACK,
  };
}
