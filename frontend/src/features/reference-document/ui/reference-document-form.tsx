// src/features/reference-document/ui/reference-document-form.tsx

import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Select } from 'antd';

import { useReferenceEquipmentModels } from '../application/use-reference-equipment-models';
import {
  REFERENCE_DOCUMENT_TYPE_LABELS,
  REFERENCE_DOCUMENT_TYPE_OPTIONS,
} from '../infrastructure/reference-document.types';

// 长度上限与后端契约对齐（backend dto/reference-document-write.dto.ts），
// 修改需同步后端，避免单边漂移导致前端误拦或漏校验。
const TITLE_MAX_LENGTH = 255;
const DOCUMENT_TYPE_MAX_LENGTH = 100;

/** 表单统一输出（创建直接使用；编辑由调用方转 PATCH，字段范围一致） */
export type ReferenceDocumentFormOutput = {
  title: string;
  documentType: string;
  equipmentModelId: number | null;
  description: string | null;
  contentText: string;
};

export type ReferenceDocumentFormSubmitResult = { ok: true } | { ok: false; message: string };

type ReferenceDocumentFormProps = {
  /** 编辑模式的初值；创建模式不传 */
  initial?: ReferenceDocumentFormOutput;
  submitText?: string;
  onSubmit: (output: ReferenceDocumentFormOutput) => Promise<ReferenceDocumentFormSubmitResult>;
};

type FormValues = {
  title: string;
  documentType: string;
  /** Select allowClear 清除后为 undefined，提交前归一为 null */
  equipmentModelId?: number;
  description?: string;
  contentText: string;
};

const TYPE_SELECT_OPTIONS = REFERENCE_DOCUMENT_TYPE_OPTIONS.map((value) => ({
  label: REFERENCE_DOCUMENT_TYPE_LABELS[value] ?? value,
  value,
}));

/**
 * 参考资料创建 / 编辑共用表单。
 *
 * - 文档类型候选与种子语义对齐（自由字符串契约，前端提供固定候选集）；
 * - 标题 / 类型 / 文本内容必填（contentText 本周仅文本来源，必填由前端预检 + 后端兜底）；
 * - 设备型号可空（通用资料），可清除；
 * - 提交中禁用并以进行中标志防连点；业务拒绝展示后端消息并保留表单内容；
 * - 成功后的跳转 / 刷新由调用方决定，本组件只负责校验与提交。
 */
export function ReferenceDocumentForm({
  initial,
  submitText = '提交',
  onSubmit,
}: ReferenceDocumentFormProps) {
  const [form] = Form.useForm<FormValues>();
  const models = useReferenceEquipmentModels();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const modelsReady = models.state.status === 'ready' && models.state.models.length > 0;

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      if (submittingRef.current) {
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      const output: ReferenceDocumentFormOutput = {
        title: values.title.trim(),
        documentType: values.documentType.trim(),
        equipmentModelId: values.equipmentModelId ?? null,
        description: values.description?.trim() ? values.description.trim() : null,
        contentText: values.contentText.trim(),
      };

      try {
        const result = await onSubmit(output);

        if (!result.ok) {
          setSubmitError(result.message);
        }
      } catch {
        // 非业务拒绝的异常（transport/auth 等）由共享错误模型在 application 归一，
        // 表单内不区分类型，直接给出兜底文案
        setSubmitError('参考资料提交失败，请稍后重试。');
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [onSubmit],
  );

  return (
    <div className="flex flex-col gap-4">
      {models.state.status === 'failed' ? (
        <Alert
          action={
            <Button onClick={models.reload} size="small">
              重试
            </Button>
          }
          title={models.state.message}
          showIcon
          type="error"
        />
      ) : null}
      {models.state.status === 'ready' && models.state.models.length === 0 ? (
        <Alert title="暂无可用的设备型号，可选择「通用资料」后提交。" showIcon type="warning" />
      ) : null}
      {submitError ? <Alert title={submitError} showIcon type="error" /> : null}

      <Form
        form={form}
        initialValues={
          initial
            ? {
                title: initial.title,
                documentType: initial.documentType,
                equipmentModelId: initial.equipmentModelId ?? undefined,
                description: initial.description ?? undefined,
                contentText: initial.contentText ?? '',
              }
            : undefined
        }
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="文档标题"
          name="title"
          rules={[
            { message: '请输入文档标题', required: true },
            { max: TITLE_MAX_LENGTH, message: `文档标题不能超过 ${TITLE_MAX_LENGTH} 个字符` },
          ]}
        >
          <Input maxLength={TITLE_MAX_LENGTH} placeholder="请输入文档标题" />
        </Form.Item>
        <Form.Item
          label="文档类型"
          name="documentType"
          rules={[
            { message: '请选择文档类型', required: true },
            {
              max: DOCUMENT_TYPE_MAX_LENGTH,
              message: `文档类型不能超过 ${DOCUMENT_TYPE_MAX_LENGTH} 个字符`,
            },
          ]}
        >
          <Select options={TYPE_SELECT_OPTIONS} placeholder="请选择文档类型" />
        </Form.Item>
        <Form.Item label="适用设备型号" name="equipmentModelId" tooltip="留空表示通用资料">
          <Select
            allowClear
            disabled={!modelsReady}
            loading={models.state.status === 'loading'}
            options={
              models.state.status === 'ready'
                ? models.state.models.map((model) => ({
                    label: `${model.modelName}（${model.modelCode}）`,
                    value: model.id,
                  }))
                : []
            }
            placeholder="留空表示通用资料"
          />
        </Form.Item>
        <Form.Item label="文档说明" name="description">
          <Input.TextArea placeholder="选填：资料用途与适用场景说明" rows={2} />
        </Form.Item>
        <Form.Item
          label="文本内容"
          name="contentText"
          rules={[{ message: '请输入文本内容（本周仅支持文本来源）', required: true }]}
        >
          <Input.TextArea placeholder="支持 Markdown 格式的资料正文" rows={12} />
        </Form.Item>
        <Form.Item>
          <Button htmlType="submit" loading={submitting} type="primary">
            {submitText}
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
