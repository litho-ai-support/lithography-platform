// src/features/repair-request/ui/customer-repair-request-detail-panel.tsx

import { Alert, Button, Popconfirm, Skeleton, Timeline } from 'antd';
import type { ReactNode } from 'react';

import { DataCard } from '@/shared/ui/data-card';
import { formatDateTimeMinuteText } from '@/shared/ui/format-date-time';
import { StatusPill } from '@/shared/ui/status-pill';

import type { CustomerRepairRequestDetailState } from '../application/use-customer-repair-request-detail-flow';
import { RESOLUTION_STATUS_LABELS } from '../infrastructure/repair-request-read.types';

/**
 * 客户工作台右栏维修申请详情面板（PR5 整合工作台）。
 *
 * - 纯展示组件：加载状态机、删除命令与竞态守卫由调用方（工作台）持有的
 *   useCustomerRepairRequestDetailFlow / 列表 hook 承担，本组件不感知 adapter；
 * - 头部集中展示申请编号、接单/处理状态与适用操作（未接单才渲染删除确认，
 *   已接单不预留空按钮位）；
 * - 基础信息用四列摘要条（型号/型号代码/错误码/创建时间），窄屏两列；
 * - 故障描述、故障正文、工程师回复按层级纵向分组；无回复时整块不渲染；
 * - 失败态区分 not-found（warning）与其余失败（error），不伪装成空数据。
 */

export type CustomerRepairRequestDetailPanelProps = {
  deleting: boolean;
  /** 提供时显示「返回历史列表」操作（详情路由使用；列表态已在列表中则不传） */
  onBackToList?: () => void;
  onDelete: () => void;
  state: CustomerRepairRequestDetailState;
};

/** 摘要条信息块：gkj .detail-section 语言（12px 圆角描边块 + 9px 大写标签 + 13px 值） */
function SummaryTile({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-bg-container p-3.5">
      <div className="text-[9px] font-extrabold tracking-[0.12em] text-text-tertiary uppercase">
        {label}
      </div>
      <div className="mt-[5px] text-[13px] font-bold break-words text-text">{children}</div>
    </div>
  );
}

function SectionBlock({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-bg-container p-3.5">
      <h4 className="text-[9px] font-extrabold tracking-[0.12em] text-text-tertiary uppercase">
        {label}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function CustomerRepairRequestDetailPanel({
  deleting,
  onBackToList,
  onDelete,
  state,
}: CustomerRepairRequestDetailPanelProps) {
  if (state.status === 'loading') {
    return (
      <DataCard title="维修申请详情">
        <Skeleton active paragraph={{ rows: 8 }} />
      </DataCard>
    );
  }

  if (state.status === 'failed') {
    return (
      <DataCard title="维修申请详情">
        <Alert
          action={
            onBackToList ? (
              <Button onClick={onBackToList} size="small">
                返回历史列表
              </Button>
            ) : null
          }
          showIcon
          title={state.message}
          type={state.notFound ? 'warning' : 'error'}
        />
      </DataCard>
    );
  }

  const { detail } = state;

  return (
    <DataCard
      extra={
        detail.isAccepted ? null : (
          <Popconfirm
            cancelText="取消"
            okButtonProps={{ loading: deleting }}
            okText="确认删除"
            onConfirm={onDelete}
            title="确认删除该维修申请？"
          >
            <Button danger disabled={deleting} type="primary">
              删除申请
            </Button>
          </Popconfirm>
        )
      }
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono break-all">{detail.requestNo}</span>
          <StatusPill tone={detail.isAccepted ? 'ok' : 'warn'}>
            {detail.isAccepted ? '已接单' : '待接单'}
          </StatusPill>
          {detail.isAccepted && detail.acceptedAt ? (
            <span className="text-xs font-normal text-text-tertiary">
              {formatDateTimeMinuteText(detail.acceptedAt)}
            </span>
          ) : null}
          {detail.latestResolutionStatus ? (
            <StatusPill tone={detail.latestResolutionStatus === 'RESOLVED' ? 'ok' : 'warn'}>
              {RESOLUTION_STATUS_LABELS[detail.latestResolutionStatus]}
            </StatusPill>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile label="设备型号">{detail.equipmentModel.modelName}</SummaryTile>
          <SummaryTile label="型号代码">{detail.equipmentModel.modelCode}</SummaryTile>
          <SummaryTile label="错误码">{detail.errorCode}</SummaryTile>
          <SummaryTile label="创建时间">{formatDateTimeMinuteText(detail.createdAt)}</SummaryTile>
        </div>

        <SectionBlock label="故障描述">
          <div className="text-[13px] break-words text-text">{detail.faultDescription}</div>
        </SectionBlock>

        {/* 故障正文按纯文本渲染（React 文本转义边界），不切换为原始 HTML */}
        <SectionBlock label="故障正文">
          <pre className="text-sm break-words whitespace-pre-wrap">{detail.contentMd}</pre>
        </SectionBlock>

        {/* 0 条回复时整个回复模块（含标题、计数、占位）都不渲染 */}
        {detail.responses.length > 0 ? (
          <SectionBlock label={`工程师回复（${detail.responses.length}）`}>
            <Timeline
              items={detail.responses.map((response) => ({
                // AntD v6：items.children 已弃用（运行时告警），改用 items.content
                content: (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{response.engineerNickname}</span>
                      <StatusPill tone={response.resolutionStatus === 'RESOLVED' ? 'ok' : 'warn'}>
                        {RESOLUTION_STATUS_LABELS[response.resolutionStatus]}
                      </StatusPill>
                      <span className="text-xs text-text-secondary">
                        {formatDateTimeMinuteText(response.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm break-words">{response.responseText}</div>
                  </div>
                ),
                key: response.id,
              }))}
            />
          </SectionBlock>
        ) : null}

        {onBackToList ? (
          <div>
            <Button onClick={onBackToList}>返回历史列表</Button>
          </div>
        ) : null}
      </div>
    </DataCard>
  );
}
