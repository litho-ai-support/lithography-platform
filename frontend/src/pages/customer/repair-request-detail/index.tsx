// src/pages/customer/repair-request-detail/index.tsx

import { useCallback } from 'react';
import { Alert, Button, Descriptions, Popconfirm, Skeleton, Tag, Timeline } from 'antd';
import { useNavigate, useParams } from 'react-router';

import {
  RESOLUTION_STATUS_LABELS,
  useCustomerRepairRequestDetailFlow,
} from '@/features/repair-request';

import { useMessageFeedback } from '@/shared/ui/message-feedback';
import { PageHeader } from '@/shared/ui/page-header';

import { formatDate } from '../format-date';

const REPAIR_REQUESTS_LIST_PATH = '/customer/repair-requests';

/**
 * 路由接线（T-04）：从路径参数解析 requestId 后注入页面组件，页面本体保持可独立测试。
 * 非数字参数经 Number() 归为 NaN，交由页面统一的 not-found 口径处理（与后端防探测一致）。
 */
export function CustomerRepairRequestDetailRoute() {
  const { requestId } = useParams();

  return <CustomerRepairRequestDetailPage requestId={Number(requestId)} />;
}

/**
 * 客户维修申请详情页。
 *
 * 页面只负责布局与导航目标装配：加载状态机、删除命令、目标代次守卫与失败回刷
 * 均由 feature application hook（useCustomerRepairRequestDetailFlow）承担，
 * 页面不感知 adapter、代次与竞态细节。
 *
 * - requestId 由路由层（阶段三 T-04）从 useParams 注入；本组件保持可独立测试；
 * - 不存在 / 非本人 / 已删除由后端统一 NOT_FOUND（防探测），页面呈现友好错误态而非数据；
 * - 回复时间线按后端排序（createdAt ASC + id ASC）直接渲染 engineerNickname，不出现账号 ID；
 * - 仅未接单申请可删除；成功后回列表刷新（失败原因明确展示，不做乐观成功）。
 */
export function CustomerRepairRequestDetailPage({ requestId }: { requestId: number }) {
  const navigate = useNavigate();
  // 反馈端口由 ui 层注入（application 不依赖具体 UI 组件实现）
  const notify = useMessageFeedback();
  const { state, deleting, deleteRequest } = useCustomerRepairRequestDetailFlow(requestId, notify);

  // 删除成功且目标仍有效时导航回列表；目标已在途中切换/卸载或删除失败时 deleteRequest 返回 false。
  const handleDelete = useCallback(async () => {
    const deleted = await deleteRequest();

    if (deleted) {
      navigate(REPAIR_REQUESTS_LIST_PATH);
    }
  }, [deleteRequest, navigate]);

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader
          description="正在加载维修申请详情…"
          eyebrow="Repair Request Detail"
          title="维修申请详情"
        />
        {/* 与列表页「加载失败 / 不存在」共用同一页面骨架（页头 + 面板），
            面板内必须是骨架屏而非空白 div，避免出现无信息的空白面板（S2-8）。 */}
        <div className="surface-panel">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="page-stack">
        <PageHeader
          description="无法查看该维修申请。"
          eyebrow="Repair Request Detail"
          title="维修申请详情"
        />
        <div className="surface-panel">
          <Alert
            action={
              <Button onClick={() => navigate(REPAIR_REQUESTS_LIST_PATH)} size="small">
                返回列表
              </Button>
            }
            showIcon
            title={state.message}
            type={state.notFound ? 'warning' : 'error'}
          />
        </div>
      </div>
    );
  }

  const { detail } = state;

  return (
    <div className="page-stack">
      <PageHeader
        description={`申请编号：${detail.requestNo}`}
        eyebrow="Repair Request Detail"
        title="维修申请详情"
      />

      <div className="surface-panel">
        <div className="flex items-start justify-between gap-4">
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="申请编号">{detail.requestNo}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDate(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="设备型号">
              {`${detail.equipmentModel.modelName}（${detail.equipmentModel.modelCode}）`}
            </Descriptions.Item>
            <Descriptions.Item label="错误码">{detail.errorCode}</Descriptions.Item>
            <Descriptions.Item label="故障描述">
              <span className="break-words">{detail.faultDescription}</span>
            </Descriptions.Item>
            <Descriptions.Item label="接单状态">
              {detail.isAccepted
                ? `已接单（${detail.acceptedAt ? formatDate(detail.acceptedAt) : '时间未知'}）`
                : '待接单'}
            </Descriptions.Item>
          </Descriptions>

          {detail.isAccepted ? null : (
            <Popconfirm
              cancelText="取消"
              okText="确认删除"
              okButtonProps={{ loading: deleting }}
              onConfirm={() => void handleDelete()}
              title="确认删除该维修申请？"
            >
              <Button danger disabled={deleting} type="primary">
                删除申请
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>

      <div className="surface-panel">
        <div className="mb-2 font-medium">故障正文</div>
        <pre className="whitespace-pre-wrap break-words text-sm">{detail.contentMd}</pre>
      </div>

      {/* 0 条回复时整个回复模块（含标题、计数、占位）都不渲染：
          任务书要求「有回复才显示回复模块」，空计数或「暂无回复」占位会让客户误判为数据缺失。 */}
      {detail.responses.length > 0 ? (
        <div className="surface-panel">
          <div className="mb-2 font-medium">工程师回复（{detail.responses.length}）</div>
          <Timeline
            items={detail.responses.map((response) => ({
              // AntD v6：items.children 已弃用（运行时告警），改用 items.content
              content: (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{response.engineerNickname}</span>
                    <Tag color={response.resolutionStatus === 'RESOLVED' ? 'green' : 'blue'}>
                      {RESOLUTION_STATUS_LABELS[response.resolutionStatus]}
                    </Tag>
                    <span className="text-text-secondary text-xs">
                      {formatDate(response.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm break-words">{response.responseText}</div>
                </div>
              ),
              key: response.id,
            }))}
          />
        </div>
      ) : null}

      <div>
        <Button onClick={() => navigate(REPAIR_REQUESTS_LIST_PATH)}>返回列表</Button>
      </div>
    </div>
  );
}
