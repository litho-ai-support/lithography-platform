// src/pages/customer/repair-request-detail/index.tsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Popconfirm, Tag, Timeline, Typography } from 'antd';
import { message } from 'antd';
import { useNavigate, useParams } from 'react-router';

import {
  deleteMyRepairRequest,
  fetchMyRepairRequest,
  type RepairRequestDetail,
  RESOLUTION_STATUS_LABELS,
} from '@/features/repair-request';

import { isGraphQLIngressError } from '@/shared/graphql';
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

type DetailState =
  | { status: 'loading' }
  | { status: 'failed'; message: string; notFound: boolean }
  | { status: 'ready'; detail: RepairRequestDetail };

/**
 * 客户维修申请详情页。
 *
 * - requestId 由路由层（阶段三 T-04）从 useParams 注入；本组件保持可独立测试；
 * - 不存在 / 非本人 / 已删除由后端统一 NOT_FOUND（防探测），页面呈现友好错误态而非数据；
 * - 回复时间线按后端排序（createdAt ASC + id ASC）直接渲染 engineerNickname，不出现账号 ID；
 * - 仅未接单申请可删除；成功后回列表刷新（失败原因明确展示，不做乐观成功）。
 */
export function CustomerRepairRequestDetailPage({ requestId }: { requestId: number }) {
  const navigate = useNavigate();
  const [detailState, setDetailState] = useState<DetailState>({ status: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  // loading 置位不在 loadDetail 内同步做（react-hooks/set-state-in-effect）：
  // 首次加载由初始状态覆盖，删除失败后刷新在事件处理器中显式置位。
  const loadDetail = useCallback(async (id: number) => {
    try {
      const result = await fetchMyRepairRequest(id);

      if (result.ok) {
        setDetailState({ status: 'ready', detail: result.detail });
      } else {
        // 分类依据显式化：只有 not-found 呈现 warning 态，未来新增 failure reason 不会误分类
        setDetailState({
          status: 'failed',
          message: result.message,
          notFound: result.reason === 'not-found',
        });
      }
    } catch (error) {
      setDetailState({
        status: 'failed',
        message: isGraphQLIngressError(error)
          ? error.userMessage
          : '维修申请详情加载失败，请稍后重试。',
        notFound: false,
      });
    }
  }, []);

  useEffect(() => {
    // 微任务中发起：effect 同步链路不触发 setState（react-hooks/set-state-in-effect）
    queueMicrotask(() => void loadDetail(requestId));
  }, [loadDetail, requestId]);

  const handleDelete = useCallback(async () => {
    if (deletingRef.current) {
      return;
    }

    deletingRef.current = true;
    setDeleting(true);

    try {
      const result = await deleteMyRepairRequest(requestId);

      if (result.ok) {
        message.success('维修申请已删除。');
        navigate(REPAIR_REQUESTS_LIST_PATH);
      } else {
        message.error(result.message);
        setDetailState({ status: 'loading' });
        void loadDetail(requestId);
      }
    } catch (error) {
      message.error(isGraphQLIngressError(error) ? error.userMessage : '删除失败，请稍后重试。');
      setDetailState({ status: 'loading' });
      void loadDetail(requestId);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [loadDetail, navigate, requestId]);

  if (detailState.status === 'loading') {
    return (
      <div className="page-stack">
        <PageHeader description="正在加载维修申请详情…" title="维修申请详情" />
        <div className="surface-panel" />
      </div>
    );
  }

  if (detailState.status === 'failed') {
    return (
      <div className="page-stack">
        <PageHeader description="无法查看该维修申请。" title="维修申请详情" />
        <div className="surface-panel">
          <Alert
            action={
              <Button onClick={() => navigate(REPAIR_REQUESTS_LIST_PATH)} size="small">
                返回列表
              </Button>
            }
            showIcon
            title={detailState.message}
            type={detailState.notFound ? 'warning' : 'error'}
          />
        </div>
      </div>
    );
  }

  const { detail } = detailState;

  return (
    <div className="page-stack">
      <PageHeader description={`申请编号：${detail.requestNo}`} title="维修申请详情" />

      <div className="surface-panel">
        <div className="flex items-start justify-between gap-4">
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="申请编号">{detail.requestNo}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDate(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="设备型号">
              {`${detail.equipmentModel.modelName}（${detail.equipmentModel.modelCode}）`}
            </Descriptions.Item>
            <Descriptions.Item label="错误码">{detail.errorCode}</Descriptions.Item>
            <Descriptions.Item label="故障描述">{detail.faultDescription}</Descriptions.Item>
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

      <div className="surface-panel">
        <div className="mb-2 font-medium">工程师回复（{detail.responses.length}）</div>
        {detail.responses.length > 0 ? (
          <Timeline
            items={detail.responses.map((response) => ({
              children: (
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
                  <div className="text-sm">{response.responseText}</div>
                </div>
              ),
              key: response.id,
            }))}
          />
        ) : (
          // 空状态显式化：与列表页「暂无回复」口径一致，避免用户误判为加载不完整或页面遗漏
          <Typography.Text type="secondary">暂无工程师回复。</Typography.Text>
        )}
      </div>

      <div>
        <Button onClick={() => navigate(REPAIR_REQUESTS_LIST_PATH)}>返回列表</Button>
      </div>
    </div>
  );
}
