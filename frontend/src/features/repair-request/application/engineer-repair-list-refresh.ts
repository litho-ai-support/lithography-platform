// src/features/repair-request/application/engineer-repair-list-refresh.ts

/**
 * 工程师维修申请列表失效通道（feature application 内部协调机制）。
 *
 * Mutation 使用 no-cache，Apollo 不会自动同步列表（见 Plan 风险说明）；
 * 接单成功或接单冲突（申请已被接单）后，由接单流程调用
 * invalidateEngineerRepairLists()，已挂载的列表流程按当前参数刷新，
 * 使记录在“待接单 / 我的接单”之间正确移动，不保留过期数据。
 * 未挂载的列表页在下一次进入时本就会重新拉取，无需额外处理。
 */

type EngineerRepairListInvalidationListener = () => void;

const listeners = new Set<EngineerRepairListInvalidationListener>();

/** 订阅列表失效；返回取消订阅函数 */
export function onEngineerRepairListsInvalidated(
  listener: EngineerRepairListInvalidationListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 宣告工程师两个范围的列表数据可能已过期，所有挂载中的列表流程应刷新 */
export function invalidateEngineerRepairLists(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}
