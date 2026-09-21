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
 * 列表状态渲染（loading / failed / empty / 越界空页 / 数据）：四个标签共用，
 * 空态区分「默认为空」与「筛选结果为空」（计划表 S3-5 四态要求）。
 *
 * 「越界空页」= 后端契约允许 total > 0 但当前页 items 为空（数据收缩 / 翻页越界）。
 * 此时必须仍渲染 children（表格 + 分页）并给出可恢复提示，否则标签因 items 为空
 * 把表格和分页一起隐藏，用户无法翻回有效页（负责人手工验收高发打回点）。
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
      {state.status === 'ready' && state.total > 0 ? (
        <>
          {state.items.length === 0 ? (
            <div className="mb-4">
              <Alert
                description={`第 ${state.page} 页没有数据（共 ${state.total} 条），可能是数据已变动或翻页越界；请用下方分页返回其他页，或调整筛选条件。`}
                showIcon
                title="当前页无数据"
                type="warning"
              />
            </div>
          ) : null}
          {children}
        </>
      ) : null}
    </>
  );
}
