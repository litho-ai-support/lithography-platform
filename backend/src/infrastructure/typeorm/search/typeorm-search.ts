// src/infrastructure/typeorm/search/typeorm-search.ts
// ISearchEngine 的 TypeORM 实现：结合 PaginationService/策略进行搜索与分页

import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import {
  applyDefaults,
  enforceMaxPageSize,
  whitelistSorts,
} from '@core/pagination/pagination.policy';
import type { PaginationParams, SortParam } from '@core/pagination/pagination.types';
import type { ISearchEngine } from '@core/search/search.contract';
import type { SearchOptions, SearchParams, SearchResult } from '@core/search/search.types';
import { ensureTieBreaker } from '@core/sort/sort.contract';
import { Brackets, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';

/**
 * TypeORM 搜索引擎实现
 * - 将文本查询与过滤条件应用到 QueryBuilder
 * - 复用分页策略（默认值、上限、白名单、游标稳定性）
 */
/**
 * TypeORM 搜索实现
 * - 统一命名为 TypeOrmSearch（与文件名一致）
 */
export class TypeOrmSearch implements ISearchEngine {
  /**
   * 执行搜索与分页
   * - 进入时克隆调用方的 QueryBuilder，避免副作用污染
   * - 在基础设施实现里将 qb 收紧为 `SelectQueryBuilder<T>`，便于使用类型安全的 `getMany()`
   */
  async search<T>(input: {
    readonly qb: unknown;
    readonly params: SearchParams;
    readonly options: SearchOptions;
  }): Promise<SearchResult<T>> {
    // 克隆调用方传入的 QueryBuilder，避免在引擎内的 where/orderBy/take/skip 等副作用污染调用方复用
    const qb = (input.qb as SelectQueryBuilder<ObjectLiteral>).clone();
    const { params, options } = input;

    try {
      // 0) 开发态防御性校验：随机抽检 allowedSorts 与 resolveColumn 的一致性
      if (options.allowedSorts && options.allowedSorts.length > 0) {
        const sample = options.allowedSorts[0];
        const resolved = options.resolveColumn(sample);
        if (!resolved) {
          throw new DomainError(
            PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED,
            `排序白名单与列解析不一致：无法解析字段 ${sample}`,
          );
        }
      }
      // 1) 应用文本查询
      this.applyTextSearch(qb, params.query, options);

      // 2) 应用过滤条件
      this.applyFilters(qb, params.filters, options);

      // 3) 归一化分页参数与排序
      const normalized = this.computeParams(params.pagination, options.defaultSorts);
      const orderedSorts = this.prepareSorts(normalized, options);

      // 4) 应用排序到 QueryBuilder
      this.applySorting(qb, orderedSorts, options);

      // 5) 分派到 Offset 或 Cursor 分页
      if (normalized.mode === 'OFFSET') {
        return this.executeOffsetPagination(qb, normalized, options);
      } else {
        return this.executeCursorPagination(qb, normalized, orderedSorts, options);
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        PAGINATION_ERROR.DB_QUERY_FAILED,
        '搜索查询失败',
        { error: error instanceof Error ? error.message : '未知错误' },
        error,
      );
    }
  }

  /**
   * 归一化分页参数：应用默认排序与页大小上限，并兜底下界
   * - 保证 CURSOR 模式下 limit >= 1，避免 take(0)
   * - 保证 OFFSET 模式下 pageSize >= 1、page >= 1
   */
  private computeParams(
    params: PaginationParams,
    defaultSorts: ReadonlyArray<SortParam>,
  ): PaginationParams {
    const withDefaults = applyDefaults(params, { sorts: defaultSorts });
    const limited = enforceMaxPageSize(withDefaults, 100);
    if (limited.mode === 'CURSOR') {
      const limit = limited.limit < 1 ? 1 : limited.limit;
      return { ...limited, limit };
    }
    if (limited.mode === 'OFFSET') {
      const pageSize = limited.pageSize < 1 ? 1 : limited.pageSize;
      const page = limited.page < 1 ? 1 : limited.page;
      return { ...limited, pageSize, page };
    }
    return limited;
  }

  /**
   * 规范化排序列表：在提供 cursorKey 时补齐 tieBreaker（无论模式），提升排序稳定性
   */
  private normalizeSorts(
    sorts: ReadonlyArray<SortParam>,
    defaultSorts: ReadonlyArray<SortParam>,
    cursorKey?: { readonly primary: string; readonly tieBreaker: string },
  ): ReadonlyArray<SortParam> {
    const base = sorts.length ? sorts : defaultSorts;
    return ensureTieBreaker(base, cursorKey);
  }

  /**
   * 解析游标方向，保持与已应用的 ORDER BY 一致。
   * 当主键方向未显式指定时，回退到第一排序项或 ASC。
   */
  private resolveCursorDirections(
    orderedSorts: ReadonlyArray<SortParam>,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): { readonly primaryDir: 'ASC' | 'DESC'; readonly tieBreakerDir: 'ASC' | 'DESC' } {
    const primaryDir = orderedSorts.find((s) => s.field === cursorKey.primary)?.direction ?? 'ASC';
    const tieBreakerDir =
      orderedSorts.find((s) => s.field === cursorKey.tieBreaker)?.direction ??
      orderedSorts[0]?.direction ??
      'ASC';
    return { primaryDir, tieBreakerDir };
  }

  /**
   * 兼容不同 TypeORM 版本的清空 ORDER BY 行为
   */
  private clearOrderBy(qb: SelectQueryBuilder<ObjectLiteral>): void {
    try {
      // 尝试无参数调用清空排序
      qb.orderBy();
    } catch {
      try {
        // 某些版本需要传入空对象清空排序
        qb.orderBy({});
      } catch {
        // 放弃清空，依旧尝试 COUNT（多数情况下 ORDER BY 不影响 COUNT）
      }
    }
  }

  /**
   * 应用文本搜索：支持 OR/AND 与自定义构建钩子
   */
  private applyTextSearch(
    qb: SelectQueryBuilder<ObjectLiteral>,
    query: string | undefined,
    options: SearchOptions,
  ): void {
    if (!query || options.searchColumns.length === 0) return;

    // 最小查询长度短路，避免 LIKE '%%' 触发全表扫描
    const min = options.minQueryLength ?? 1;
    if (query.trim().length < min) return;

    // 转义 LIKE 特殊字符，避免 '%' / '_' 作为通配符导致全表命中
    const raw = query;
    const escapedInput = raw.trim();
    const escapeLike = (s: string): string => s.replace(/([%_\\])/g, '\\$1');
    const like = `%${escapeLike(escapedInput)}%`;

    // 若提供自定义文本搜索钩子，优先使用
    if (options.buildTextSearch) {
      const custom = options.buildTextSearch({ query: raw, columns: options.searchColumns });
      if (custom) {
        qb.andWhere(custom.clause, custom.params);
        return;
      }
    }

    // 回退到内置组合
    const mode = options.searchMode ?? 'OR';
    qb.andWhere(
      new Brackets((qb) => {
        options.searchColumns.forEach((col, idx) => {
          const clause = `LOWER(${col}) LIKE LOWER(:q)`;
          if (idx === 0) {
            qb.where(clause);
          } else {
            if (mode === 'AND') {
              qb.andWhere(clause);
            } else {
              qb.orWhere(clause);
            }
          }
        });
      }),
      { q: like },
    );
  }

  /**
   * 应用过滤条件：白名单字段，映射到安全列，支持 normalizeFilterValue 与 buildFilter 钩子
   */
  private applyFilters(
    qb: SelectQueryBuilder<ObjectLiteral>,
    filters: Record<string, string | number | boolean> | undefined,
    options: SearchOptions,
  ): void {
    if (!filters || !options.allowedFilters || options.allowedFilters.length === 0) return;

    const allowed = new Set(options.allowedFilters);
    Object.entries(filters).forEach(([field, value]) => {
      if (!allowed.has(field)) return;
      const column = options.resolveColumn(field);
      if (!column) return;

      // 若提供 normalizeFilterValue，先对原始值进行类型归一化（处理 "false"/"0" 等情况）
      const normalizedValue = options.normalizeFilterValue
        ? options.normalizeFilterValue({ field, raw: value })
        : value;

      // 若提供 buildFilter，让调用方为该字段生成自定义子句与参数；否则回退为等值匹配
      if (options.buildFilter) {
        const custom = options.buildFilter({ field, column, value: normalizedValue });
        if (custom) {
          qb.andWhere(custom.clause, custom.params);
          return;
        }
      }

      // 跳过 undefined（调用方未提供该过滤值）
      if (normalizedValue === undefined) return;
      // 允许显式过滤 NULL 值
      if (normalizedValue === null) {
        qb.andWhere(`${column} IS NULL`);
        return;
      }
      const paramKey = `f_${field}`;
      qb.andWhere(`${column} = :${paramKey}`, { [paramKey]: normalizedValue });
    });
  }

  /**
   * 准备排序：白名单过滤、归一化、补齐 tieBreaker
   */
  private prepareSorts(
    normalized: PaginationParams,
    options: SearchOptions,
  ): ReadonlyArray<SortParam> {
    const safeSorts = whitelistSorts(
      normalized.sorts ?? options.defaultSorts,
      options.allowedSorts,
    );
    return this.normalizeSorts(
      safeSorts.length ? safeSorts : options.defaultSorts,
      options.defaultSorts,
      // 即便在 OFFSET 模式下，也尽量补齐 tieBreaker 提升排序稳定性
      options.cursorKey,
    );
  }

  /**
   * 应用排序到 QueryBuilder：可选将排序列加入 SELECT 保持一致性
   */
  private applySorting(
    qb: SelectQueryBuilder<ObjectLiteral>,
    orderedSorts: ReadonlyArray<SortParam>,
    options: SearchOptions,
  ): void {
    orderedSorts.forEach((s, idx) => {
      const col = options.resolveColumn(s.field);
      if (!col)
        throw new DomainError(
          PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED,
          // 白名单与解析必须同为"业务字段"语义，禁止回退到原始列名
          `排序字段解析失败（白名单与列解析不一致）：${s.field}`,
        );
      // 选择排序列（可选开关）：部分数据库/方言对未选择但排序的列工作不一，加入 SELECT 可提升一致性
      if (options.addSortColumnsToSelect) {
        try {
          qb.addSelect(col);
        } catch {
          // 对于仅实体选择/函数表达式等场景，addSelect 可能无效或不需要，忽略异常以保持兼容
        }
      }
      if (idx === 0) qb.orderBy(col, s.direction);
      else qb.addOrderBy(col, s.direction);
    });
  }

  /**
   * 执行 Offset 分页
   */
  private async executeOffsetPagination<T>(
    qb: SelectQueryBuilder<ObjectLiteral>,
    normalized: PaginationParams & { readonly mode: 'OFFSET' },
    options: SearchOptions,
  ): Promise<SearchResult<T>> {
    const page = normalized.page;
    const pageSize = normalized.pageSize;
    const skip = (page - 1) * pageSize;

    // 使用克隆的分页查询，避免污染原始 builder
    const pageQb = qb.clone().take(pageSize).skip(skip);
    const items = (await (
      pageQb as unknown as SelectQueryBuilder<T & ObjectLiteral>
    ).getMany()) as ReadonlyArray<T>;

    let total: number | undefined;
    if (normalized.withTotal) {
      const countQb = qb.clone();
      // 清空排序避免影响 COUNT，且不应用分页
      this.clearOrderBy(countQb);
      total = await this.executeCount(countQb, options.countDistinctBy);
    }

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 执行 Cursor 分页
   */
  private async executeCursorPagination<T>(
    qb: SelectQueryBuilder<ObjectLiteral>,
    normalized: PaginationParams & { readonly mode: 'CURSOR' },
    orderedSorts: ReadonlyArray<SortParam>,
    options: SearchOptions,
  ): Promise<SearchResult<T>> {
    const qbTyped = qb as unknown as SelectQueryBuilder<T & ObjectLiteral>;
    const cursorKey = this.ensureCursorKey(options);
    const { hasAfter, hasBefore } = this.parseCursorEdges(normalized);

    if (hasAfter || hasBefore) {
      const token = options.cursorToken;
      if (!token) {
        throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '提供了游标但缺少 cursorToken');
      }
      this.validateCursorToken(token, cursorKey);
      const columns = this.resolveCursorColumns(options, cursorKey);
      const ops = this.buildCursorOps(orderedSorts, cursorKey);
      this.applyCursorBounds(qb, token, columns, ops, { hasAfter, hasBefore });
    }

    // 在 before 模式下反转排序方向拉取数据，随后再翻转回正序
    const orderReversed = hasBefore;
    if (orderReversed) {
      orderedSorts.forEach((s, idx) => {
        const col = options.resolveColumn(s.field);
        if (!col)
          throw new DomainError(
            PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED,
            `排序字段解析失败（白名单与列解析不一致）：${s.field}`,
          );
        const dir = s.direction === 'ASC' ? 'DESC' : 'ASC';
        if (idx === 0) qb.orderBy(col, dir);
        else qb.addOrderBy(col, dir);
      });
    }

    const rows = await qbTyped.take(normalized.limit + 1).getMany();
    const hasExtra = rows.length > normalized.limit;
    let items = (hasExtra ? rows.slice(0, normalized.limit) : rows) as unknown as ReadonlyArray<T>;
    if (orderReversed) {
      items = [...items].reverse();
    }

    return {
      items,
      pageInfo: {
        hasNext: orderReversed ? undefined : hasExtra,
        hasPrev: orderReversed ? hasExtra : undefined,
      },
    };
  }

  /**
   * 确认并返回游标键配置，缺失时抛出错误
   */
  private ensureCursorKey(options: SearchOptions): {
    readonly primary: string;
    readonly tieBreaker: string;
  } {
    const key = options.cursorKey;
    if (!key) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标模式必须提供 cursorKey');
    }
    return key;
  }

  /**
   * 解析游标边界标志，并确保 after 与 before 不同时出现
   */
  private parseCursorEdges(normalized: PaginationParams & { readonly mode: 'CURSOR' }): {
    readonly hasAfter: boolean;
    readonly hasBefore: boolean;
  } {
    const hasAfter = !!normalized.after;
    const hasBefore = !!(normalized as { before?: string }).before;
    if (hasAfter && hasBefore) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, 'after 与 before 不可同时提供');
    }
    return { hasAfter, hasBefore };
  }

  /**
   * 验证游标令牌与游标键配置一致
   */
  private validateCursorToken(
    token: {
      readonly key: string;
      readonly primaryValue: unknown;
      readonly tieField?: string;
      readonly tieValue: unknown;
    },
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): void {
    if (token.key !== cursorKey.primary) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标主键不匹配');
    }
    if (token.tieField && token.tieField !== cursorKey.tieBreaker) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标副键不匹配');
    }
  }

  /**
   * 解析游标边界使用的物理列名
   */
  private resolveCursorColumns(
    options: SearchOptions,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): { readonly primaryCol: string; readonly tieBreakerCol: string } {
    const primaryCol = options.resolveColumn(cursorKey.primary);
    const tieBreakerCol = options.resolveColumn(cursorKey.tieBreaker);
    if (!primaryCol || !tieBreakerCol) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '非法游标边界列');
    }
    return { primaryCol, tieBreakerCol };
  }

  /**
   * 根据已应用的排序方向构建游标边界比较操作符
   */
  private buildCursorOps(
    orderedSorts: ReadonlyArray<SortParam>,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): {
    readonly primaryOpAfter: '<' | '>';
    readonly tieBreakerOpAfter: '<' | '>';
    readonly primaryOpBefore: '<' | '>';
    readonly tieBreakerOpBefore: '<' | '>';
  } {
    const { primaryDir, tieBreakerDir } = this.resolveCursorDirections(orderedSorts, cursorKey);
    const primaryOpAfter = primaryDir === 'DESC' ? '<' : '>';
    const tieBreakerOpAfter = tieBreakerDir === 'DESC' ? '<' : '>';
    const primaryOpBefore = primaryDir === 'DESC' ? '>' : '<';
    const tieBreakerOpBefore = tieBreakerDir === 'DESC' ? '>' : '<';
    return { primaryOpAfter, tieBreakerOpAfter, primaryOpBefore, tieBreakerOpBefore };
  }

  /**
   * 应用游标边界到查询
   */
  private applyCursorBounds(
    qb: SelectQueryBuilder<ObjectLiteral>,
    token: { readonly primaryValue: unknown; readonly tieValue: unknown },
    columns: { readonly primaryCol: string; readonly tieBreakerCol: string },
    ops: {
      readonly primaryOpAfter: '<' | '>';
      readonly tieBreakerOpAfter: '<' | '>';
      readonly primaryOpBefore: '<' | '>';
      readonly tieBreakerOpBefore: '<' | '>';
    },
    edges: { readonly hasAfter: boolean; readonly hasBefore: boolean },
  ): void {
    if (edges.hasAfter) {
      qb.andWhere(
        `(${columns.primaryCol} ${ops.primaryOpAfter} :cursorPrimary OR (${columns.primaryCol} = :cursorPrimary AND ${columns.tieBreakerCol} ${ops.tieBreakerOpAfter} :cursorId))`,
        {
          cursorPrimary: token.primaryValue,
          cursorId: token.tieValue,
        },
      );
    }
    if (edges.hasBefore) {
      qb.andWhere(
        `(${columns.primaryCol} ${ops.primaryOpBefore} :cursorPrimary OR (${columns.primaryCol} = :cursorPrimary AND ${columns.tieBreakerCol} ${ops.tieBreakerOpBefore} :cursorId))`,
        {
          cursorPrimary: token.primaryValue,
          cursorId: token.tieValue,
        },
      );
    }
  }

  /**
   * 执行计数查询，支持 DISTINCT 计数
   */
  private async executeCount(
    countQb: SelectQueryBuilder<ObjectLiteral>,
    distinctCol?: string,
  ): Promise<number> {
    if (distinctCol) {
      try {
        // 防御：不接受表达式，仅接受安全列或别名.列
        if (/\s|\(|\)/.test(distinctCol)) {
          throw new DomainError(
            PAGINATION_ERROR.DB_QUERY_FAILED,
            'countDistinctBy 必须为安全列名或 别名.列，不支持表达式',
          );
        }
        // 使用手动反引号包裹标识符（兼容 MySQL），避免依赖 driver.escape 在不同驱动上的差异
        const escapeIdent = (id: string): string => `\`${id.replace(/`/g, '``')}\``;
        const col = distinctCol.includes('.')
          ? distinctCol
              .split('.')
              .map((p) => escapeIdent(p))
              .join('.')
          : escapeIdent(distinctCol);
        const alias = 'distinct_cnt';
        const raw = await countQb
          .select(`COUNT(DISTINCT ${col})`, alias)
          .getRawOne<Record<string, unknown>>();
        const val = raw?.[alias];
        return typeof val === 'number' ? val : Number(val ?? 0);
      } catch {
        // 回退：若 DISTINCT 计数失败，回退为普通 COUNT，保证接口可用
        return await countQb.getCount();
      }
    }
    return await countQb.getCount();
  }
}
