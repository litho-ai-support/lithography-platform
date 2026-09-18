// src/features/admin-document-database/application/use-admin-document-stats.ts

import { useCallback, useEffect, useReducer } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type { AdminDocumentDatabaseStats } from '../infrastructure/admin-document-database.types';
import { fetchAdminDocumentDatabaseStats } from '../infrastructure/admin-document-database-adapter';

/**
 * 页头四类真实统计（PR3 S3）：一次聚合查询，口径与各标签默认列表过滤一致
 * （参考资料/维修申请不含软删除，由后端统计查询保证），禁止前端拼凑或
 * 用当前页条数冒充总数（计划表 S3-3）。
 */

export type AdminDocumentStatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: AdminDocumentDatabaseStats }
  | { status: 'failed'; message: string };

type AdminDocumentStatsAction =
  | { type: 'load-start' }
  | { type: 'load-ready'; stats: AdminDocumentDatabaseStats }
  | { type: 'load-failed'; message: string };

function adminDocumentStatsReducer(
  _state: AdminDocumentStatsState,
  action: AdminDocumentStatsAction,
): AdminDocumentStatsState {
  switch (action.type) {
    case 'load-start':
      return { status: 'loading' };
    case 'load-ready':
      return { status: 'ready', stats: action.stats };
    case 'load-failed':
      return { status: 'failed', message: action.message };
  }
}

export function useAdminDocumentStats() {
  const [state, dispatch] = useReducer(adminDocumentStatsReducer, {
    status: 'loading',
  } as AdminDocumentStatsState);

  const load = useCallback(async () => {
    dispatch({ type: 'load-start' });

    try {
      const stats = await fetchAdminDocumentDatabaseStats();
      dispatch({ type: 'load-ready', stats });
    } catch (error) {
      dispatch({
        type: 'load-failed',
        message: isGraphQLIngressError(error)
          ? error.userMessage
          : '统计数据加载失败，请稍后重试。',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
