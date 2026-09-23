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
  /**
   * 'knowledge-base'（PR3 R7 S5）：各状态包 .kb-card-state 落入同一张知识库卡；
   * 'default' 保持通用容器内直接渲染，不用知识库变体的调用方与断言不受影响。
   */
  variant?: 'default' | 'knowledge-base';
  children: ReactNode;
};

/**
 * 列表状态渲染（loading / failed / empty / 越界空页 / 数据）：四个标签共用，
 * 空态区分「默认为空」与「筛选结果为空」（计划表 S3-5 四态要求）。
 *
 * 「越界空页」= 后端契约允许 total > 0 但当前页 items 为空（数据收缩 / 翻页越界）。
 * 此时必须仍渲染 children（表格 + 分页）并给出可恢复提示，否则标签因 items 为空
 * 把表格和分页一起隐藏，用户无法翻回有效页（负责人手工验收高发打回点）。
 *
 * 知识库变体（PR3 R7 S5）：loading / failed / 默认空 / 筛选空 / 越界页全部落在
 * 同一 .kb-card 结构内（.kb-card-state 提供卡内边距），型号告警由各 Tab 自行
 * 放入同一卡（frontend/docs/gkj-visual-baseline.md 第 6.3 节）。
 */
export function AdminListStates<TItem>({
  state,
  hasActiveFilter,
  emptyLabel,
  filteredEmptyLabel,
  onRetry,
  variant = 'default',
  children,
}: AdminListStatesProps<TItem>) {
  const isKnowledgeBase = variant === 'knowledge-base';
  const wrap = (node: ReactNode) =>
    isKnowledgeBase ? <div className="kb-card-state">{node}</div> : node;

  return (
    <>
      {state.status === 'loading' ? wrap(<Skeleton active paragraph={{ rows: 6 }} />) : null}
      {state.status === 'failed'
        ? wrap(
            <Alert
              action={
                <Button onClick={onRetry} size="small">
                  重试
                </Button>
              }
              title={state.message}
              showIcon
              type="error"
            />,
          )
        : null}
      {state.status === 'ready' && state.total === 0
        ? wrap(<EmptyState title={hasActiveFilter ? filteredEmptyLabel : emptyLabel} />)
        : null}
      {state.status === 'ready' && state.total > 0 ? (
        <>
          {state.items.length === 0
            ? wrap(
                <Alert
                  description={`第 ${state.page} 页没有数据（共 ${state.total} 条），可能是数据已变动或翻页越界；请用下方分页返回其他页，或调整筛选条件。`}
                  showIcon
                  title="当前页无数据"
                  type="warning"
                />,
              )
            : null}
          {children}
        </>
      ) : null}
    </>
  );
}
