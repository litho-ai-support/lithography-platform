// src/usecases/admin-document-database/admin-document-database-filter.normalize.ts

import { DomainError, ADMIN_DOCUMENT_DATABASE_ERROR } from '@core/common/errors/domain-error';

/** 展示关键字长度上限（昵称 50 / 公司名 100，取并集上限；防超长入参直达账户域查询） */
export const ADMIN_KEYWORD_MAX_LENGTH = 100;

/** 关键字解析账号 ID 的有界上限：IN 集合上限防 SQL 膨胀；
 *  命中数超限时列表以「前 1000 个命中账号」为筛选口径（平台规模下远大于实际命中数） */
export const ADMIN_KEYWORD_ACCOUNT_LIMIT = 1000;

/**
 * 列表字符串筛选词规范化（可选）：去首尾空白，空白视为未提供该筛选。
 * 与既有列表读模型「空白搜索词=无筛选」口径一致，防止空白词以字面量进入
 * LIKE / 等值匹配命中意外结果集。
 */
export function normalizeOptionalFilterText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * 展示关键字规范化（可选）：去首尾空白 + 长度校验，空白视为未提供。
 * 超长拒绝（BAD_USER_INPUT），不静默截断。
 */
export function normalizeOptionalKeyword(value: string | null | undefined): string | undefined {
  const normalized = normalizeOptionalFilterText(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized.length > ADMIN_KEYWORD_MAX_LENGTH) {
    throw new DomainError(
      ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS,
      `搜索关键字不能超过 ${ADMIN_KEYWORD_MAX_LENGTH} 个字符`,
      { keywordLength: normalized.length },
    );
  }
  return normalized;
}

/** 时间范围边界校验：同时提供时 from 不得晚于 to（防恒空查询静默返回空页） */
export function assertTimeRangeOrder(from?: Date, to?: Date): void {
  if (from && to && from.getTime() > to.getTime()) {
    throw new DomainError(
      ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS,
      '时间范围无效：起始时间不能晚于结束时间',
    );
  }
}
