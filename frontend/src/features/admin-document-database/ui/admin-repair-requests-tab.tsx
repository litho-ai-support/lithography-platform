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
  Tooltip,
} from 'antd';

import { formatDateTimeText } from '@/shared/ui/format-date-time';
import { KbSearchField, KbToolbarButton } from '@/shared/ui/knowledge-base';
import { StatusPill } from '@/shared/ui/status-pill';

import { useAdminRepairRequestSummary } from '../application/use-admin-document-detail';
import { useAdminDocumentList } from '../application/use-admin-document-list';
import { useDebouncedValue } from '../application/use-debounced-value';
import type {
  AdminRepairRequestFilter,
  AdminRepairRequestListItem,
} from '../infrastructure/admin-document-database.types';
import {
  fetchAdminEquipmentModelOptions,
  fetchAdminRepairRequests,
} from '../infrastructure/admin-document-database-adapter';

import { AdminCreatedAtFilter } from './admin-created-at-filter';
import { type AdminCreatedAtRangeState, toAdminCreatedAtRange } from './admin-created-at-range';
import { toEffectiveAdminFilter } from './admin-effective-filter';
import { AdminListStates } from './admin-list-states';

const RESOLUTION_STATUS_LABELS: Record<'PENDING' | 'RESOLVED', string> = {
  PENDING: '处理中',
  RESOLVED: '已解决',
};

/** 维修申请标签：管理员全局只读列表 + 组合筛选 + 只读摘要（不创建维护记录管理）
 *
 * PR3 R7 S5：整体迁入单张知识库卡（卡内工具区 + 主搜索 + 筛选展开区 +
 * 紧凑表格 + 卡底分页）；精确条件全部保留，仅常态入口收进「筛选」。 */
export function AdminRepairRequestsTab() {
  const [requestNoKeyword, setRequestNoKeyword] = useState('');
  const [customerKeyword, setCustomerKeyword] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [isAccepted, setIsAccepted] = useState<boolean | undefined>(undefined);
  const [equipmentModelId, setEquipmentModelId] = useState<number | undefined>(undefined);
  const [createdAtRange, setCreatedAtRange] = useState<AdminCreatedAtRangeState>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
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

  // R4 有效筛选单一真源：请求参数、reloadKey、hasActiveFilter 从同一份对象派生
  const effectiveFilter = useMemo(
    () =>
      toEffectiveAdminFilter<AdminRepairRequestFilter>({
        requestNo: debouncedRequestNo,
        customerKeyword: debouncedCustomer,
        errorCode: debouncedErrorCode,
        isAccepted,
        equipmentModelId,
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
  // 筛选变化触发回第 1 页；请求序号竞态防护在列表 hook 内
  const reloadKey = JSON.stringify(effectiveFilter);
  const hasActiveFilter = Object.keys(effectiveFilter).length > 0;

  const resetFilters = () => {
    setRequestNoKeyword('');
    setCustomerKeyword('');
    setErrorCode('');
    setIsAccepted(undefined);
    setEquipmentModelId(undefined);
    setCreatedAtRange(null);
  };

  const fetcher = useMemo(
    () => (page: number, pageSize: number) =>
      fetchAdminRepairRequests(page, pageSize, effectiveFilter),
    [effectiveFilter],
  );

  const { state, goToPage, reload } = useAdminDocumentList<AdminRepairRequestListItem>(
    fetcher,
    reloadKey,
    {
      failureMessage: '维修申请列表加载失败，请稍后重试。',
    },
  );
  const summary = useAdminRepairRequestSummary(summaryRequestId);

  // 紧凑列宽 + ellipsis/Tooltip：scroll.x 由 1350 收紧到 1040，1366 视口即可完整可见；
  // 操作列 fixed right 作为窄视口下的可发现性保障（字段一个不删，PR3 R7 S5/视觉报告 3.5）
  const columns = useMemo<TableColumnsType<AdminRepairRequestListItem>>(
    () => [
      // 申请编号 / 客户为变长文本：与公司、设备型号同用 ellipsis + Tooltip，
      // 避免长昵称或真实 RR 编号在紧凑列宽下换行把行高撑到两行（PR3 R7 S5 表格密度）
      {
        dataIndex: 'requestNo',
        key: 'requestNo',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
        title: '申请编号',
        width: 136,
      },
      {
        dataIndex: 'customerNickname',
        key: 'customerNickname',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
        title: '客户',
        width: 92,
      },
      {
        dataIndex: 'companyName',
        key: 'companyName',
        ellipsis: true,
        render: (value: string | null) => (
          <Tooltip title={value ?? '—'}>
            <span>{value ?? '—'}</span>
          </Tooltip>
        ),
        title: '公司',
        width: 136,
      },
      {
        dataIndex: 'equipmentModelName',
        key: 'equipmentModelName',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
        title: '设备型号',
        width: 168,
      },
      { dataIndex: 'errorCode', key: 'errorCode', title: '故障码', width: 92 },
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
        width: 92,
      },
      {
        dataIndex: 'latestResolutionStatus',
        key: 'latestResolutionStatus',
        render: (value: 'PENDING' | 'RESOLVED' | null) =>
          value ? RESOLUTION_STATUS_LABELS[value] : '—',
        title: '处理状态',
        width: 92,
      },
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value: string) => formatDateTimeText(value),
        title: '创建时间',
        width: 140,
      },
      {
        fixed: 'right',
        key: 'actions',
        render: (_value, record) => (
          <Button onClick={() => setSummaryRequestId(record.id)} size="small" type="link">
            摘要
          </Button>
        ),
        title: '操作',
        width: 92,
      },
    ],
    [],
  );

  return (
    <div className="kb-card">
      {/* 卡内工具区（PR3 R7 S5）：主搜索 + 筛选入口；其余精确条件全部保留，
          只是从常态平铺收进「筛选」展开区（视觉报告 3.4 工具区差异） */}
      <div className="kb-toolbar">
        <KbSearchField
          clearLabel="清除申请编号搜索"
          onChange={setRequestNoKeyword}
          placeholder="按申请编号搜索"
          value={requestNoKeyword}
        />
        <KbToolbarButton
          active={hasActiveFilter}
          aria-expanded={filterPanelOpen}
          onClick={() => setFilterPanelOpen((previous) => !previous)}
        >
          筛选
        </KbToolbarButton>
      </div>

      {filterPanelOpen ? (
        <div className="kb-filter-panel">
          <Input
            allowClear
            maxLength={100}
            placeholder="按客户昵称/公司搜索"
            style={{ width: 200 }}
            value={customerKeyword}
            onChange={(event) => setCustomerKeyword(event.target.value)}
          />
          <Input
            allowClear
            maxLength={100}
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
          <KbToolbarButton onClick={resetFilters}>重置</KbToolbarButton>
        </div>
      ) : null}

      {modelsFailed ? (
        /* 型号告警与表格同卡（PR3 R7 S5 四态同卡要求） */
        <div className="kb-card-state">
          <Alert
            showIcon
            title="设备型号选项加载失败，型号筛选暂不可用，可继续使用其他筛选。"
            type="warning"
          />
        </div>
      ) : null}

      <AdminListStates
        emptyLabel="暂无维修申请。"
        filteredEmptyLabel="没有符合筛选条件的维修申请。"
        hasActiveFilter={hasActiveFilter}
        onRetry={reload}
        state={state}
        variant="knowledge-base"
      >
        {state.status === 'ready' && state.total > 0 ? (
          <>
            <div className="kb-table-scope">
              <Table<AdminRepairRequestListItem>
                columns={columns}
                dataSource={state.items}
                pagination={false}
                rowKey="id"
                scroll={{ x: 1040 }}
              />
            </div>
            <div className="kb-card-footer">
              <span>共 {state.total} 条</span>
              <Pagination
                current={state.page}
                onChange={goToPage}
                pageSize={state.pageSize}
                showSizeChanger={false}
                size="small"
                total={state.total}
              />
            </div>
          </>
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
