// src/features/reference-document/application/use-reference-document-detail.ts

import { useCallback, useEffect, useReducer } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import type { ReferenceDocumentDetail } from '../infrastructure/reference-document.types';
import { fetchReferenceDocument } from '../infrastructure/reference-document-adapter';

/**
 * 参考资料详情流程（query 状态机，收束在 feature application）。
 *
 * - 不存在 / 已软删由 adapter 归并 not-found（统一口径，不区分原因）；
 * - transport / auth / network 失败进入 failed 态（含重试），不混入 not-found；
 * - id 变化时重载；auth 错误由共享 GraphQL + auth-session 全局链路负责。
 */

export type ReferenceDocumentDetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: ReferenceDocumentDetail }
  | { status: 'not-found'; message: string }
  | { status: 'failed'; message: string };

type ReferenceDocumentDetailAction =
  | { type: 'load-start' }
  | { type: 'load-ready'; detail: ReferenceDocumentDetail }
  | { type: 'load-not-found'; message: string }
  | { type: 'load-failed'; message: string };

function toDetailUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : '参考资料详情加载失败，请稍后重试。';
}

function referenceDocumentDetailReducer(
  _state: ReferenceDocumentDetailState,
  action: ReferenceDocumentDetailAction,
): ReferenceDocumentDetailState {
  switch (action.type) {
    case 'load-start':
      return { status: 'loading' };
    case 'load-ready':
      return { status: 'ready', detail: action.detail };
    case 'load-not-found':
      return { status: 'not-found', message: action.message };
    case 'load-failed':
      return { status: 'failed', message: action.message };
  }
}

export function useReferenceDocumentDetail(id: number) {
  const [state, dispatch] = useReducer(referenceDocumentDetailReducer, {
    status: 'loading',
  } as ReferenceDocumentDetailState);

  const loadDetail = useCallback(async (targetId: number) => {
    dispatch({ type: 'load-start' });

    try {
      const result = await fetchReferenceDocument(targetId);

      if (result.ok) {
        dispatch({ type: 'load-ready', detail: result.detail });
      } else {
        dispatch({ type: 'load-not-found', message: result.message });
      }
    } catch (error) {
      dispatch({ type: 'load-failed', message: toDetailUserMessage(error) });
    }
  }, []);

  useEffect(() => {
    void loadDetail(id);
  }, [id, loadDetail]);

  const reload = useCallback(() => {
    void loadDetail(id);
  }, [id, loadDetail]);

  return { state, reload };
}
