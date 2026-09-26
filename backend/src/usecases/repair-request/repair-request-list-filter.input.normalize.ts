// src/usecases/repair-request/repair-request-list-filter.input.normalize.ts

import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import type { RepairRequestEngineerListFilter } from '@src/modules/lithography/lithography.types';

/** 客户昵称关键词长度上限：与管理员用户搜索关键字同口径（trim 后校验） */
const NICKNAME_KEYWORD_MAX_LENGTH = 100;

/**
 * 工程师列表筛选收敛（usecase 入口统一入口归一，空白语义在此裁决）：
 * - 客户昵称关键词：trim 后空白视为未提供（不筛选）；超长拒绝，
 *   不静默截断改写搜索意图；LIKE 通配符转义属账号域 QueryService 职责，本层不提前剥离；
 * - 设备型号：必须为正整数标识符，只校验不修复（越界值静默改写会指向错误型号）。
 */
export function normalizeEngineerListFilter(
  filter?: RepairRequestEngineerListFilter | null,
): RepairRequestEngineerListFilter {
  if (!filter) {
    return {};
  }
  let customerNickname: string | undefined;
  if (filter.customerNickname !== undefined && filter.customerNickname !== null) {
    const trimmed = filter.customerNickname.trim();
    if (trimmed.length > NICKNAME_KEYWORD_MAX_LENGTH) {
      throw new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, '客户昵称关键词过长', {
        maxLength: NICKNAME_KEYWORD_MAX_LENGTH,
      });
    }
    customerNickname = trimmed.length > 0 ? trimmed : undefined;
  }
  let equipmentModelId: number | undefined;
  if (filter.equipmentModelId !== undefined && filter.equipmentModelId !== null) {
    if (!Number.isInteger(filter.equipmentModelId) || filter.equipmentModelId <= 0) {
      throw new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, '设备型号筛选无效', {
        equipmentModelId: filter.equipmentModelId,
      });
    }
    equipmentModelId = filter.equipmentModelId;
  }
  return { equipmentModelId, customerNickname };
}
