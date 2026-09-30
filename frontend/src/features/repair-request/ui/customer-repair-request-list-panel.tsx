// src/features/repair-request/ui/customer-repair-request-list-panel.tsx

import { Button, Pagination, Popconfirm } from 'antd';

import { DataCard } from '@/shared/ui/data-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { ErrorState } from '@/shared/ui/error-state';
import { formatDateTimeMinuteText } from '@/shared/ui/format-date-time';
import { LoadingState } from '@/shared/ui/loading-state';
import { StatusPill } from '@/shared/ui/status-pill';

import type { CustomerRepairRequestListView } from '../application/use-customer-repair-request-list';
import type { RepairRequestListItem } from '../infrastructure/repair-request-read.types';

/**
 * 客户工作台左栏「我的维修申请」活动列表面板（PR5 整合工作台）。
 *
 * - 只接收稳定列表状态、分页与选择/删除回调，不直接调用 GraphQL、不感知竞态；
 * - 条目沿用 gkj activity-request 信息层级（编号/型号·错误码/提交时间 11px·11px·9px，
 *   三态交互色见 index.css `.activity-item`），选中态由 aria-current 表达；
 * - 主选择用语义化 button（键盘可达），删除按钮独立存在，不嵌套按钮；
 * - 未接单条目显示删除确认（Popconfirm）；已接单完全不渲染删除操作；
 * - 分页保留 AntD 语义（total>0 时恒显示分页，越界空页给可恢复提示，不隐藏分页）；
 * - 空库等状态与失败态互斥，加载失败不会被误读为「没有申请」。
 */

export type CustomerRepairRequestListPanelProps = {
  state: CustomerRepairRequestListView;
  deletingId: number | null;
  /** 仅在详情目标真实存在于当前已加载分页时非空（不误选、不伪造） */
  selectedRequestId: number | null;
  onCreateRequest: () => void;
  onDelete: (id: number) => void;
  onGoToPage: (page: number, pageSize: number) => void;
  /** 卡头「我的维修申请」入口：进入历史列表路由 */
  onOpenMyRequests: () => void;
  onRetry: () => void;
  onSelect: (id: number) => void;
};

function RequestItemRow({
  deleteDisabled,
  deleting,
  item,
  onDelete,
  onSelect,
  selected,
}: {
  deleteDisabled: boolean;
  deleting: boolean;
  item: RepairRequestListItem;
  onDelete: (id: number) => void;
  onSelect: (id: number) => void;
  selected: boolean;
}) {
  return (
    <div aria-current={selected ? 'true' : undefined} className="activity-item flex items-stretch">
      <button
        className="customer-workspace-item-main flex min-w-0 flex-1 flex-col gap-1 px-3 py-[11px] text-left"
        onClick={() => onSelect(item.id)}
        type="button"
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="activity-item-code font-mono text-[11px] font-bold break-all">
            {item.requestNo}
          </span>
          <StatusPill tone={item.isAccepted ? 'ok' : 'warn'}>
            {item.isAccepted ? '已接单' : '待接单'}
          </StatusPill>
        </span>
        <span className="text-[11px] font-bold break-words text-text">{`${item.equipmentModel.modelName}（${item.equipmentModel.modelCode}）· ${item.errorCode}`}</span>
        <span className="flex items-center justify-between gap-2 text-[9px] text-text-tertiary">
          <span>提交时间</span>
          <span>{formatDateTimeMinuteText(item.createdAt)}</span>
        </span>
      </button>

      {/* 只有未接单申请可删除；已接单不预留空按钮位 */}
      {item.isAccepted ? null : (
        <div className="flex items-center pr-1.5">
          <Popconfirm
            cancelText="取消"
            okButtonProps={{ loading: deleting }}
            okText="确认删除"
            onConfirm={() => onDelete(item.id)}
            title="确认删除该维修申请？"
          >
            <Button
              aria-label={`删除申请 ${item.requestNo}`}
              danger
              disabled={deleteDisabled}
              size="small"
              type="text"
            >
              删除
            </Button>
          </Popconfirm>
        </div>
      )}
    </div>
  );
}

export function CustomerRepairRequestListPanel({
  deletingId,
  onCreateRequest,
  onDelete,
  onGoToPage,
  onOpenMyRequests,
  onRetry,
  onSelect,
  selectedRequestId,
  state,
}: CustomerRepairRequestListPanelProps) {
  const ready = state.status === 'ready';
  const items = ready ? state.data.items : [];
  const total = ready ? state.data.total : 0;

  return (
    <DataCard
      extra={ready ? <StatusPill tone="neutral">共 {total} 项</StatusPill> : null}
      title={
        <button
          className="customer-workspace-list-heading"
          onClick={onOpenMyRequests}
          type="button"
        >
          我的维修申请
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        {state.status === 'loading' ? <LoadingState label="正在加载维修申请…" /> : null}

        {state.status === 'failed' ? (
          <ErrorState
            action={
              <Button onClick={onRetry} size="small">
                重试
              </Button>
            }
            title={state.message}
          />
        ) : null}

        {ready && total === 0 ? (
          <EmptyState
            action={
              <Button onClick={onCreateRequest} type="primary">
                发起维修申请
              </Button>
            }
            description="设备出现异常时，提交故障信息创建维修申请。"
            title="还没有维修申请。"
          />
        ) : null}

        {/* 越界空页（total>0 但当前页为空）不隐藏分页，给出可恢复提示 */}
        {ready && total > 0 && items.length === 0 ? (
          <EmptyState title="当前页暂无申请，请切换页码查看。" />
        ) : null}

        {ready && items.length > 0
          ? items.map((item) => (
              <RequestItemRow
                deleteDisabled={deletingId !== null}
                deleting={deletingId === item.id}
                item={item}
                key={item.id}
                onDelete={onDelete}
                onSelect={onSelect}
                selected={selectedRequestId === item.id}
              />
            ))
          : null}

        {ready && total > 0 ? (
          <div className="mt-1 flex justify-center">
            <Pagination
              current={state.data.page}
              onChange={onGoToPage}
              pageSize={state.data.pageSize}
              showSizeChanger={false}
              size="small"
              total={total}
            />
          </div>
        ) : null}
      </div>
    </DataCard>
  );
}
