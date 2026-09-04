// src/usecases/repair-request/assert-repair-request-id.ts

import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';

/**
 * 维修申请 ID 正整数断言（工程师接单/回复写用例共用，单一实现不各写一份）。
 *
 * 仅服务工程师写链路，不覆盖客户创建/删除链路（各自保留既有内联校验，
 * 避免 PR 范围扩大）。调用方保持既有顺序：
 * 权限断言在前、ID 结构校验在后、事务开启在最后。
 *
 * @param requestId 待校验的维修申请 ID
 */
export function assertRepairRequestId(requestId: number): void {
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, '维修申请 ID 无效', {
      requestId,
    });
  }
}
