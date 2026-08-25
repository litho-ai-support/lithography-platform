// src/modules/common/search.module.ts
// 顶层可复用 Search 模块：绑定 TypeORM 搜索实现并导出服务

import { Module } from '@nestjs/common';
// 移除对具体驱动类型的输入约束，保持端口抽象一致

import type { ISearchEngine } from '@core/search/search.contract';
import { TypeOrmSearch } from '@src/infrastructure/typeorm/search/typeorm-search';

export const SEARCH_TOKENS = {
  ENGINE: Symbol('SEARCH_ENGINE'),
} as const;

/**
 * SearchService：封装复用的读服务
 * - 承接 DI 的 ISearchEngine
 * - 暴露以 QueryBuilder 为输入的搜索方法
 */
export class SearchService {
  constructor(private readonly engine: ISearchEngine) {}

  /**
   * 执行搜索与分页
   * @param qb 查询构建器（TypeORM SelectQueryBuilder）
   * @param params 搜索参数（含分页）
   * @param options 搜索选项（列解析/排序白名单等）
   */
  async search<T>(input: {
    readonly qb: unknown;
    readonly params: import('@core/search/search.types').SearchParams;
    readonly options: import('@core/search/search.types').SearchOptions;
  }): Promise<import('@core/search/search.types').SearchResult<T>> {
    return this.engine.search<T>({ qb: input.qb, params: input.params, options: input.options });
  }
}

@Module({
  providers: [
    { provide: SEARCH_TOKENS.ENGINE, useClass: TypeOrmSearch },
    {
      provide: SearchService,
      useFactory: (engine: ISearchEngine) => new SearchService(engine),
      inject: [SEARCH_TOKENS.ENGINE],
    },
  ],
  exports: [SEARCH_TOKENS.ENGINE, SearchService],
})
export class SearchModule {}
