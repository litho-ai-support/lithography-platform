// src/features/repair-request/infrastructure/repair-request-read-mock-adapter.ts

import type {
  DeleteMyRepairRequestResult,
  MyRepairRequestDetailResult,
  RepairRequestListPage,
  RepairRequestListPagination,
} from './repair-request-read.types';
import {
  buildMockMyRepairRequestDetail,
  MOCK_MY_REPAIR_REQUESTS,
} from './repair-request-read-mock-data';

/**
 * 阶段一 Mock 数据访问层：签名与阶段三的真实 adapter 完全一致，
 * 页面经 barrel（@/features/repair-request）消费统一导出名，替换真实实现时页面零改动。
 *
 * 行为对齐后端契约（负责人裁定 5 + 读模型权限矩阵）：
 * - 列表：仅未删除、createdAt DESC + id DESC、OFFSET 分页；
 * - 详情：不存在 / 已删除统一 not-found（防探测，不区分原因）；
 * - 删除：已接单 → already-accepted；不存在/非本人 → not-found；
 *   已删除重复删除 → 幂等成功；其余软删除成功。
 */

/** Mock「落库」软删除状态（模块级，模拟后端条件更新结果；测试用 reset 函数隔离） */
const softDeletedIds = new Set<number>();

export function resetMyRepairRequestMockState(): void {
  softDeletedIds.clear();
}

function findVisibleById(id: number) {
  return MOCK_MY_REPAIR_REQUESTS.find(
    (r) => r.id === id && !r.deprecated && !softDeletedIds.has(id),
  );
}

export async function fetchMyRepairRequests(
  pagination: RepairRequestListPagination,
): Promise<RepairRequestListPage> {
  const visible = MOCK_MY_REPAIR_REQUESTS.filter(
    (r) => !r.deprecated && !softDeletedIds.has(r.id),
  ).sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return b.id - a.id;
  });

  const page = Math.max(1, pagination.page);
  const pageSize = Math.max(1, pagination.pageSize);
  const start = (page - 1) * pageSize;

  return {
    items: visible.slice(start, start + pageSize),
    total: visible.length,
    page,
    pageSize,
  };
}

export async function fetchMyRepairRequest(id: number): Promise<MyRepairRequestDetailResult> {
  const listItem = findVisibleById(id);

  if (!listItem) {
    return {
      ok: false,
      reason: 'not-found',
      message: '维修申请不存在或不可查看。',
    };
  }

  return { ok: true, detail: buildMockMyRepairRequestDetail(listItem) };
}

export async function deleteMyRepairRequest(id: number): Promise<DeleteMyRepairRequestResult> {
  const record = MOCK_MY_REPAIR_REQUESTS.find((r) => r.id === id);

  if (!record) {
    // 不存在 / 非本人统一口径（防探测，不泄露他人申请存在性）
    return { ok: false, reason: 'not-found', message: '维修申请不存在或不可删除。' };
  }

  // 幂等口径（裁定 5）：本人已删除的申请重复删除视为成功
  if (record.deprecated || softDeletedIds.has(id)) {
    return { ok: true };
  }

  if (record.isAccepted) {
    return {
      ok: false,
      reason: 'already-accepted',
      message: '该申请已被工程师接单，不能删除。',
    };
  }

  softDeletedIds.add(id);
  return { ok: true };
}
