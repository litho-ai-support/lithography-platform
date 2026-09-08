// src/pages/reference-document-new/index.tsx

import { useCallback, useRef, useState } from 'react';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';

import {
  buildReferenceDocumentDetailPath,
  createReferenceDocument,
  type CreateReferenceDocumentInput,
  type CreateReferenceDocumentResult,
  REFERENCE_DOCUMENTS_LIST_PATH,
  ReferenceDocumentForm,
  type ReferenceDocumentFormOutput,
  type ReferenceDocumentFormSubmitResult,
} from '@/features/reference-document';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 新增参考资料页（仅 SUPER_ADMIN 可达）。
 *
 * 路由 /reference-documents/new 在 app/router 注册：CUSTOMER 被角色根路径表拦截，
 * ENGINEER 被角色路径拒绝清单拦截（对应后端写接口仅 SUPER_ADMIN 的精确口径，
 * 避免出现「能进页面但提交必被拒」的残缺中间态）。
 * 页面只装配 feature 公开表单组件并处理成功后的跳转，不持有另一份校验规则；
 * 创建成功后进入新资料详情页。
 */
export function ReferenceDocumentNewPage() {
  const navigate = useNavigate();
  const [createdId, setCreatedId] = useState<number | null>(null);
  const creatingRef = useRef(false);

  const handleSubmit = useCallback(
    async (output: ReferenceDocumentFormOutput): Promise<ReferenceDocumentFormSubmitResult> => {
      if (creatingRef.current) {
        return { ok: false, message: '正在提交中，请稍候。' };
      }

      creatingRef.current = true;

      try {
        const input: CreateReferenceDocumentInput = {
          title: output.title,
          documentType: output.documentType,
          equipmentModelId: output.equipmentModelId,
          description: output.description,
          contentText: output.contentText,
        };
        const result: CreateReferenceDocumentResult = await createReferenceDocument(input);

        if (result.ok) {
          setCreatedId(result.id);

          return { ok: true };
        }

        return { ok: false, message: result.message };
      } finally {
        creatingRef.current = false;
      }
    },
    [],
  );

  if (createdId !== null) {
    return (
      <div className="page-stack">
        <PageHeader description="参考资料已创建。" title="新增参考资料" />
        <Result
          extra={[
            <Button
              key="detail"
              type="primary"
              onClick={() => navigate(buildReferenceDocumentDetailPath(createdId))}
            >
              查看详情
            </Button>,
            <Button key="list" onClick={() => navigate(REFERENCE_DOCUMENTS_LIST_PATH)}>
              返回列表
            </Button>,
          ]}
          status="success"
          title="参考资料创建成功"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="录入维护知识文本资料；适用设备型号留空表示通用资料。"
        title="新增参考资料"
      />
      <div className="surface-panel">
        <ReferenceDocumentForm submitText="创建资料" onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
