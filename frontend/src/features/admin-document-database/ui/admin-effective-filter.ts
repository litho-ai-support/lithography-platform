// src/features/admin-document-database/ui/admin-effective-filter.ts

/**
 * R4 有效筛选单一真源：把原始筛选状态归一为「实际会发送给服务端的筛选对象」。
 *
 * - 文本 trim 后为空串、null、undefined：整体剔除（不进入请求参数，不参与空态
 *   判断，不进入重载键）。修复前三个 Tab 把空字符串序列化进 reloadKey 再与
 *   `{}` 比较，默认态被误判为「有筛选」，默认空态与「清空后恢复」一并错位；
 * - 保留 `false`（isAccepted=false 是真实筛选）、有效枚举、设备 ID 与任一端日期
 *   （不能按 falsy 一刀切）；
 * - 键序保持传入顺序：调用方以固定字段字面量构造，保证 JSON.stringify 结果
 *   稳定，可直接作为列表 hook 的 reloadKey。
 */
export function toEffectiveAdminFilter<TFilter extends object>(filter: TFilter): Partial<TFilter> {
  const effectiveEntries: Array<[string, unknown]> = [];

  Object.entries(filter).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed === '') {
        return;
      }

      effectiveEntries.push([key, trimmed]);
      return;
    }

    effectiveEntries.push([key, value]);
  });

  return Object.fromEntries(effectiveEntries) as Partial<TFilter>;
}
