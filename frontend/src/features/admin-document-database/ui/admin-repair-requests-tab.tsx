// src/features/admin-document-database/ui/admin-repair-requests-tab.tsx

import { useEffect, useMemo, useState } from 'react';
import type { TableColumnsType } from 'antd';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  Pagination,
  Select,
  Skeleton,
  Table,
} from 'antd';

import { formatDateTimeText } from '@/shared/ui/format-date-time';
import { StatusPill } from '@/shared/ui/status-pill';

import { useAdminRepairRequestSummary } from '../application/use-admin-document-detail';
import { useAdminDocumentList } from '../application/use-admin-document-list';
import { useDebouncedValue } from '../application/use-debounced-value';
import type { AdminRepairRequestListItem } from '../infrastructure/admin-document-database.types';
import {
  fetchAdminEquipmentModelOptions,
  fetchAdminRepairRequests,
} from '../infrastructure/admin-document-database-adapter';

import { AdminCreatedAtFilter } from './admin-created-at-filter';
import { type AdminCreatedAtRangeState, toAdminCreatedAtRange } from './admin-created-at-range';
import { AdminListStates } from './admin-list-states';

const RESOLUTION_STATUS_LABELS: Record<'PENDING' | 'RESOLVED', string> = {
  PENDING: '处理中',
  RESOLVED: '已解决',
};

/** 维修申请标签：管理员全局只读列表 + 组合筛选 + 只读摘要（不创建维护记录管理） */
export function AdminRepairRequestsTab() {
  const [requestNoKeyword, setRequestNoKeyword] = useState('');
  const [customerKeyword, setCustomerKeyword] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [isAccepted, setIsAccepted] = useState<boolean | undefined>(undefined);
  const [equipmentModelId, setEquipmentModelId] = useState<number | undefined>(undefined);
  const [createdAtRange, setCreatedAtRange] = useState<AdminCreatedAtRangeState>(null);
  const [summaryRequestId, setSummaryRequestId] = useState<number | null>(null);
  // 设备型号下拉：调用本 feature 自己的 adapter（fetchAdminEquipmentModelOptions），
  // 保持 feature 之间不直接跨依赖（frontend/docs/dependency-rules.md）。
  // 注：equipmentModels 查询目前在 reference-document / repair-request / 本 feature
  //   三处各自实现，后续宜提升为 entity/shared 公开读 API 统一去重（PR3 review 建议项）。
  const [modelOptions, setModelOptions] = useState<
    { id: number; modelCode: string; modelName: string }[]
  >([]);
  const [modelsFailed, setModelsFailed] = useState(false);

  useEffect(() => {
    let disposed = false;

    fetchAdminEquipmentModelOptions()
      .then((models) => {
        if (!disposed) {
          setModelOptions(models);
        }
      })
      .catch(() => {
        if (!disposed) {
          setModelsFailed(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  const debouncedRequestNo = useDebouncedValue(requestNoKeyword.trim());
  const debouncedCustomer = useDebouncedValue(customerKeyword.trim());
  const debouncedErrorCode = useDebouncedValue(errorCode.trim());
  const timeFilter = toAdminCreatedAtRange(createdAtRange);

  // reloadKey：筛选变化触发回第 1 页；请求序号竞态防护在列表 hook 内
  const reloadKey = JSON.stringify({
    requestNo: debouncedRequestNo,
    customerKeyword: debouncedCustomer,
    errorCode: debouncedErrorCode,
    isAccepted,
    equipmentModelId,
    ...timeFilter,
  });
  const hasActiveFilter = reloadKey !== JSON.stringify({});

  const fetcher = useMemo(
    () => (page: number, pageSize: number) =>
      fetchAdminRepairRequests(page, pageSize, {
        ...(debouncedRequestNo ? { requestNo: debouncedRequestNo } : {}),
        ...(debouncedCustomer ? { customerKeyword: debouncedCustomer } : {}),
        ...(debouncedErrorCode ? { errorCode: debouncedErrorCode } : {}),
        ...(isAccepted !== undefined ? { isAccepted } : {}),
        ...(equipmentModelId !== undefined ? { equipmentModelId } : {}),
        ...timeFilter,
      }),
    [
      debouncedRequestNo,
      debouncedCustomer,
      debouncedErrorCode,
      isAccepted,
      equipmentModelId,
      timeFilter,
    ],
  );

  const { state, goToPage, reload } = useAdminDocumentList<AdminRepairRequestListItem>(
    fetcher,
    reloadKey,
    {
      failureMessage: '维修申请列表加载失败，请稍后重试。',
    },
  );
  const summary = useAdminRepairRequestSummary(summaryRequestId);

  const columns = useMemo<TableColumnsType<AdminRepairRequestListItem>>(
    () => [
      { dataIndex: 'requestNo', key: 'requestNo', title: '申请编号', width: 160 },
      { dataIndex: 'customerNickname', key: 'customerNickname', title: '客户', width: 120 },
      {
        dataIndex: 'companyName',
        key: 'companyName',
        ellipsis: true,
        render: (value: string | null) => value ?? '—',
        title: '公司',
        width: 150,
      },
      {
        dataIndex: 'equipmentModelName',
        key: 'equipmentModelName',
        ellipsis: true,
        title: '设备型号',
        width: 170,
      },
      { dataIndex: 'errorCode', key: 'errorCode', title: '故障码', width: 120 },
      {
        dataIndex: 'isAccepted',
        key: 'isAccepted',
        render: (value: boolean) =>
          value ? (
            <StatusPill tone="ok">已接单</StatusPill>
          ) : (
            <StatusPill tone="warn">待接单</StatusPill>
          ),
        title: '接单状态',
        width: 100,
      },
      {
        dataIndex: 'latestResolutionStatus',
        key: 'latestResolutionStatus',
        render: (value: 'PENDING' | 'RESOLVED' | null) =>
          value ? RESOLUTION_STATUS_LABELS[value] : '—',
        title: '处理状态',
        width: 100,
      },
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
          <Button onClick={() => setSummaryRequestId(record.id)} size="small" type="link">
            摘要
          </Button>
        ),
        title: '操作',
        width: 80,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          allowClear
          placeholder="按申请编号搜索"
          style={{ width: 180 }}
          value={requestNoKeyword}
          onChange={(event) => setRequestNoKeyword(event.target.value)}
        />
        <Input
          allowClear
          placeholder="按客户昵称/公司搜索"
          style={{ width: 200 }}
          value={customerKeyword}
          onChange={(event) => setCustomerKeyword(event.target.value)}
        />
        <Input
          allowClear
          placeholder="输入完整故障码"
          style={{ width: 150 }}
          value={errorCode}
          onChange={(event) => setErrorCode(event.target.value)}
        />
        <Select
          allowClear
          placeholder="接单状态"
          style={{ width: 130 }}
          value={isAccepted}
          onChange={(value) => setIsAccepted(value)}
          options={[
            { label: '已接单', value: true },
            { label: '待接单', value: false },
          ]}
        />
        <Select
          allowClear
          placeholder="设备型号"
          style={{ width: 220 }}
          value={equipmentModelId}
          onChange={(value) => setEquipmentModelId(value)}
          options={modelOptions.map((model) => ({
            label: `${model.modelName}（${model.modelCode}）`,
            value: model.id,
          }))}
        />
        <AdminCreatedAtFilter onChange={setCreatedAtRange} value={createdAtRange} />
      </div>

      {modelsFailed ? (
        <Alert
          showIcon
          title="设备型号选项加载失败，型号筛选暂不可用，可继续使用其他筛选。"
          type="warning"
        />
      ) : null}

      <AdminListStates
        emptyLabel="暂无维修申请。"
        filteredEmptyLabel="没有符合筛选条件的维修申请。"
        hasActiveFilter={hasActiveFilter}
        onRetry={reload}
        state={state}
      >
        {state.status === 'ready' && state.total > 0 ? (
          <div className="flex flex-col gap-4">
            <Table<AdminRepairRequestListItem>
              columns={columns}
              dataSource={state.items}
              pagination={false}
              rowKey="id"
              scroll={{ x: 1350 }}
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

      <Drawer
        destroyOnHidden
        onClose={() => setSummaryRequestId(null)}
        open={summaryRequestId !== null}
        title={`维修申请摘要${summary.state.status === 'ready' ? ` · ${summary.state.detail.requestNo}` : ''}`}
        size="large"
      >
        {summary.state.status === 'loading' ? <Skeleton active /> : null}
        {summary.state.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={summary.retry} size="small">
                重试
              </Button>
            }
            title={summary.state.message}
            showIcon
            type="error"
          />
        ) : null}
        {summary.state.status === 'ready' ? (
          <div className="flex flex-col gap-4">
            <Descriptions
              column={1}
              items={[
                { key: 'customer', label: '客户', children: summary.state.detail.customerNickname },
                {
                  key: 'company',
                  label: '公司',
                  children: summary.state.detail.companyName ?? '—',
                },
                {
                  key: 'model',
                  label: '设备型号',
                  children: `${summary.state.detail.equipmentModelName}（${summary.state.detail.equipmentModelCode}）`,
                },
                { key: 'errorCode', label: '故障码', children: summary.state.detail.errorCode },
                {
                  key: 'fault',
                  label: '故障描述',
                  children: summary.state.detail.faultDescription || '—',
                },
                {
                  key: 'accepted',
                  label: '接单',
                  children: summary.state.detail.isAccepted
                    ? `${summary.state.detail.acceptedByEngineerNickname ?? '—'} · ${summary.state.detail.acceptedAt ? formatDateTimeText(summary.state.detail.acceptedAt) : '—'}`
                    : '待接单',
                },
                {
                  key: 'createdAt',
                  label: '创建时间',
                  children: formatDateTimeText(summary.state.detail.createdAt),
                },
              ]}
              size="small"
            />
            <div>
              <p className="mb-2 font-medium">申请正文</p>
              <pre className="max-h-[420px] overflow-auto rounded border border-[var(--panel-border)] bg-[var(--filter-bar-bg)] p-3 text-xs whitespace-pre-wrap">
                {summary.state.detail.contentMd}
              </pre>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
