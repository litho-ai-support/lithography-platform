// src/features/admin-document-database/ui/admin-list-states.tsx

import { Alert, Button, Skeleton } from 'antd';
import type { ReactNode } from 'react';

import { EmptyState } from '@/shared/ui/empty-state';

import type { AdminListState } from '../application/use-admin-document-list';

type AdminListStatesProps<TItem> = {
  state: AdminListState<TItem>;
  hasActiveFilter: boolean;
  emptyLabel: string;
  filteredEmptyLabel: string;
  onRetry: () => void;
  children: ReactNode;
};

/**
 * 列表四态渲染（loading / failed / empty / 数据）：四个标签共用，
 * 空态区分「默认为空」与「筛选结果为空」（计划表 S3-5 四态要求）。
 */
export function AdminListStates<TItem>({
  state,
  hasActiveFilter,
  emptyLabel,
  filteredEmptyLabel,
  onRetry,
  children,
}: AdminListStatesProps<TItem>) {
  return (
    <>
      {state.status === 'loading' ? <Skeleton active paragraph={{ rows: 6 }} /> : null}
      {state.status === 'failed' ? (
        <Alert
          action={
            <Button onClick={onRetry} size="small">
              重试
            </Button>
          }
          title={state.message}
          showIcon
          type="error"
        />
      ) : null}
      {state.status === 'ready' && state.total === 0 ? (
        <EmptyState title={hasActiveFilter ? filteredEmptyLabel : emptyLabel} />
      ) : null}
      {state.status === 'ready' && state.total > 0 ? children : null}
    </>
  );
}
