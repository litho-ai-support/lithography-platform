// src/core/pagination/pagination.contract.ts
// 端口接口：IPaginator 与 ICursorSigner，零依赖抽象

import { CursorToken, PaginatedResult, PaginationParams, SortDirection } from './pagination.types';

export interface IPaginator {
  paginate<T>(input: {
    readonly qb: unknown; // 在 core 作为黑盒；具体实现由 infrastructure 适配
    readonly params: PaginationParams;
    readonly options: {
      readonly countDistinctBy?: string; // 可选：在存在 join 的复杂查询下使用 COUNT(DISTINCT ...)
      readonly cursor?: {
        readonly key: { readonly primary: string; readonly tieBreaker: string };
        readonly columns: { readonly primary: string; readonly tieBreaker: string };
        readonly directions: {
          readonly primaryDir: SortDirection;
          readonly tieBreakerDir: SortDirection;
        };
        /**
         * 可选：从结果行中提取游标键值的访问器。
         * 当查询使用了 select/raw/别名导致实体属性不可用时，调用方可提供访问器以保证游标值可读。
         */
        readonly accessors?: {
          readonly primary: (row: unknown) => string | number | null | undefined;
          readonly tieBreaker: (row: unknown) => string | number | null | undefined;
        };
      };
    };
  }): Promise<PaginatedResult<T>>;
}

export interface ICursorSigner {
  sign(token: CursorToken): string;
  verify(cursor: string): CursorToken;
}
