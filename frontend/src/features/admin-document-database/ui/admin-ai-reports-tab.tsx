// src/features/admin-document-database/ui/admin-ai-reports-tab.tsx

import { useMemo, useState } from 'react';
import type { TableColumnsType } from 'antd';
import { Alert, Button, Drawer, Input, Pagination, Skeleton, Table, Tooltip } from 'antd';

import { FilterBar } from '@/shared/ui/filter-bar';
import { formatDateTimeText } from '@/shared/ui/format-date-time';
import { TableContainer } from '@/shared/ui/table-container';

import { useAdminAiReportDetail } from '../application/use-admin-document-detail';
import { useAdminDocumentList } from '../application/use-admin-document-list';
import { useDebouncedValue } from '../application/use-debounced-value';
import type {
  AdminAiReportFilter,
  AdminAiReportListItem,
} from '../infrastructure/admin-document-database.types';
import { fetchAdminAiReports } from '../infrastructure/admin-document-database-adapter';

import { AdminCreatedAtFilter } from './admin-created-at-filter';
import { type AdminCreatedAtRangeState, toAdminCreatedAtRange } from './admin-created-at-range';
import { toEffectiveAdminFilter } from './admin-effective-filter';
import { AdminListStates } from './admin-list-states';

/**
 * AI 报告标签：只读列表 + 只读正文详情；不提供生成、训练、修改、删除控件
 * （计划表 S3 明确不做）。requestNo 以会话归属申请为权威（M-04 裁定），
 * requestMismatch=true 时显示审计警示。
 */
export function AdminAiReportsTab() {
  const [requestNoKeyword, setRequestNoKeyword] = useState('');
  const [engineerKeyword, setEngineerKeyword] = useState('');
  const [reportType, setReportType] = useState('');
  const [createdAtRange, setCreatedAtRange] = useState<AdminCreatedAtRangeState>(null);
  const [detailReportId, setDetailReportId] = useState<number | null>(null);

  const debouncedRequestNo = useDebouncedValue(requestNoKeyword.trim());
  const debouncedEngineer = useDebouncedValue(engineerKeyword.trim());
  const debouncedReportType = useDebouncedValue(reportType.trim());
  const timeFilter = toAdminCreatedAtRange(createdAtRange);

  // R4 有效筛选单一真源：请求参数、reloadKey、hasActiveFilter 从同一份对象派生
  const effectiveFilter = useMemo(
    () =>
      toEffectiveAdminFilter<AdminAiReportFilter>({
        requestNo: debouncedRequestNo,
        engineerKeyword: debouncedEngineer,
        reportType: debouncedReportType,
        ...timeFilter,
      }),
    [debouncedRequestNo, debouncedEngineer, debouncedReportType, timeFilter],
  );
  // 筛选变化触发回第 1 页；请求序号竞态防护在列表 hook 内
  const reloadKey = JSON.stringify(effectiveFilter);
  const hasActiveFilter = Object.keys(effectiveFilter).length > 0;

  const fetcher = useMemo(
    () => (page: number, pageSize: number) => fetchAdminAiReports(page, pageSize, effectiveFilter),
    [effectiveFilter],
  );

  const { state, goToPage, reload } = useAdminDocumentList<AdminAiReportListItem>(
    fetcher,
    reloadKey,
    {
      failureMessage: 'AI 报告列表加载失败，请稍后重试。',
    },
  );
  const detail = useAdminAiReportDetail(detailReportId);

  const columns = useMemo<TableColumnsType<AdminAiReportListItem>>(
    () => [
      {
        dataIndex: 'reportTitle',
        key: 'reportTitle',
        ellipsis: true,
        title: '报告标题',
        width: 240,
      },
      { dataIndex: 'reportType', key: 'reportType', title: '报告类型', width: 130 },
      {
        dataIndex: 'requestNo',
        key: 'requestNo',
        render: (value: string, record) =>
          record.requestMismatch ? (
            <Tooltip title="数据审计：报告记录自身携带的申请与会话归属申请不一致，展示以会话归属为准。">
              <span className="text-[var(--ant-color-warning)]">{value} ⚠</span>
            </Tooltip>
          ) : (
            value
          ),
        title: '关联申请',
        width: 170,
      },
      { dataIndex: 'engineerNickname', key: 'engineerNickname', title: '工程师', width: 120 },
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value: string) => formatDateTimeText(value),
        title: '创建时间',
        width: 170,
      },
      {
        key: 'actions',
        render: (_value, record) => (
          <Button onClick={() => setDetailReportId(record.id)} size="small" type="link">
            正文
          </Button>
        ),
        title: '操作',
        width: 80,
      },
    ],
    [],
  );

  return (
    <div className="flex min-w-0 flex-col">
      {/* 根层不设 gap：FilterBar 自带 margin（12px 0 14px）即唯一边距真源，
          避免其 14px 下边距再叠加 16px flex gap（负责人 0922 复查 B1）。 */}
      <FilterBar>
        <Input
          allowClear
          maxLength={64}
          placeholder="按关联申请编号搜索"
          style={{ width: 200 }}
          value={requestNoKeyword}
          onChange={(event) => setRequestNoKeyword(event.target.value)}
        />
        <Input
          allowClear
          maxLength={100}
          placeholder="按工程师昵称/公司搜索"
          style={{ width: 200 }}
          value={engineerKeyword}
          onChange={(event) => setEngineerKeyword(event.target.value)}
        />
        <Input
          allowClear
          maxLength={100}
          placeholder="按报告类型筛选"
          style={{ width: 160 }}
          value={reportType}
          onChange={(event) => setReportType(event.target.value)}
        />
        <AdminCreatedAtFilter onChange={setCreatedAtRange} value={createdAtRange} />
      </FilterBar>

      <TableContainer>
        <AdminListStates
          emptyLabel="暂无 AI 报告。"
          filteredEmptyLabel="没有符合筛选条件的 AI 报告。"
          hasActiveFilter={hasActiveFilter}
          onRetry={reload}
          state={state}
        >
          {state.status === 'ready' && state.total > 0 ? (
            <div className="flex min-w-0 flex-col gap-4">
              <Table<AdminAiReportListItem>
                columns={columns}
                dataSource={state.items}
                pagination={false}
                rowKey="id"
                scroll={{ x: 1000 }}
              />
              <div className="flex justify-end">
                <Pagination
                  current={state.page}
                  onChange={goToPage}
                  pageSize={state.pageSize}
                  showSizeChanger={false}
                  showTotal={(total) => `共 ${total} 条`}
                  total={state.total}
                />
              </div>
            </div>
          ) : null}
        </AdminListStates>
      </TableContainer>

      <Drawer
        destroyOnHidden
        onClose={() => setDetailReportId(null)}
        open={detailReportId !== null}
        title={detail.state.status === 'ready' ? detail.state.detail.reportTitle : 'AI 报告正文'}
        size="large"
      >
        {detail.state.status === 'loading' ? <Skeleton active /> : null}
        {detail.state.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={detail.retry} size="small">
                重试
              </Button>
            }
            title={detail.state.message}
            showIcon
            type="error"
          />
        ) : null}
        {detail.state.status === 'ready' ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-[var(--text-muted)]">
              类型 {detail.state.detail.reportType} · 关联申请 {detail.state.detail.requestNo}
              {detail.state.detail.requestMismatch
                ? '（审计标记：与会话归属申请不一致）'
                : ''} · {detail.state.detail.engineerNickname} ·{' '}
              {formatDateTimeText(detail.state.detail.createdAt)}
            </p>
            <pre className="max-h-[560px] overflow-auto rounded border border-[var(--panel-border)] bg-[var(--filter-bar-bg)] p-3 text-xs whitespace-pre-wrap">
              {detail.state.detail.contentMd}
            </pre>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
