// src/features/repair-request/ui/repair-request-form.tsx

import { useCallback } from 'react';
import { Alert, Button, Form, Input, Result, Select } from 'antd';
import { useNavigate } from 'react-router';

import { useRepairRequestCreateFlow } from '../application/use-repair-request-create-flow';
import type { RepairRequestRecord } from '../infrastructure/repair-request.types';

// 创建成功后的返回目标：跳转维修申请列表（T-05：列表能力已落地，替换阶段一的客户首页临时落点）
const REPAIR_REQUESTS_LIST_PATH = '/customer/repair-requests';

// 长度上限与后端契约对齐（backend/src/adapters/api/graphql/repair-request/dto/create-repair-request.input.ts），
// 修改需同步后端，避免单边漂移导致前端误拦或漏校验。
const ERROR_CODE_MAX_LENGTH = 100;
const FAULT_DESCRIPTION_MAX_LENGTH = 5000;

type RepairRequestFormValues = {
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
};

export type RepairRequestFormProps = {
  /** 创建成功回调：携带真实创建记录（已含真实 id），供工作台刷新左栏列表联动 */
  onCreated?: (record: RepairRequestRecord) => void;
  /** 「查看维修申请」跳转意图；未提供时保持既有默认行为（跳转列表路由） */
  onViewCreated?: (record: RepairRequestRecord) => void;
};

/**
 * 创建维修申请表单。
 *
 * - 型号 query 三态、重试编排、create command、在途锁与错误归一均由
 *   application 的 useRepairRequestCreateFlow 承担，本组件只负责渲染与把编排结果
 *   转成提示、重置与导航；
 * - 设备型号列表来自后端（仅启用型号），含加载中 / 失败重试 / 无可用型号三种状态；
 * - 业务拒绝展示后端消息并保留表单内容；transport 失败展示共享错误模型的用户文案；
 * - 提交中禁用按钮并以进行中标志防连点；成功展示申请编号（后端生成，不从输入取），
 *   并重置表单，避免“继续创建”时残留旧值一键重复提交；
 * - 协作端口：onCreated 在创建成功时上报记录（工作台据此刷新左栏列表）；
 *   onViewCreated 覆盖「查看维修申请」的默认跳转目标（工作台进入新申请详情路由）。
 */
export function RepairRequestForm({ onCreated, onViewCreated }: RepairRequestFormProps) {
  const navigate = useNavigate();
  const [form] = Form.useForm<RepairRequestFormValues>();
  const {
    continueCreating,
    createdRequest,
    modelsState,
    retryLoadModels,
    submit,
    submitting,
    submitError,
  } = useRepairRequestCreateFlow();

  const modelsReady = modelsState.status === 'ready' && modelsState.models.length > 0;

  const handleSubmit = useCallback(
    async (values: RepairRequestFormValues) => {
      const record = await submit(values);

      if (record) {
        // 重置表单，避免“继续创建”时残留旧值导致一键重复提交；随后上报创建成功
        form.resetFields();
        onCreated?.(record);
      }
    },
    [form, onCreated, submit],
  );

  // 「取消」即放弃当前填写内容：仅重置表单字段，不清除型号等页面级状态
  const handleCancel = useCallback(() => {
    form.resetFields();
  }, [form]);

  if (createdRequest) {
    return (
      <Result
        extra={[
          <Button key="continue" onClick={continueCreating}>
            继续创建
          </Button>,
          <Button
            key="list"
            onClick={() =>
              onViewCreated ? onViewCreated(createdRequest) : navigate(REPAIR_REQUESTS_LIST_PATH)
            }
            type="primary"
          >
            查看维修申请
          </Button>,
        ]}
        status="success"
        subTitle={`申请编号：${createdRequest.requestNo}`}
        title="维修申请创建成功"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {modelsState.status === 'failed' ? (
        <Alert
          action={
            <Button onClick={retryLoadModels} size="small">
              重试
            </Button>
          }
          title={modelsState.message}
          showIcon
          type="error"
        />
      ) : null}
      {modelsState.status === 'ready' && modelsState.models.length === 0 ? (
        // 空态同样可恢复：型号由管理员维护，用户无需刷新整页即可再次拉取（S2-2）
        <Alert
          action={
            <Button onClick={retryLoadModels} size="small">
              重试
            </Button>
          }
          title="暂无可用的设备型号，请稍后再试。"
          showIcon
          type="warning"
        />
      ) : null}
      {submitError ? <Alert title={submitError} showIcon type="error" /> : null}

      <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
        <Form.Item
          label="设备型号"
          name="equipmentModelId"
          rules={[{ message: '请选择设备型号', required: true }]}
        >
          <Select
            disabled={!modelsReady}
            loading={modelsState.status === 'loading'}
            options={
              modelsState.status === 'ready'
                ? modelsState.models.map((model) => ({
                    label: `${model.modelName}（${model.modelCode}）`,
                    value: model.id,
                  }))
                : []
            }
            placeholder="请选择设备型号"
          />
        </Form.Item>
        <Form.Item
          label="设备错误码"
          name="errorCode"
          rules={[
            { message: '请输入设备错误码', required: true },
            {
              max: ERROR_CODE_MAX_LENGTH,
              message: `错误码不能超过 ${ERROR_CODE_MAX_LENGTH} 个字符`,
            },
          ]}
        >
          <Input
            disabled={!modelsReady}
            maxLength={ERROR_CODE_MAX_LENGTH}
            placeholder="例如：E-2001"
          />
        </Form.Item>
        <Form.Item
          label="故障描述"
          name="faultDescription"
          rules={[
            { message: '请输入故障描述', required: true },
            {
              max: FAULT_DESCRIPTION_MAX_LENGTH,
              message: `故障描述不能超过 ${FAULT_DESCRIPTION_MAX_LENGTH} 个字符`,
            },
          ]}
        >
          <Input.TextArea
            disabled={!modelsReady}
            maxLength={FAULT_DESCRIPTION_MAX_LENGTH}
            placeholder="请描述设备故障现象与发生场景"
            rows={6}
            style={{ minHeight: 150 }}
          />
        </Form.Item>
        {/* 操作行右对齐（PR5 客户工作台计划 4.3）：取消仅重置已填内容 */}
        <Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={handleCancel}>取消</Button>
            <Button disabled={!modelsReady} htmlType="submit" loading={submitting} type="primary">
              提交申请
            </Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  );
}
