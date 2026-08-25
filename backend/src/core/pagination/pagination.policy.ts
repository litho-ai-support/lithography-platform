// src/core/pagination/pagination.policy.ts
// 分页规则与纯函数：上限、默认值、排序白名单校验等

import {
  CursorParams,
  OffsetParams,
  PaginationParams,
  SortDirection,
  SortParam,
} from './pagination.types';

function normalizeDirection(direction: string | undefined): SortDirection {
  const upper = (direction ?? 'ASC').toUpperCase();
  return upper === 'DESC' ? 'DESC' : 'ASC';
}

function normalizeSorts(sorts: ReadonlyArray<SortParam> | undefined): ReadonlyArray<SortParam> {
  if (!sorts || sorts.length === 0) return [] as ReadonlyArray<SortParam>;
  // 方向归一化，并按“后者覆盖前者”去重（保持最后出现的字段）
  const normalized = sorts.map((s) => ({
    field: s.field,
    direction: normalizeDirection(s.direction),
  }));
  const seen = new Set<string>();
  const dedup: SortParam[] = [];
  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const s = normalized[i];
    if (!seen.has(s.field)) {
      seen.add(s.field);
      dedup.push(s);
    }
  }
  return dedup.reverse();
}

export function enforceMaxPageSize(params: PaginationParams, max: number): PaginationParams {
  if (max <= 0) return params;
  if (isOffsetMode(params)) {
    const pageSize = Math.min(Math.max(params.pageSize, 1), max);
    const page = Math.max(params.page, 1);
    return { ...params, pageSize, page };
  }
  if (isCursorMode(params)) {
    const limit = Math.min(Math.max(params.limit, 1), max);
    return { ...params, limit };
  }
  return params;
}

export function applyDefaults(
  params: PaginationParams,
  defaults: {
    readonly pageSize?: number;
    readonly limit?: number;
    readonly sorts?: ReadonlyArray<SortParam>;
  },
): PaginationParams {
  const defaultSorts = normalizeSorts(defaults.sorts ?? []);
  if (isOffsetMode(params)) {
    const rawPageSize = params.pageSize ?? defaults.pageSize ?? 20;
    const pageSize = Math.max(rawPageSize, 1);
    const rawPage = params.page ?? 1;
    const page = Math.max(rawPage, 1);
    const sorts = normalizeSorts(
      params.sorts && params.sorts.length > 0 ? params.sorts : defaultSorts,
    );
    return { ...params, pageSize, page, sorts };
  }
  if (isCursorMode(params)) {
    const rawLimit = params.limit ?? defaults.limit ?? 20;
    const limit = Math.max(rawLimit, 1);
    const sorts = normalizeSorts(
      params.sorts && params.sorts.length > 0 ? params.sorts : defaultSorts,
    );
    return { ...params, limit, sorts };
  }
  return params;
}

export function whitelistSorts(
  sorts: ReadonlyArray<SortParam> | undefined,
  allowed: ReadonlyArray<string>,
): ReadonlyArray<SortParam> {
  if (!sorts || sorts.length === 0) return [] as ReadonlyArray<SortParam>;
  const normalized = normalizeSorts(sorts);
  const allowedSet = new Set(allowed);
  const filtered = normalized.filter((s) => allowedSet.has(s.field));
  // 再次按“后者覆盖前者”去重
  const seen = new Set<string>();
  const dedup: SortParam[] = [];
  for (let i = filtered.length - 1; i >= 0; i -= 1) {
    const s = filtered[i];
    if (!seen.has(s.field)) {
      seen.add(s.field);
      dedup.push(s);
    }
  }
  return dedup.reverse();
}

export function isCursorMode(
  params: PaginationParams,
): params is { mode: 'CURSOR' } & CursorParams {
  return params.mode === 'CURSOR';
}

export function isOffsetMode(
  params: PaginationParams,
): params is { mode: 'OFFSET' } & OffsetParams {
  return params.mode === 'OFFSET';
}
