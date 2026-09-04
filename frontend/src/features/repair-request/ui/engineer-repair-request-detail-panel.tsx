// src/features/repair-request/ui/engineer-repair-request-detail-panel.tsx

/**
 * 工程师维修申请详情面板。
 *
 * - 唯一业务入口是 feature application 的编排 hook；
 *   UI 不触碰 adapter，不解析 Apollo 原始错误；
 * - 展示申请编号、设备型号、错误码、创建/接单时间、接单状态、最新处理状态、
 *   故障描述、contentMd 与已有工程师回复的只读时间线；
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
 * - 回复区域（精确 ENGINEER 且已接单时展示）：正文 TextArea、PENDING/RESOLVED
 *   状态选择与提交按钮；未接单时提示先接单，不提供回复入口；
 *   提交中（含收敛重查中）禁用输入控件并 loading，连点由 application 锁兜底；
 *   成功（含不确定结果收敛成功）后清空草稿并重置状态选择，
 *   失败/不确定未收敛时草稿保留，用户无需重新输入；
 *   不确定结果的收敛重查是静默重查（不切骨架屏、表单不卸载），
 *   反馈中的「重新加载详情」入口也走静默重查，避免草稿丢失；
 *   回复时间线与最新处理状态全部由 application 原子更新，UI 不维护回复数组；
 * - 回复反馈（成功 / 未接单 / 不可访问 / 无权限 / 输入非法 / 系统失败 /
 *   结果不确定）用内联 Alert，结果不确定时附重新加载入口，
 *   不引入全局 toast；
 * - 统一不可访问反馈引导返回工程师列表，不泄露申请归属；
 * - 详情就绪后始终提供「返回维修申请列表」入口（与接单状态、查看者角色无关），
 *   且固定前往列表路径，保证从地址栏直达详情页也能稳定返回；
 * - 本仓库无 markdown 渲染依赖，contentMd 按保留换行的纯文本展示。
 */

import { useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Result,
  Select,
  Skeleton,
  Timeline,
} from 'antd';
import { useNavigate } from 'react-router';

import {
  ENGINEER_RESPONSE_TEXT_OVER_CAPACITY_MESSAGE,
  isEngineerResponseTextOverCapacity,
} from '../application/engineer-response-text-capacity';
import { useEngineerRepairRequestDetailFlow } from '../application/use-engineer-repair-request-detail-flow';
import type {
  AcceptRepairRequestResult,
  CreateEngineerResponseInput,
  CreateEngineerResponseResult,
  EngineerResolutionStatusValue,
} from '../infrastructure/engineer-repair-request.types';
import { RESOLUTION_STATUS_LABELS } from '../infrastructure/repair-request-read.types';

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

/** 状态选项：复用公共读模型的状态标签映射（单一展示口径），不新建第三套文案 */
const RESOLUTION_STATUS_OPTIONS = (
  Object.entries(RESOLUTION_STATUS_LABELS) as [EngineerResolutionStatusValue, string][]
).map(([value, label]) => ({ value, label }));

/**
 * 回复反馈（内联 Alert，与接单反馈先例一致）。
 * response-failed 是结果不确定态：Mutation 可能已在服务端生效，
 * 除展示后端失败文案外，附重新加载入口引导用户检查回复时间线，
 * 绝不自动重发 Mutation。
 * reloading 为真表示收敛重查进行中：入口按钮禁用，
 * 避免自动静默重查期间叠加并行手动重查。
 */
function CreateResponseFeedbackAlert({
  result,
  onReload,
  reloading,
}: {
  result: CreateEngineerResponseResult | null;
  onReload: () => void;
  reloading: boolean;
}) {
  if (!result) {
    return null;
  }

  if (result.ok) {
    return <Alert showIcon title="回复已提交。" type="success" />;
  }

  if (result.reason === 'not-accepted') {
    return <Alert showIcon title={result.message} type="warning" />;
  }

  if (result.reason === 'response-failed') {
    return (
      <Alert
        action={
          <Button disabled={reloading} onClick={onReload} size="small">
            重新加载详情
          </Button>
        }
        description="回复可能已提交成功，请刷新后检查回复时间线，避免重复提交。"
        showIcon
        title={result.message}
        type="error"
      />
    );
  }

  return <Alert showIcon title={result.message} type="error" />;
}

type EngineerResponseFormValues = {
  responseText: string;
  resolutionStatus: EngineerResolutionStatusValue;
};

/**
 * 回复表单（纯 UI 草稿，表单状态留在 ui 层，遵循 stable-clean 草稿归属规则）。
 *
 * - 正文/状态只做必填交互校验；空白语义与状态值域仍由后端收敛，
 *   UI 不自行虚构长度上限与默认状态以外的语义；
 * - PENDING 仅作为 UI 初始选择，提交始终显式传值，不依赖后端默认值；
 * - submitting 为真表示「提交中或不确定结果收敛重查中」，
 *   期间禁用输入控件并 loading，保证表单不卸载、无重复提交窗口；
 * - 成功（含不确定结果收敛成功）后清空草稿并重置状态选择为初始值；
 *   失败/不确定未收敛时草稿保留，用户无需重新输入。
 */
function EngineerResponseForm({
  requestId,
  submitting,
  lastResult,
  onSubmit,
  onReload,
}: {
  requestId: number;
  submitting: boolean;
  lastResult: CreateEngineerResponseResult | null;
  onSubmit: (input: CreateEngineerResponseInput) => void;
  onReload: () => void;
}) {
  const [form] = Form.useForm<EngineerResponseFormValues>();

  useEffect(() => {
    if (lastResult?.ok) {
      form.resetFields();
    }
  }, [form, lastResult]);

  return (
    <Form
      form={form}
      initialValues={{ resolutionStatus: 'PENDING' }}
      layout="vertical"
      onFinish={(values) =>
        onSubmit({
          requestId,
          resolutionStatus: values.resolutionStatus,
          responseText: values.responseText,
        })
      }
    >
      {lastResult !== null && (
        <div className="mb-4">
          {/* submitting 含收敛重查中（面板传 submitting || reconciling），
              自动静默重查期间禁用手动重查入口，不叠加并行请求 */}
          <CreateResponseFeedbackAlert
            onReload={onReload}
            reloading={submitting}
            result={lastResult}
          />
        </div>
      )}
      <Form.Item
        label="回复正文"
        name="responseText"
        rules={[
          { message: '请输入回复正文。', required: true, whitespace: true },
          {
            // 容量策略来自 application（UI 不复制 TextEncoder 实现）：
            // 超出 MySQL TEXT 的 UTF-8 字节容量时提交前拦截，不发 Mutation、草稿保留。
            validator: (_rule, value: string) =>
              !value || !isEngineerResponseTextOverCapacity(value)
                ? Promise.resolve()
                : Promise.reject(new Error(ENGINEER_RESPONSE_TEXT_OVER_CAPACITY_MESSAGE)),
          },
        ]}
      >
        <Input.TextArea disabled={submitting} placeholder="填写本次处理说明…" rows={4} />
      </Form.Item>
      <Form.Item
        label="处理状态"
        name="resolutionStatus"
        rules={[{ required: true, message: '请选择处理状态。' }]}
      >
        <Select disabled={submitting} options={RESOLUTION_STATUS_OPTIONS} />
      </Form.Item>
      <Button htmlType="submit" loading={submitting} type="primary">
        提交回复
      </Button>
    </Form>
  );
}

/**
 * canHandleAsEngineer 由页面层基于会话单值业务角色判定（读权限继承不等于写权限：
 * 非精确 ENGINEER 可查看详情但不可接单/回复），面板只消费布尔结果，
 * 不自行读取会话或维护第二份角色状态。
 * 接单与回复共用同一精确 ENGINEER 写身份，本布尔同时控制两个提交入口。
 */
export function EngineerRepairRequestDetailPanel({
  requestId,
  canHandleAsEngineer,
}: {
  requestId: number | null;
  canHandleAsEngineer: boolean;
}) {
  const navigate = useNavigate();
  const {
    state,
    accepting,
    lastAcceptResult,
    accept,
    submitting,
    reconciling,
    lastCreateResponseResult,
    createResponse,
    reload,
    confirmResponseResult,
  } = useEngineerRepairRequestDetailFlow(requestId);

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

        {!detail.isAccepted && canHandleAsEngineer ? (
          <div className="flex flex-col gap-2">
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
            <div className="text-text-secondary">请先接单后才能回复该申请。</div>
          </div>
        ) : null}

        {!detail.isAccepted && !canHandleAsEngineer ? (
          <div className="text-text-secondary">当前账号仅可查看详情，接单需使用工程师账号。</div>
        ) : null}

        {/*
         * 回复区域：精确 ENGINEER 且已接单时展示表单（Plan P0-7 权限矩阵）。
         * 提交经 application createResponse；成功/失败/不确定反馈见
         * CreateResponseFeedbackAlert；时间线由 application 原子更新。
         */}
        {detail.isAccepted && canHandleAsEngineer ? (
          <div className="flex flex-col gap-2">
            <div className="font-medium">追加处理回复</div>
            <EngineerResponseForm
              lastResult={lastCreateResponseResult}
              onReload={() => void confirmResponseResult()}
              onSubmit={(input) => void createResponse(input)}
              requestId={detail.id}
              submitting={submitting || reconciling}
            />
          </div>
        ) : null}

        {detail.isAccepted && !canHandleAsEngineer ? (
          <div className="text-text-secondary">当前账号仅可查看详情，回复需使用工程师账号。</div>
        ) : null}

        {/*
         * 底部常驻返回入口：不依赖接单状态与查看者角色，
         * 固定前往列表路径（不用 navigate(-1)），从地址栏直达详情页也能稳定返回。
         */}
        <div className="flex justify-start">
          <Button onClick={() => navigate(ENGINEER_REPAIR_REQUEST_LIST_PATH)}>
            返回维修申请列表
          </Button>
        </div>
      </div>
    </Card>
  );
}
