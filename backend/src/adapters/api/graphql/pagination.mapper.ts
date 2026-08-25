// src/adapters/api/graphql/pagination.mapper.ts
// 适配器：将 GraphQL PaginationArgs 映射为 core PaginationParams
// 注意：不做副作用注册，纯函数转换

import type { PaginationParams, SortParam } from '@core/pagination/pagination.types';
import type { PaginationArgs } from './pagination.args';
import { GqlPaginationMode, GqlSortDirection } from './pagination.enums';

export function mapGqlToCoreParams(input: PaginationArgs): PaginationParams {
  const { mode, page, pageSize, limit, after, sorts, withTotal } = input;

  // 将 GraphQL 的排序项转换为 core 的 SortParam
  const coreSorts: ReadonlyArray<SortParam> | undefined = sorts?.map((s) => ({
    field: s.field,
    direction: s.direction === GqlSortDirection.DESC ? 'DESC' : 'ASC',
  }));

  if (mode === GqlPaginationMode.OFFSET) {
    // Offset 模式：page/pageSize 必须为正数，留给 policy 做默认与上限处理
    return {
      mode: 'OFFSET',
      page: page ?? 1,
      pageSize: pageSize ?? 20,
      sorts: coreSorts,
      withTotal: withTotal ?? false,
    };
  }

  // Cursor 模式：limit 必须存在，留给 policy 做默认与上限处理
  return {
    mode: 'CURSOR',
    limit: limit ?? 20,
    after,
    sorts: coreSorts,
  };
}
