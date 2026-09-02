// src/pages/customer/repair-requests/index.tsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Popconfirm, Space, Table, Tag } from 'antd';
import { message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router';

import {
  deleteMyRepairRequest,
  fetchMyRepairRequests,
  type RepairRequestListItem,
  type RepairRequestListPage,
  type RepairRequestListPagination,
  RESOLUTION_STATUS_LABELS,
} from '@/features/repair-request';

import { isGraphQLIngressError } from '@/shared/graphql';
import { PageHeader } from '@/shared/ui/page-header';

import { formatDate } from '../format-date';

// 详情路由（T-04 注册；阶段一先以组件形式开发，测试经 MemoryRouter 验证导航意图）
const detailPath = (id: number) => `/customer/repair-requests/${id}`;

type ListState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; data: RepairRequestListPage };

function toUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : '维修申请列表加载失败，请稍后重试。';
}

/** 删除后当前页可能删空：回退一页避免停留在空页 */
function resolvePageAfterDelete(page: number, pageSize: number, total: number): number {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(page, lastPage);
}

// 列表每页条数：正式产品默认值；评审演示的分页需求不写入生产代码（review 裁定）。
const PAGE_SIZE = 10;

/**
 * 客户「我的维修申请」列表页。
 *
 * - 数据经 feature 统一出口（阶段一 Mock，阶段三切真实 adapter，页面零改动）；
 * - 仅未接单申请显示删除按钮；删除需二次确认、进行中防连点；
 * - 删除失败展示明确原因（如已接单不可删），失败后刷新数据态，不做乐观成功；
 * - 越权/已删除/不存在由后端统一拒绝，页面仅呈现加载失败与空态。
 */
export function CustomerRepairRequestsPage() {
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [pagination, setPagination] = useState<RepairRequestListPagination>({
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const deletingRef = useRef(false);

  // loading 置位不在 loadList 内同步做（react-hooks/set-state-in-effect）：
  // 首次加载由初始状态覆盖，翻页/重试/删除后刷新在事件处理器中显式置位。
  const loadList = useCallback(async (target: RepairRequestListPagination) => {
    try {
      const data = await fetchMyRepairRequests(target);
      setListState({ status: 'ready', data });
    } catch (error) {
      setListState({ status: 'failed', message: toUserMessage(error) });
    }
  }, []);

  useEffect(() => {
    // 微任务中发起：effect 同步链路不触发 setState（react-hooks/set-state-in-effect）
    queueMicrotask(() => void loadList(pagination));
  }, [loadList, pagination]);

  const retryLoad = useCallback(() => {
    setListState({ status: 'loading' });
    void loadList(pagination);
  }, [loadList, pagination]);

  const handleDelete = useCallback(
    async (id: number) => {
      if (deletingRef.current) {
        return;
      }

      deletingRef.current = true;
      setDeletingId(id);

      try {
        const result = await deleteMyRepairRequest(id);

        if (result.ok) {
          message.success('维修申请已删除。');
          // 删除入口仅在 ready 态可达；按删除后的 total 计算回退页，非 ready 兕底停留当前页
          const nextPage =
            listState.status === 'ready'
              ? resolvePageAfterDelete(
                  listState.data.page,
                  pagination.pageSize,
                  listState.data.total - 1,
                )
              : pagination.page;

          if (nextPage !== pagination.page) {
            setListState({ status: 'loading' });
            setPagination({ ...pagination, page: nextPage });
          } else {
            setListState({ status: 'loading' });
            void loadList(pagination);
          }
        } else {
          // 删除失败必须给出明确原因，并刷新数据态（不得当作删除成功）
          message.error(result.message);
          setListState({ status: 'loading' });
          void loadList(pagination);
        }
      } catch (error) {
        message.error(isGraphQLIngressError(error) ? error.userMessage : '删除失败，请稍后重试。');
        setListState({ status: 'loading' });
        void loadList(pagination);
      } finally {
        deletingRef.current = false;
        setDeletingId(null);
      }
    },
    [listState, loadList, pagination],
  );

  const columns: ColumnsType<RepairRequestListItem> = [
    {
      title: '申请编号',
      dataIndex: 'requestNo',
      key: 'requestNo',
    },
    {
      title: '设备型号',
      key: 'equipmentModel',
      render: (_, record) => record.equipmentModel.modelName,
    },
    {
      title: '错误码',
      dataIndex: 'errorCode',
      key: 'errorCode',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDate(value),
    },
    {
      title: '接单状态',
      key: 'isAccepted',
      render: (_, record) =>
        record.isAccepted ? <Tag color="green">已接单</Tag> : <Tag>待接单</Tag>,
    },
    {
      title: '处理进度',
      key: 'latestResolutionStatus',
      render: (_, record) =>
        record.latestResolutionStatus ? (
          <Tag color="blue">{RESOLUTION_STATUS_LABELS[record.latestResolutionStatus]}</Tag>
        ) : (
          <span className="text-text-secondary">暂无回复</span>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button size="small" type="link" onClick={() => navigate(detailPath(record.id))}>
            查看详情
          </Button>
          {record.isAccepted ? null : (
            <Popconfirm
              cancelText="取消"
              okText="确认删除"
              okButtonProps={{ loading: deletingId === record.id }}
              onConfirm={() => void handleDelete(record.id)}
              title="确认删除该维修申请？"
            >
              <Button danger disabled={deletingId !== null} size="small" type="link">
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader description="查看自己提交的维修申请、接单情况与处理进度。" title="我的维修申请" />

      <div className="surface-panel">
        {listState.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={retryLoad} size="small">
                重试
              </Button>
            }
            showIcon
            title={listState.message}
            type="error"
          />
        ) : null}

        <Table
          columns={columns}
          dataSource={listState.status === 'ready' ? listState.data.items : []}
          loading={listState.status === 'loading'}
          locale={{ emptyText: '还没有维修申请，点击客户首页「发起维修申请」创建。' }}
          pagination={
            listState.status === 'ready'
              ? {
                  current: listState.data.page,
                  pageSize: listState.data.pageSize,
                  showSizeChanger: false,
                  total: listState.data.total,
                  onChange: (page, pageSize) => {
                    setListState({ status: 'loading' });
                    setPagination({ page, pageSize });
                  },
                }
              : false
          }
          rowKey="id"
        />
      </div>
    </div>
  );
}
