// src/core/pagination/pagination.types.ts
// 纯类型与值对象，零依赖、零副作用

export type PaginationMode = 'OFFSET' | 'CURSOR';

export type SortDirection = 'ASC' | 'DESC';

export interface SortParam {
  readonly field: string;
  readonly direction: SortDirection;
}

export interface OffsetParams {
  readonly page: number;
  readonly pageSize: number;
  readonly sorts?: ReadonlyArray<SortParam>;
  readonly withTotal?: boolean;
}

export interface CursorParams {
  readonly after?: string; // 向后翻页的游标（下一页）
  readonly before?: string; // 向前翻页的游标（上一页）
  readonly limit: number;
  readonly sorts?: ReadonlyArray<SortParam>;
}

export type PaginationParams =
  ({ readonly mode: 'OFFSET' } & OffsetParams) | ({ readonly mode: 'CURSOR' } & CursorParams);

export interface PageInfo {
  /**
   * 是否存在下一页
   * - 在 before 语义下，若未额外执行轻查询判断，可以置为 undefined
   */
  readonly hasNext?: boolean;
  readonly nextCursor?: string;
  readonly hasPrev?: boolean;
  readonly prevCursor?: string;
}

export interface PaginatedResult<T> {
  readonly items: ReadonlyArray<T>;
  readonly total?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly pageInfo?: PageInfo;
}

// 游标值对象，用于签名/校验
export interface CursorToken {
  /** 主键字段名（应与 cursorKey.primary 一致） */
  readonly key: string;
  /** 主键字段值（ primary 的比较值 ） */
  readonly primaryValue: string | number;
  /** 副键字段名（应与 cursorKey.tieBreaker 一致）；统一命名为 tieField */
  readonly tieField?: string;
  /** 副键字段值（ tieBreaker 的比较值 ） */
  readonly tieValue: string | number;
}
