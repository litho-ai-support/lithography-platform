// src/modules/common/pagination.service.ts
// 同域可复用的“读”服务封装（依赖 core 端口），承接 DI

import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import {
  applyDefaults,
  enforceMaxPageSize,
  whitelistSorts,
} from '@core/pagination/pagination.policy';
import type { IPaginator } from '@core/pagination/pagination.contract';
import type {
  PaginatedResult,
  PaginationParams,
  SortParam,
} from '@core/pagination/pagination.types';
import { ensureTieBreaker, type ISortResolver } from '@core/sort/sort.contract';
import { Inject, Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { PAGINATION_TOKENS } from './tokens/pagination.tokens';

@Injectable()
export class PaginationService {
  constructor(
    @Inject(PAGINATION_TOKENS.PAGINATOR)
    private readonly paginator: IPaginator,
  ) {}

  async paginateQuery<T extends ObjectLiteral>(args: {
    readonly qb: SelectQueryBuilder<T>;
    readonly params: PaginationParams;
    readonly allowedSorts: ReadonlyArray<string>;
    readonly defaultSorts: ReadonlyArray<SortParam>;
    readonly cursorKey?: { readonly primary: string; readonly tieBreaker: string };
    readonly countDistinctBy?: string;
    readonly maxPageSize?: number;
    // ★ 推荐：传入排序解析器以集中处理排序解析与规范化
    readonly sortResolver?: ISortResolver;
    // 保留兼容：若未提供 sortResolver，仍支持传入列解析函数
    readonly resolveColumn?: (field: string) => string | null;
    /**
     * 可选：当使用 raw/别名查询或裁剪字段导致实体属性不可用时，
     * 通过访问器从结果行提取游标键值（仅在 CURSOR 模式下使用）。
     */
    readonly accessors?: {
      readonly primary: (row: unknown) => string | number | null | undefined;
      readonly tieBreaker: (row: unknown) => string | number | null | undefined;
    };
  }): Promise<PaginatedResult<T>> {
    const {
      qb,
      params,
      allowedSorts,
      defaultSorts,
      cursorKey,
      countDistinctBy,
      maxPageSize = 100,
      sortResolver,
      accessors,
    } = args;

    // 1) 游标配置校验
    this.validateCursorConfig(params, defaultSorts, cursorKey);

    // 2) 归一化参数与排序（包含默认值、上限与白名单）
    const limited = this.computeParams(params, defaultSorts, maxPageSize);
    const cursorKeyForSorts = limited.mode === 'CURSOR' ? cursorKey : undefined;
    const orderedSorts = this.normalizeSorts(
      limited.sorts ?? defaultSorts,
      allowedSorts,
      defaultSorts,
      cursorKeyForSorts,
      sortResolver,
    );

    // 在调用分页器前，应用排序到 QueryBuilder
    const columnResolver: (field: string) => string | null = (field: string) => {
      if (sortResolver) return sortResolver.resolveColumn(field);
      if (args.resolveColumn) return args.resolveColumn(field);
      return null;
    };
    this.applyOrderBy(qb, orderedSorts, columnResolver);

    const finalParams: PaginationParams = { ...limited, sorts: orderedSorts };

    // 构造游标选项（列与方向均由调用方给出）
    const cursorOptions = this.buildCursorOptions(
      finalParams,
      cursorKey,
      orderedSorts,
      sortResolver,
      args.resolveColumn,
      accessors,
    );

    return this.paginator.paginate<T>({
      qb,
      params: finalParams,
      options: {
        countDistinctBy,
        cursor: cursorOptions,
      },
    });
  }

  /**
   * 将排序应用到 TypeORM QueryBuilder
   * @param qb 选择查询构建器
   * @param sorts 排序参数列表
   * @param resolveColumn 字段到安全列名解析函数
   */
  private applyOrderBy<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    sorts: ReadonlyArray<SortParam>,
    resolveColumn: (field: string) => string | null,
  ): void {
    sorts.forEach((s, idx) => {
      const column = resolveColumn(s.field);
      if (!column) {
        throw new DomainError(PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED, `非法排序字段: ${s.field}`);
      }
      if (idx === 0) qb.orderBy(column, s.direction);
      else qb.addOrderBy(column, s.direction);
    });
  }

  /**
   * 校验并返回必需的列名
   * @param column 解析到的列名
   * @param label 语义标签用于错误信息
   */
  private requireColumn(column: string | null, label: string): string {
    if (!column) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, `非法游标边界列: ${label}`);
    }
    return column;
  }

  /**
   * 校验游标配置合法性与默认排序覆盖关系。
   * - CURSOR 模式必须提供 `cursorKey`
   * - 默认排序 `defaultSorts` 必须同时包含 `primary` 与 `tieBreaker`
   * @param params 分页参数
   * @param defaultSorts 默认排序列表
   * @param cursorKey 游标键定义
   */
  private validateCursorConfig(
    params: PaginationParams,
    defaultSorts: ReadonlyArray<SortParam>,
    cursorKey?: { readonly primary: string; readonly tieBreaker: string },
  ): void {
    if (params.mode === 'CURSOR' && !cursorKey) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标模式必须提供 cursorKey');
    }
    if (params.mode === 'CURSOR' && cursorKey) {
      const hasDefaultPrimary = defaultSorts.some((s) => s.field === cursorKey.primary);
      const hasDefaultTieBreaker = defaultSorts.some((s) => s.field === cursorKey.tieBreaker);
      if (!hasDefaultPrimary || !hasDefaultTieBreaker) {
        throw new DomainError(
          PAGINATION_ERROR.INVALID_CURSOR,
          'CURSOR 模式要求 defaultSorts 必须包含 cursor primary 与 tieBreaker',
        );
      }
    }
  }

  /**
   * 应用默认分页规则并限制页大小。
   * @param params 原始分页参数
   * @param defaultSorts 默认排序列表
   * @param maxPageSize 页大小上限
   * @returns 处理后的分页参数（包含排序）
   */
  private computeParams(
    params: PaginationParams,
    defaultSorts: ReadonlyArray<SortParam>,
    maxPageSize: number,
  ): PaginationParams {
    const withDefaults = applyDefaults(params, { sorts: defaultSorts });
    return enforceMaxPageSize(withDefaults, maxPageSize);
  }

  /**
   * 规范化排序列表：白名单过滤并通过解析器或回退逻辑补齐。
   * - 当提供 `sortResolver` 时委托其 `normalizeSorts`
   * - 未提供时：在 CURSOR 模式下补齐 `tieBreaker` 并保证前两位
   * @param limitedSorts 经过默认值处理后的排序
   * @param allowedSorts 允许的业务字段集合
   * @param defaultSorts 默认排序列表
   * @param cursorKey 游标键定义（可选）
   * @param sortResolver 排序解析器（可选）
   */
  /**
   * 规范化排序列表：白名单过滤并通过解析器或回退逻辑补齐。
   * - 当提供 `sortResolver` 时委托其 `normalizeSorts`
   * - 未提供时：在 CURSOR 模式下补齐 `tieBreaker` 并保证前两位；否则仅做白名单过滤与默认回退
   */
  private normalizeSorts(
    limitedSorts: ReadonlyArray<SortParam>,
    allowedSorts: ReadonlyArray<string>,
    defaultSorts: ReadonlyArray<SortParam>,
    cursorKey: { readonly primary: string; readonly tieBreaker: string } | undefined,
    sortResolver: ISortResolver | undefined,
  ): ReadonlyArray<SortParam> {
    const safeSorts = whitelistSorts(limitedSorts, allowedSorts);
    if (sortResolver) {
      return sortResolver.normalizeSorts({
        sorts: safeSorts,
        allowed: allowedSorts,
        defaults: defaultSorts,
        tieBreaker: cursorKey,
      });
    }

    // 未提供解析器时的回退逻辑
    const base = safeSorts.length ? safeSorts : defaultSorts;
    if (!cursorKey) return base;

    // 游标模式要求排序中必须包含 primary
    const hasPrimary = base.some((s) => s.field === cursorKey.primary);
    if (!hasPrimary) {
      throw new DomainError(
        PAGINATION_ERROR.INVALID_CURSOR,
        '游标与排序不一致：必须在排序中包含 cursor primary 与 tieBreaker',
      );
    }

    const withTie = ensureTieBreaker(base, cursorKey);
    // 保证前两位为 primary 与 tieBreaker，其他保持相对顺序
    const primarySort = withTie.find((s) => s.field === cursorKey.primary)!;
    const tieSort = withTie.find((s) => s.field === cursorKey.tieBreaker)!;
    const others = withTie.filter(
      (s) => s.field !== cursorKey.primary && s.field !== cursorKey.tieBreaker,
    );
    return [primarySort, tieSort, ...others];
  }

  /**
   * 构建游标选项（仅在 CURSOR 模式下）。
   * @param finalParams 归一化后的分页参数
   * @param cursorKey 游标键定义
   * @param orderedSorts 已确定顺序的排序列表
   * @param sortResolver 排序解析器（可选）
   * @param resolveColumn 字段解析函数（回退）
   * @param accessors 结果访问器（可选）
   */
  /**
   * 构建游标选项（仅在 CURSOR 模式下）。
   */
  private buildCursorOptions(
    finalParams: PaginationParams,
    cursorKey: { readonly primary: string; readonly tieBreaker: string } | undefined,
    orderedSorts: ReadonlyArray<SortParam>,
    sortResolver: ISortResolver | undefined,
    resolveColumn: ((field: string) => string | null) | undefined,
    accessors:
      | {
          readonly primary: (row: unknown) => string | number | null | undefined;
          readonly tieBreaker: (row: unknown) => string | number | null | undefined;
        }
      | undefined,
  ) {
    if (finalParams.mode !== 'CURSOR' || !cursorKey) return undefined;
    return {
      key: { primary: cursorKey.primary, tieBreaker: cursorKey.tieBreaker },
      columns: this.resolveCursorColumns(sortResolver, resolveColumn, cursorKey),
      directions: this.resolveCursorDirections(orderedSorts, cursorKey),
      accessors,
    };
  }

  /**
   * 解析游标列名，统一通过排序解析器转换为安全列名。
   * @param sortResolver 排序解析器
   * @param cursorKey 游标键定义
   */
  /**
   * 解析游标列名，优先使用排序解析器，未提供时回退到外部列解析函数。
   */
  private resolveCursorColumns(
    sortResolver: ISortResolver | undefined,
    resolveColumn: ((field: string) => string | null) | undefined,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): { readonly primary: string; readonly tieBreaker: string } {
    const primaryCol = sortResolver
      ? sortResolver.resolveColumn(cursorKey.primary)
      : (resolveColumn?.(cursorKey.primary) ?? null);
    const tieCol = sortResolver
      ? sortResolver.resolveColumn(cursorKey.tieBreaker)
      : (resolveColumn?.(cursorKey.tieBreaker) ?? null);
    return {
      primary: this.requireColumn(primaryCol, 'cursor primary'),
      tieBreaker: this.requireColumn(tieCol, 'cursor tieBreaker'),
    };
  }

  /**
   * 解析游标方向，基于现有排序列表推导。
   * @param orderedSorts 排序列表
   * @param cursorKey 游标键定义
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
}

// TODO(1)：validateCursorConfig() 改为基于 limited.mode / finalParams.mode 校验（先 computeParams 再校验）

// TODO(2)：CURSOR 模式下收紧：要求 defaultSorts[0/1] 与 cursorKey.primary/tieBreaker 顺序一致（否则抛 INVALID_CURSOR）

// TODO(3)：CURSOR 模式下 resolveCursorDirections() 找不到 primary/tieBreaker 时 fail-closed（抛 INVALID_CURSOR），去掉方向 fallback

// TODO(4)：补一个 E2E：传入 after（触发 CURSOR）但未显式传 params.mode='CURSOR' 的场景，确保校验仍生效（防 future regression）
