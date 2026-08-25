// src/core/sort/sort.contract.ts
import type { SortDirection, SortParam } from '@core/pagination/pagination.types';

/**
 * 排序解析端口
 * 负责将业务排序字段解析为安全的列名，并规范化排序列表。
 * 注意：此端口仅包含纯类型与规则，不依赖任何框架或驱动。
 */
export interface ISortResolver {
  /**
   * 解析排序字段为安全列名（带别名），非法字段返回 null
   * @param field 业务排序字段
   * @returns 安全列名或 null
   */
  resolveColumn(field: string): string | null;

  /**
   * 过滤并补齐排序列表（结合白名单与默认排序；可选游标模式下补齐 tie breaker）
   * @param input 归一化排序的入参
   * @returns 规范化后的排序列表
   */
  normalizeSorts(input: {
    readonly sorts?: ReadonlyArray<SortParam>;
    readonly allowed: ReadonlyArray<string>;
    readonly defaults: ReadonlyArray<SortParam>;
    readonly tieBreaker?: { readonly primary: string; readonly tieBreaker: string };
  }): ReadonlyArray<SortParam>;
}

/**
 * 工具函数：在游标模式下根据主排序方向补齐副排序（tie breaker）
 * 说明：该函数不触发列解析，仅处理排序方向的推断。
 */
export function ensureTieBreaker(
  sorts: ReadonlyArray<SortParam>,
  cursorKey?: { readonly primary: string; readonly tieBreaker: string },
): ReadonlyArray<SortParam> {
  if (!cursorKey) return sorts;
  const hasTie = sorts.some((s) => s.field === cursorKey.tieBreaker);
  if (hasTie) return sorts;

  const primaryDir: SortDirection | undefined = sorts.find(
    (s) => s.field === cursorKey.primary,
  )?.direction;
  const fallbackDir: SortDirection = sorts[0]?.direction ?? 'ASC';
  const direction: SortDirection = primaryDir ?? fallbackDir;
  return [...sorts, { field: cursorKey.tieBreaker, direction }];
}
