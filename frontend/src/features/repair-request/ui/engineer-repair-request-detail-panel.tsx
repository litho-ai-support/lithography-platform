// src/features/repair-request/ui/engineer-repair-request-detail-panel.tsx

/**
 * 工程师维修申请详情面板。
 *
 * - 唯一业务入口是 feature application 的编排 hook；
 *   UI 不触碰 adapter，不解析 Apollo 原始错误；
 * - 展示申请编号、设备型号、错误码、创建/接单时间、接单状态、最新处理状态、
 *   故障描述、contentMd 与已有工程师回复的只读时间线（本阶段无回复输入框）；
 * - 仅在申请仍可接单（未接单）且当前账号为精确 ENGINEER 时显示接单主操作；
 *   非工程师账号（如查看用超管）可阅读详情但不展示接单按钮，仅提示只读；
 *   点击前 Popconfirm 确认，
 *   进行中按钮 loading，application 层 ref 锁兜底防止并行 Mutation；
 * - 接单成功后详情由 Mutation 返回值原子更新（不切骨架屏，不闪现），
 *   页面以 Alert 明确展示已由当前工程师接单；
 * - 接单反馈（已由本人接单 / 申请已被接单 / 其他失败）用内联 Alert，
 *   与既有反馈先例一致，不引入全局 toast；
 * - 接单冲突后重查若落入 not-accessible（申请已被接走、当前工程师不再可读），
 *   仍优先展示冲突反馈，避免被通用不可访问文案掩盖；
 *   该分支不渲染详情与接单按钮，不泄露申请归属；
 * - 统一不可访问反馈引导返回工程师列表，不泄露申请归属；
 * - 本仓库无 markdown 渲染依赖，contentMd 按保留换行的纯文本展示。
 */

import { Alert, Button, Card, Descriptions, Popconfirm, Result, Skeleton, Timeline } from 'antd';
import { useNavigate } from 'react-router';

import { useEngineerRepairRequestDetailFlow } from '../application/use-engineer-repair-request-detail-flow';
import type { AcceptRepairRequestResult } from '../infrastructure/engineer-repair-request.types';

import { ENGINEER_REPAIR_REQUEST_LIST_PATH } from './engineer-repair-request-paths';
import { formatDateTimeText } from './format-date-time';
import { AcceptanceTag, ResolutionTag } from './repair-request-status-tags';

function AcceptFeedbackAlert({ result }: { result: AcceptRepairRequestResult | null }) {
  if (!result) {
    return null;
  }

  if (result.ok) {
    return <Alert showIcon title="你已接单该维修申请，后续请跟进处理。" type="success" />;
  }

  if (result.reason === 'already-accepted') {
    return <Alert showIcon title={result.message} type="warning" />;
  }

  return <Alert showIcon title={result.message} type="error" />;
}

/**
 * canAccept 由页面层基于会话单值业务角色判定（读权限继承不等于接单权限：
 * 非精确 ENGINEER 可查看详情但不可接单），面板只消费布尔结果，
 * 不自行读取会话或维护第二份角色状态。
 */
export function EngineerRepairRequestDetailPanel({
  requestId,
  canAccept,
}: {
  requestId: number | null;
  canAccept: boolean;
}) {
  const navigate = useNavigate();
  const { state, accepting, lastAcceptResult, accept, reload } =
    useEngineerRepairRequestDetailFlow(requestId);

  if (state.status === 'loading') {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (state.status === 'failed') {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          {/*
           * 接单反馈优先于不可访问/加载失败反馈：接单冲突后重查可能落入
           * not-accessible（申请已被接走，当前工程师不再可读），
           * 若只展示通用文案，用户无法得知申请已被接单。
           */}
          <AcceptFeedbackAlert result={lastAcceptResult} />

          {state.reason === 'not-accessible' ? (
            <Result
              extra={
                <Button onClick={() => navigate(ENGINEER_REPAIR_REQUEST_LIST_PATH)} type="primary">
                  返回维修申请列表
                </Button>
              }
              status="warning"
              title={state.message}
            />
          ) : (
            <Alert
              action={
                <Button onClick={reload} size="small">
                  重试
                </Button>
              }
              showIcon
              title={state.message}
              type="error"
            />
          )}
        </div>
      </Card>
    );
  }

  const detail = state.detail;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <AcceptFeedbackAlert result={lastAcceptResult} />

        <Descriptions
          bordered
          column={{ lg: 2, md: 1, sm: 1, xs: 1 }}
          items={[
            { children: detail.requestNo, key: 'requestNo', label: '申请编号' },
            {
              children: `${detail.equipmentModel.modelName}（${detail.equipmentModel.modelCode}）`,
              key: 'equipmentModel',
              label: '设备型号',
            },
            { children: detail.errorCode, key: 'errorCode', label: '错误码' },
            {
              children: formatDateTimeText(detail.createdAt),
              key: 'createdAt',
              label: '创建时间',
            },
            {
              children: <AcceptanceTag accepted={detail.isAccepted} />,
              key: 'isAccepted',
              label: '接单状态',
            },
            {
              children: detail.acceptedAt ? formatDateTimeText(detail.acceptedAt) : '—',
              key: 'acceptedAt',
              label: '接单时间',
            },
            {
              children: <ResolutionTag status={detail.latestResolutionStatus} />,
              key: 'latestResolutionStatus',
              label: '最新处理状态',
            },
          ]}
          size="small"
        />

        <div className="flex flex-col gap-1">
          <div className="font-medium">故障描述</div>
          <div className="whitespace-pre-wrap">{detail.faultDescription}</div>
        </div>

        {detail.contentMd ? (
          <div className="flex flex-col gap-1">
            <div className="font-medium">补充说明</div>
            <div className="whitespace-pre-wrap">{detail.contentMd}</div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="font-medium">工程师回复</div>
          {detail.responses.length > 0 ? (
            <Timeline
              items={detail.responses.map((response) => ({
                children: (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{response.engineerNickname}</span>
                      <ResolutionTag status={response.resolutionStatus} />
                      <span className="text-text-secondary text-xs">
                        {formatDateTimeText(response.createdAt)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{response.responseText}</div>
                  </div>
                ),
                key: response.id,
              }))}
            />
          ) : (
            <div className="text-text-secondary">暂无工程师回复。</div>
          )}
        </div>

        {!detail.isAccepted && canAccept ? (
          <div>
            <Popconfirm
              cancelText="取消"
              description="接单后该维修申请将由你跟进处理。"
              okText="确认接单"
              onConfirm={() => void accept()}
              title="确认接单该维修申请？"
            >
              <Button loading={accepting} type="primary">
                接单
              </Button>
            </Popconfirm>
          </div>
        ) : null}

        {!detail.isAccepted && !canAccept ? (
          <div className="text-text-secondary">当前账号仅可查看详情，接单需使用工程师账号。</div>
        ) : null}
      </div>
    </Card>
  );
}
