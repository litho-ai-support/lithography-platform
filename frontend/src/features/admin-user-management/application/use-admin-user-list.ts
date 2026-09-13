// src/features/admin-user-management/application/use-admin-user-list.ts

/**
 * 管理员用户列表查询状态机（use case / query，收束在 feature application）。
 *
 * - 服务端分页：page / pageSize / keyword / role / status 全部下发后端，
 *   不做前端全量读取后再分页；
 * - query 对象是唯一查询游标：筛选或翻页都通过替换 query 触发重新加载，
 *   筛选变化回到第 1 页；
 * - 请求序号随状态原子更新：快速切换筛选或翻页后，旧请求返回不会覆盖当前结果；
 * - 加载中 / 空列表 / 失败（含重试）状态齐全；
 * - auth 类错误不在这里特殊处理，仍由共享 GraphQL + auth-session 全局链路负责。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import { fetchAdminUsers } from '../infrastructure/admin-user-adapter';

import type { AdminUserListPage, AdminUserListQuery } from './admin-user-management.types';

export type AdminUserListState =
  | {
      lastTotal: number;
      queryDomain: AdminUserListQueryDomain;
      status: 'loading';
      requestSeq: number;
    }
  | {
      lastTotal: number;
      page: AdminUserListPage;
      queryDomain: AdminUserListQueryDomain;
      status: 'ready';
      requestSeq: number;
    }
  | {
      lastTotal: number;
      message: string;
      queryDomain: AdminUserListQueryDomain;
      status: 'failed';
      requestSeq: number;
    };

/** total 的查询域不含 page：同筛选域内翻页、reload 与失败重试可复用最近成功 total。 */
type AdminUserListQueryDomain = Pick<
  AdminUserListQuery,
  'keyword' | 'role' | 'status' | 'pageSize'
>;

function toAdminUserListQueryDomain(query: AdminUserListQuery): AdminUserListQueryDomain {
  return {
    keyword: query.keyword,
    role: query.role,
    status: query.status,
    pageSize: query.pageSize,
  };
}

function isSameAdminUserListQueryDomain(
  left: AdminUserListQueryDomain,
  right: AdminUserListQueryDomain,
): boolean {
  return (
    left.keyword === right.keyword &&
    left.role === right.role &&
    left.status === right.status &&
    left.pageSize === right.pageSize
  );
}

/**
 * lastTotal：当前 queryDomain 最近一次成功返回的分页总数。同域加载 / 失败沿用；
 * keyword / role / status / pageSize 任一变化即归零，禁止旧筛选域页码污染新查询。
 */
type AdminUserListAction =
  | { type: 'load-start'; requestId: number; queryDomain: AdminUserListQueryDomain }
  | {
      type: 'load-ready';
      requestId: number;
      page: AdminUserListPage;
      queryDomain: AdminUserListQueryDomain;
    }
  | { type: 'load-failed'; requestId: number; message: string };

function toListUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : '用户列表加载失败，请稍后重试。';
}

function adminUserListReducer(
  state: AdminUserListState,
  action: AdminUserListAction,
): AdminUserListState {
  switch (action.type) {
    case 'load-start':
      // 开始新请求：原子切换到 loading 并记录序号，旧结果不再可能被应用；
      // 同查询域沿用最近成功 total；查询域变化则立即归零
      return {
        lastTotal: isSameAdminUserListQueryDomain(state.queryDomain, action.queryDomain)
          ? state.status === 'ready'
            ? state.page.total
            : state.lastTotal
          : 0,
        queryDomain: action.queryDomain,
        status: 'loading',
        requestSeq: action.requestId,
      };
    case 'load-ready':
      // 竞态防护：过期请求的结果直接丢弃
      if (action.requestId !== state.requestSeq) {
        return state;
      }

      return {
        lastTotal: action.page.total,
        page: action.page,
        queryDomain: action.queryDomain,
        status: 'ready',
        requestSeq: action.requestId,
      };
    case 'load-failed':
      if (action.requestId !== state.requestSeq) {
        return state;
      }

      return {
        lastTotal: state.lastTotal,
        message: action.message,
        queryDomain: state.queryDomain,
        status: 'failed',
        requestSeq: action.requestId,
      };
  }
}

function createInitialQuery(pageSize: number): AdminUserListQuery {
  return {
    keyword: null,
    page: 1,
    role: null,
    pageSize,
    status: null,
  };
}

export function useAdminUserList(pageSize = 10) {
  const [state, dispatch] = useReducer(adminUserListReducer, {
    lastTotal: 0,
    queryDomain: toAdminUserListQueryDomain(createInitialQuery(pageSize)),
    status: 'loading',
    requestSeq: 0,
  } as AdminUserListState);
  const requestIdRef = useRef(0);
  // query 同时作为 React 状态（驱动 UI）与加载游标（effect 依赖其引用变化）
  const [query, setQuery] = useState<AdminUserListQuery>(() => createInitialQuery(pageSize));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const queryDomain = toAdminUserListQueryDomain(query);

      dispatch({ type: 'load-start', requestId, queryDomain });

      try {
        const page = await fetchAdminUsers(query);

        if (!cancelled) {
          dispatch({ type: 'load-ready', requestId, page, queryDomain });
        }
      } catch (error) {
        if (!isGraphQLIngressError(error)) {
          // 非 ingress 错误（如 mapper 守卫抛出）原始信息只保留在控制台，
          // 避免收敛文案后线上无法排障
          console.error('管理员用户列表加载出现未分类错误：', error);
        }

        if (!cancelled) {
          dispatch({ type: 'load-failed', requestId, message: toListUserMessage(error) });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [query]);

  /** 提交筛选变化（keyword / role / status）：回到第 1 页并重新加载 */
  const applyFilters = useCallback(
    (patch: Partial<Pick<AdminUserListQuery, 'keyword' | 'role' | 'status'>>) => {
      setQuery((previous) => ({ ...previous, page: 1, ...patch }));
    },
    [],
  );

  const goToPage = useCallback((page: number) => {
    setQuery((previous) => (previous.page === page ? previous : { ...previous, page }));
  }, []);

  /** 按当前游标重新加载（写命令成功后的统一刷新策略） */
  const reload = useCallback(() => {
    setQuery((previous) => ({ ...previous }));
  }, []);

  const isCurrentQueryDomain = isSameAdminUserListQueryDomain(
    state.queryDomain,
    toAdminUserListQueryDomain(query),
  );

  return { state, query, isCurrentQueryDomain, applyFilters, goToPage, reload };
}
