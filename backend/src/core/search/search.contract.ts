// src/core/search/search.contract.ts
// 端口接口：ISearchEngine，零依赖抽象

import type { SearchOptions, SearchParams, SearchResult } from './search.types';

/**
 * 搜索引擎端口
 * - 负责按照 SearchParams 与 SearchOptions 执行搜索与分页
 * - 在 core 层仅定义抽象，不引入任何外部驱动
 */
export interface ISearchEngine {
  search<T>(input: {
    readonly qb: unknown; // 在 core 作为黑盒；具体实现由 infrastructure 适配
    readonly params: SearchParams;
    readonly options: SearchOptions;
  }): Promise<SearchResult<T>>;
}
