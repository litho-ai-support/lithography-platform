// src/features/repair-request/ui/repair-request-form.tsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Result, Select } from 'antd';
import { useNavigate } from 'react-router';

import { isGraphQLIngressError } from '@/shared/graphql';

import type {
  EquipmentModelOption,
  RepairRequestRecord,
} from '../infrastructure/repair-request.types';
import {
  createRepairRequest,
  fetchEquipmentModels,
} from '../infrastructure/repair-request-adapter';

// 创建成功后的返回目标：申请列表能力尚不存在（负责人裁定：成功页不跳尚不存在的列表），
// 先返回客户首页；列表页落地后如需直达，再替换此处路径。
const CUSTOMER_HOME_PATH = '/customer';

// 长度上限与后端契约对齐（backend/src/adapters/api/graphql/repair-request/dto/create-repair-request.input.ts），
// 修改需同步后端，避免单边漂移导致前端误拦或漏校验。
const ERROR_CODE_MAX_LENGTH = 100;
const FAULT_DESCRIPTION_MAX_LENGTH = 5000;

type RepairRequestFormValues = {
  equipmentModelId: number;
  errorCode: string;
  faultDescription: string;
};

type ModelsState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; models: EquipmentModelOption[] };

function toUserMessage(error: unknown, fallback: string): string {
  return isGraphQLIngressError(error) ? error.userMessage : fallback;
}

/** 纯拉取：只产出下一状态，不直接写 state，供初始加载与重试共用 */
async function loadEquipmentModelsState(): Promise<ModelsState> {
  try {
    const models = await fetchEquipmentModels();
    return { status: 'ready', models };
  } catch (error) {
    return {
      status: 'failed',
      message: toUserMessage(error, '设备型号加载失败，请稍后重试。'),
    };
  }
}

/**
 * 创建维修申请表单。
 *
 * - 设备型号列表来自后端（仅启用型号），含加载中 / 失败重试 / 无可用型号三种状态；
 * - 业务拒绝展示后端消息并保留表单内容；transport 失败展示共享错误模型的用户文案；
 * - 提交中禁用按钮并以进行中标志防连点；成功展示申请编号（后端生成，不从输入取），
 *   并重置表单，避免“继续创建”时残留旧值一键重复提交。
 */
export function RepairRequestForm() {
  const navigate = useNavigate();
  const [form] = Form.useForm<RepairRequestFormValues>();
  const [modelsState, setModelsState] = useState<ModelsState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<RepairRequestRecord | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadEquipmentModelsState().then((state) => {
      if (!cancelled) {
        setModelsState(state);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retryLoadModels = useCallback(() => {
    setModelsState({ status: 'loading' });
    void loadEquipmentModelsState().then(setModelsState);
  }, []);

  const modelsReady = modelsState.status === 'ready' && modelsState.models.length > 0;

  const handleSubmit = useCallback(
    async (values: RepairRequestFormValues) => {
      if (submittingRef.current) {
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      try {
        const result = await createRepairRequest({
          equipmentModelId: values.equipmentModelId,
          errorCode: values.errorCode.trim(),
          faultDescription: values.faultDescription.trim(),
        });

        if (result.ok) {
          // 重置表单，避免“继续创建”时残留旧值导致一键重复提交
          form.resetFields();
          setCreatedRequest(result.repairRequest);
        } else {
          setSubmitError(result.message);
        }
      } catch (error) {
        setSubmitError(toUserMessage(error, '维修申请提交失败，请稍后重试。'));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [form],
  );

  if (createdRequest) {
    return (
      <Result
        extra={[
          <Button key="continue" onClick={() => setCreatedRequest(null)}>
            继续创建
          </Button>,
          <Button key="home" type="primary" onClick={() => navigate(CUSTOMER_HOME_PATH)}>
            返回客户首页
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
        <Alert title="暂无可用的设备型号，请稍后再试。" showIcon type="warning" />
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
            rows={4}
          />
        </Form.Item>
        <Form.Item>
          <Button disabled={!modelsReady} htmlType="submit" loading={submitting} type="primary">
            提交申请
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
