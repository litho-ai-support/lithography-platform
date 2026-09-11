// src/features/reference-document/ui/reference-document-form.tsx

import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Upload,
  type UploadFile,
  type UploadProps,
} from 'antd';

import { useReferenceEquipmentModels } from '../application/use-reference-equipment-models';
import {
  REFERENCE_DOCUMENT_TYPE_LABELS,
  REFERENCE_DOCUMENT_TYPE_OPTIONS,
} from '../infrastructure/reference-document.types';

// 长度上限与后端契约对齐（backend dto/reference-document-write.dto.ts），
// 修改需同步后端，避免单边漂移导致前端误拦或漏校验。
const TITLE_MAX_LENGTH = 255;
const DOCUMENT_TYPE_MAX_LENGTH = 100;

// 文件预检口径与后端 REST 上传边界同规格（扩展名白名单 + 大小上限）。
// 单一口径在后端 env（REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES /
// REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES，类型判定以扩展名为主），
// 此处常量仅为选择文件后的即时反馈镜像，修改需同步后端 env 默认值。
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_MAX_BYTES_TEXT = '20MB';
const UPLOAD_ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'txt',
  'md',
  'csv',
];

/**
 * 表单统一输出（创建直接使用；编辑由调用方转 PATCH，字段范围一致）。
 * - file：创建模式选择的文件（编辑模式恒为 null，编辑不支持换文件）；
 * - contentText：空白归一为 null（与后端双空判定同口径）。
 */
export type ReferenceDocumentFormOutput = {
  title: string;
  documentType: string;
  equipmentModelId: number | null;
  description: string | null;
  contentText: string | null;
  file: File | null;
};

export type ReferenceDocumentFormSubmitResult = { ok: true } | { ok: false; message: string };

type ReferenceDocumentFormProps = {
  /** 编辑模式的初值；创建模式不传（编辑不支持换文件，不含 file 字段） */
  initial?: Omit<ReferenceDocumentFormOutput, 'file'>;
  /** 编辑模式专用：当前资料已带文件（正文可清空，与后端防御放宽同口径） */
  hasExistingFile?: boolean;
  submitText?: string;
  onSubmit: (output: ReferenceDocumentFormOutput) => Promise<ReferenceDocumentFormSubmitResult>;
};

type FormValues = {
  title: string;
  documentType: string;
  /** Select allowClear 清除后为 undefined，提交前归一为 null */
  equipmentModelId?: number;
  description?: string;
  contentText?: string;
};

const TYPE_SELECT_OPTIONS = REFERENCE_DOCUMENT_TYPE_OPTIONS.map((value) => ({
  label: REFERENCE_DOCUMENT_TYPE_LABELS[value] ?? value,
  value,
}));

/**
 * 参考资料创建 / 编辑共用表单。
 *
 * - 文档类型候选与种子语义对齐（自由字符串契约，前端提供固定候选集）；
 * - 创建模式支持「文本 / 文件」双来源：文件经 Upload 手动模式暂存（beforeUpload 返回
 *   false，不上传，提交时由调用方走 REST multipart 通道）；文本与文件双空在提交前拦截
 *   （与后端 CONTENT_SOURCE_EMPTY 同口径），类型白名单与大小上限做即时预检（单一口径
 *   在后端 env，见上方常量注释）；编辑模式不支持换文件，但已有文件的资料允许清空正文；
 * - 设备型号可空（通用资料），可清除；
 * - 提交中禁用并以进行中标志防连点（带文件提交展示「上传中」）；业务拒绝展示后端
 *   消息并保留表单内容；
 * - 成功后的跳转 / 刷新由调用方决定，本组件只负责校验与提交。
 */
export function ReferenceDocumentForm({
  initial,
  hasExistingFile = false,
  submitText = '提交',
  onSubmit,
}: ReferenceDocumentFormProps) {
  const [form] = Form.useForm<FormValues>();
  const models = useReferenceEquipmentModels();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const modelsReady = models.state.status === 'ready' && models.state.models.length > 0;

  /** Upload 手动模式：仅暂存 File，不做真实上传（提交时由调用方走 REST 通道） */
  const handleUploadChange: NonNullable<UploadProps['onChange']> = ({ fileList: nextFileList }) => {
    setFileList(nextFileList);
    setSelectedFile(nextFileList.length > 0 ? (nextFileList[0].originFileObj ?? null) : null);
  };

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      if (submittingRef.current) {
        return;
      }

      const contentText = values.contentText?.trim() ? values.contentText.trim() : null;

      // 双空预检（与后端 CONTENT_SOURCE_EMPTY 同口径）：编辑模式下资料已有文件则放行
      if (selectedFile === null && contentText === null && !hasExistingFile) {
        setSubmitError('文本内容与文件至少提供一个。');

        return;
      }

      // 文件预检：扩展名白名单 + 大小上限（即时反馈镜像，后端为唯一真源）
      if (selectedFile !== null) {
        const extension = selectedFile.name
          .slice(selectedFile.name.lastIndexOf('.') + 1)
          .toLowerCase();

        if (!UPLOAD_ALLOWED_EXTENSIONS.includes(extension)) {
          setSubmitError(
            extension
              ? `不支持上传 .${extension} 类型的文件。`
              : '文件缺少扩展名，无法识别文件类型。',
          );

          return;
        }

        if (selectedFile.size > UPLOAD_MAX_BYTES) {
          setSubmitError(`上传文件不能超过 ${UPLOAD_MAX_BYTES_TEXT}。`);

          return;
        }
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      const output: ReferenceDocumentFormOutput = {
        title: values.title.trim(),
        documentType: values.documentType.trim(),
        equipmentModelId: values.equipmentModelId ?? null,
        description: values.description?.trim() ? values.description.trim() : null,
        contentText,
        file: selectedFile,
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
    [hasExistingFile, onSubmit, selectedFile],
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
        {initial === undefined ? (
          <Form.Item
            label="资料文件"
            tooltip={`支持 ${UPLOAD_ALLOWED_EXTENSIONS.join(' / ')} 格式，单文件不超过 ${UPLOAD_MAX_BYTES_TEXT}；上传文件时可不填文本内容`}
          >
            <Upload
              beforeUpload={() => false}
              fileList={fileList}
              maxCount={1}
              onChange={handleUploadChange}
            >
              <Button>选择文件</Button>
            </Upload>
          </Form.Item>
        ) : null}
        <Form.Item label="文本内容" name="contentText" tooltip="文本内容与文件至少提供一个">
          <Input.TextArea
            placeholder={
              initial === undefined
                ? '支持 Markdown 格式的资料正文；上传文件时可不填'
                : '支持 Markdown 格式的资料正文'
            }
            rows={12}
          />
        </Form.Item>
        <Form.Item>
          <Button htmlType="submit" loading={submitting} type="primary">
            {submitting && selectedFile !== null ? '上传中' : submitText}
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
