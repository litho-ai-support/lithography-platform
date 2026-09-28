// src/pages/customer/repair-requests/index.tsx

import { Alert, Button, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router';

import {
  type RepairRequestListItem,
  RESOLUTION_STATUS_LABELS,
  useCustomerRepairRequestList,
} from '@/features/repair-request';

import { useMessageFeedback } from '@/shared/ui/message-feedback';
import { PageHeader } from '@/shared/ui/page-header';

import { formatDate } from '../format-date';

// 详情路由（T-04 注册；阶段一先以组件形式开发，测试经 MemoryRouter 验证导航意图）
const detailPath = (id: number) => `/customer/repair-requests/${id}`;

/**
 * 客户「我的维修申请」列表页。
 *
 * 页面只负责布局与导航目标装配：列表 query、删除命令、分页回退、竞态防护与错误归一
 * 均由 feature application hook（useCustomerRepairRequestList）承担，页面不感知 adapter。
 *
 * - 仅未接单申请显示删除按钮；删除需二次确认、进行中防连点；
 * - 删除失败展示明确原因（如已接单不可删），失败后刷新数据态，不做乐观成功（由 hook 完成）；
 * - 越权/已删除/不存在由后端统一拒绝，页面仅呈现加载失败与空态。
 */
export function CustomerRepairRequestsPage() {
  const navigate = useNavigate();
  // 反馈端口由 ui 层注入（application 不依赖具体 UI 组件实现）
  const notify = useMessageFeedback();
  const { state, deletingId, deleteRequest, goToPage, retry } =
    useCustomerRepairRequestList(notify);

  // 长连续文本（申请编号 / 型号 / 错误码）安全换行，不撑破表格与页面（S2-5）
  const columns: ColumnsType<RepairRequestListItem> = [
    {
      title: '申请编号',
      className: 'break-words',
      dataIndex: 'requestNo',
      key: 'requestNo',
    },
    {
      title: '设备型号',
      className: 'break-words',
      key: 'equipmentModel',
      render: (_, record) => record.equipmentModel.modelName,
    },
    {
      title: '错误码',
      className: 'break-words',
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
              onConfirm={() => void deleteRequest(record.id)}
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
      <PageHeader
        description="查看自己提交的维修申请、接单情况与处理进度。"
        eyebrow="My Repair Requests"
        title="我的维修申请"
      />

      <div className="surface-panel">
        {/* 失败态与空表互斥：失败时只呈现失败信息与重试入口，不叠加「还没有维修申请」空态，
            否则用户会把加载失败误读为「本人确实没有申请」（S2-3）。 */}
        {state.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={retry} size="small">
                重试
              </Button>
            }
            showIcon
            title={state.message}
            type="error"
          />
        ) : (
          <Table
            columns={columns}
            dataSource={state.status === 'ready' ? state.data.items : []}
            loading={state.status === 'loading'}
            locale={{
              // 空态只属于「已就绪且库为空」；加载中不提前给出「还没有维修申请」，
              // 避免用户把未返回的结果误读为空库（S2-3）
              emptyText:
                state.status === 'ready'
                  ? '还没有维修申请，点击客户首页「发起维修申请」创建。'
                  : null,
            }}
            pagination={
              state.status === 'ready'
                ? {
                    current: state.data.page,
                    pageSize: state.data.pageSize,
                    showSizeChanger: false,
                    total: state.data.total,
                    onChange: (page, pageSize) => goToPage(page, pageSize),
                  }
                : false
            }
            rowKey="id"
            // 七列在窄视口必然超出：横滚只允许发生在表格内部（基准 §6.4.4），
            // 整页不得横滚（C3 响应式）。列内长连续文本仍由 className="break-words" 换行。
            scroll={{ x: 960 }}
          />
        )}
      </div>
    </div>
  );
}
