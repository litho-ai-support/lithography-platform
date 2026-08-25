// src/infrastructure/typeorm/sort/typeorm-sort.ts
import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import type { SortDirection, SortParam } from '@core/pagination/pagination.types';
import type { ISortResolver } from '@core/sort/sort.contract';

/**
 * TypeORM 排序解析器实现
 * - 负责字段白名单校验与业务字段到安全列名（含别名）的解析
 * - 提供排序列表的规范化（含默认排序与游标模式下的 tie breaker 补齐）
 */
/**
 * TypeORM 排序解析器
 * - 提供白名单校验与业务字段到安全列名的映射
 * - 负责在需要时补齐游标副键排序，保持稳定顺序
 * - 可独立使用（直接在 QueryBuilder 上应用 ORDER BY），也可与分页/搜索协作
 */
export class TypeOrmSort implements ISortResolver {
  private readonly allowedSet: ReadonlySet<string>;

  /**
   * 构造函数
   * @param allowed 允许的业务排序字段白名单
   * @param map 业务字段到安全物理列（含别名）的映射
   */
  constructor(
    private readonly allowed: ReadonlyArray<string>,
    private readonly map: Readonly<Record<string, string>>, // field -> alias.column
  ) {
    this.allowedSet = new Set(allowed);
  }

  /**
   * 解析排序字段为安全列名（带别名），非法字段返回 null
   * @param field 业务排序字段
   * @returns 安全列名或 null
   */
  /**
   * 解析排序字段为安全列名（带别名），非法字段返回 null
   * @param field 业务排序字段
   * @returns 安全列名或 null
   */
  resolveColumn(field: string): string | null {
    if (!this.allowedSet.has(field)) return null;
    return this.map[field] ?? null;
  }

  /**
   * 过滤并补齐排序列表（结合白名单与默认排序；可选游标模式下补齐 tie breaker）
   * @param input 归一化排序的入参
   * @returns 规范化后的排序列表
   */
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
  }): ReadonlyArray<SortParam> {
    const allowedSet = new Set(input.allowed);
    const base = (input.sorts ?? input.defaults).filter((s) => allowedSet.has(s.field));
    const finalBase = base.length ? base : input.defaults;

    const tie = input.tieBreaker;
    if (!tie) return finalBase;

    // 禁止 primary 与 tieBreaker 相同
    if (tie.primary === tie.tieBreaker) {
      throw new DomainError(
        PAGINATION_ERROR.INVALID_CURSOR,
        'cursorKey.primary 与 tieBreaker 不可相同',
      );
    }

    const hasPrimary = finalBase.some((s) => s.field === tie.primary);
    const hasTie = finalBase.some((s) => s.field === tie.tieBreaker);

    if (!hasPrimary) {
      // 游标模式要求排序中必须包含 primary
      throw new DomainError(
        PAGINATION_ERROR.INVALID_CURSOR,
        '游标与排序不一致：必须在排序中包含 cursor primary 与 tieBreaker',
      );
    }

    // 如缺少 tieBreaker，根据主排序或首排序方向补齐
    const primaryDir: SortDirection | undefined = finalBase.find(
      (s) => s.field === tie.primary,
    )?.direction;
    const fallbackDir: SortDirection = finalBase[0]?.direction ?? 'ASC';
    const tieDir: SortDirection = primaryDir ?? fallbackDir;

    const withTie: ReadonlyArray<SortParam> = hasTie
      ? finalBase
      : [...finalBase, { field: tie.tieBreaker, direction: tieDir }];

    // 强制排序前两位为 primary 与 tieBreaker，其他保持原有相对顺序
    const primarySort = withTie.find((s) => s.field === tie.primary)!;
    const tieSort = withTie.find((s) => s.field === tie.tieBreaker)!;
    const others = withTie.filter((s) => s.field !== tie.primary && s.field !== tie.tieBreaker);
    return [primarySort, tieSort, ...others];
  }
}
