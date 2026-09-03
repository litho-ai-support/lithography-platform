// src/features/repair-request/application/use-engineer-repair-request-list.ts

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type {
  EngineerRepairListScope,
  EngineerRepairRequestListItem,
} from '../infrastructure/engineer-repair-request.types';
import { fetchEngineerRepairRequests } from '../infrastructure/engineer-repair-request-adapter';

import { onEngineerRepairListsInvalidated } from './engineer-repair-list-refresh';

/**
 * 工程师维修申请列表流程（use case / query 状态机，收束在 feature application）。
 *
 * - scope 与 GraphQL 参数严格使用后端 AVAILABLE / MINE，不创建第三套前端状态值；
 * - 加载中 / 空结果 / 失败（含重试）/ 分页齐全；
 * - 请求序号随状态原子更新：切换范围、翻页或重试后，旧请求返回不会覆盖当前结果；
 * - 订阅接单流程的列表失效通道，接单成功或冲突后自动按当前参数刷新；
 * - auth 错误不在这里特殊处理，仍由共享 GraphQL + auth-session 全局链路负责。
 */

export type EngineerRepairListState =
  | { status: 'loading'; requestSeq: number }
  | {
      status: 'ready';
      requestSeq: number;
      items: EngineerRepairRequestListItem[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { status: 'failed'; requestSeq: number; message: string };

type EngineerRepairListAction =
  | { type: 'load-start'; requestId: number }
  | {
      type: 'load-ready';
      requestId: number;
      items: EngineerRepairRequestListItem[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { type: 'load-failed'; requestId: number; message: string };

function toListUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : '维修申请列表加载失败，请稍后重试。';
}

function engineerRepairListReducer(
  state: EngineerRepairListState,
  action: EngineerRepairListAction,
): EngineerRepairListState {
  switch (action.type) {
    case 'load-start':
      // 开始新请求：原子切换到 loading 并记录序号，旧结果不再可能被应用
      return { status: 'loading', requestSeq: action.requestId };
    case 'load-ready':
      // 竞态防护：过期请求的结果直接丢弃
      if (action.requestId !== state.requestSeq) {
        return state;
      }
      return {
        status: 'ready',
        requestSeq: action.requestId,
        items: action.items,
        total: action.total,
        page: action.page,
        pageSize: action.pageSize,
      };
    case 'load-failed':
      if (action.requestId !== state.requestSeq) {
        return state;
      }
      return { status: 'failed', requestSeq: action.requestId, message: action.message };
  }
}

export function useEngineerRepairRequestList(scope: EngineerRepairListScope, pageSize = 10) {
  const [state, dispatch] = useReducer(engineerRepairListReducer, {
    status: 'loading',
    requestSeq: 0,
  });
  const requestIdRef = useRef(0);
  const cursorRef = useRef({ scope, page: 1, pageSize });

  const loadList = useCallback(
    async (targetScope: EngineerRepairListScope, page: number) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      cursorRef.current = { scope: targetScope, page, pageSize };
      dispatch({ type: 'load-start', requestId });

      try {
        const result = await fetchEngineerRepairRequests({
          scope: targetScope,
          page,
          pageSize,
        });
        dispatch({
          type: 'load-ready',
          requestId,
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        });
      } catch (error) {
        dispatch({ type: 'load-failed', requestId, message: toListUserMessage(error) });
      }
    },
    [pageSize],
  );

  // 初次加载与切换范围：切换范围时回到第 1 页
  useEffect(() => {
    void loadList(scope, 1);
  }, [scope, loadList]);

  // 接单成功 / 冲突后由接单流程宣告失效，挂载中的列表按当前参数刷新
  useEffect(
    () =>
      onEngineerRepairListsInvalidated(() => {
        const cursor = cursorRef.current;
        void loadList(cursor.scope, cursor.page);
      }),
    [loadList],
  );

  const goToPage = useCallback(
    (page: number) => {
      void loadList(cursorRef.current.scope, page);
    },
    [loadList],
  );

  const reload = useCallback(() => {
    const cursor = cursorRef.current;
    void loadList(cursor.scope, cursor.page);
  }, [loadList]);

  return { state, goToPage, reload };
}
