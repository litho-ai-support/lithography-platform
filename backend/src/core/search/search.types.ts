// src/core/search/search.types.ts
// 纯类型定义：搜索参数与结果类型，零依赖、零副作用

import type {
  CursorToken,
  PaginatedResult,
  PaginationParams,
  SortParam,
} from '@core/pagination/pagination.types';

/**
 * 文本搜索参数
 * - query 为可选的文本查询词
 * - filters 为可选的键值过滤条件（需结合外部白名单解析）
 */
export interface SearchParams {
  readonly query?: string;
  readonly filters?: Readonly<Record<string, string | number | boolean>>;
  readonly pagination: PaginationParams;
}

/**
 * 搜索选项（与排序/列解析相关）
 * - searchColumns：参与文本搜索的安全列名（含别名）
 * - allowedFilters：允许的过滤字段集合（可选）
 * - resolveColumn：业务字段到安全列名解析函数
 * - allowedSorts / defaultSorts：排序白名单与默认排序
 * - cursorKey：游标稳定键（主键 + 副键），仅在 CURSOR 模式下生效
 * - countDistinctBy：在存在 join 的复杂查询下使用 COUNT(DISTINCT ...)
 */
export interface SearchOptions {
  readonly searchColumns: ReadonlyArray<string>;
  readonly allowedFilters?: ReadonlyArray<string>;
  /**
   * 业务字段到安全列名的解析函数（含别名）。
   * 约束：allowedSorts 必须与此函数使用同一套“业务字段”语义；
   * 若某业务字段在 allowedSorts 中允许，则 resolveColumn 必须返回非 null 的安全列名。
   */
  readonly resolveColumn: (field: string) => string | null;
  /**
   * 最小搜索词长度，用于避免文本搜索退化为 LIKE '%%' 导致全表扫描。
   * 当 query 的去除前后空格后的长度小于该值时，短路不应用文本搜索。
   * 默认值为 1。
   */
  readonly minQueryLength?: number;
  /**
   * 排序白名单（业务字段名集合）。
   * 约束：此处的字段名为“业务字段”，不可直接使用列名；
   * 实际列名由 resolveColumn 映射而来，防注入且统一别名。
   */
  readonly allowedSorts: ReadonlyArray<string>;
  readonly defaultSorts: ReadonlyArray<SortParam>;
  readonly cursorKey?: { readonly primary: string; readonly tieBreaker: string };
  readonly countDistinctBy?: string;
  /**
   * 可选：是否将排序列加入 SELECT（避免部分方言仅 ORDER BY 未选择的列时行为不一致）。
   * 默认 false，建议仅在确需原始行（如 getRawMany 或手动选择列）时开启。
   */
  readonly addSortColumnsToSelect?: boolean;
  /**
   * 可选的过滤值归一化钩子：用于将来自前端的原始值（如字符串 "false"/"0"）
   * 规范为严格的布尔或数字等简单类型，以保持查询的类型稳定。
   * 说明：该钩子保持纯函数形态，不依赖具体驱动，返回同域三种简单类型之一。
   */
  readonly normalizeFilterValue?: (args: {
    readonly field: string;
    readonly raw: string | number | boolean;
  }) => string | number | boolean;
  /**
   * 游标令牌（上层已完成解析/校验时传入），用于在引擎中追加稳定边界条件。
   * 当提供该令牌且处于 CURSOR 模式，并存在 after 光标时，引擎会依据排序方向追加 (pk, tieBreaker) 组合比较。
   */
  readonly cursorToken?: CursorToken;
  /**
   * 文本搜索模式：'OR' 表示任一列命中即可，'AND' 表示所有列都需命中。
   * 默认值为 'OR'。
   */
  readonly searchMode?: 'OR' | 'AND';
  /**
   * 可选的文本搜索构建钩子：用于自定义复杂的文本搜索表达式（例如多词拆分为 AND 组合）。
   * 说明：保持 core 纯净，不传入具体驱动的 QueryBuilder；仅返回子句与参数。
   * 返回 null 或未提供则回退到内置的 LIKE 组合（结合 searchMode）。
   */
  readonly buildTextSearch?: (args: {
    readonly query: string;
    readonly columns: ReadonlyArray<string>;
  }) => { readonly clause: string; readonly params: Readonly<Record<string, unknown>> } | null;
  /**
   * 可选过滤构建钩子：在保持 SearchParams.filters 简单键值的前提下，
   * 允许调用方为特定字段返回自定义的 where 子句与命名参数（如 IN / BETWEEN / IS NULL）。
   * 说明：该钩子不依赖任何驱动类型，仅返回字符串与参数对象，避免 core 层依赖 infrastructure。
   * 返回 null 或未提供则回退为等值匹配（column = :param）。
   */
  readonly buildFilter?: (args: {
    readonly field: string; // 业务字段名（需在 allowedFilters 中）
    readonly column: string; // 已解析的安全列名（含别名）
    readonly value: string | number | boolean; // 简单值，调用方可自行解析复合表达
  }) => { readonly clause: string; readonly params: Readonly<Record<string, unknown>> } | null;
}

/**
 * 搜索结果类型
 * - 复用分页结果结构，以便与现有分页管线一致
 */
export type SearchResult<T> = PaginatedResult<T>;
