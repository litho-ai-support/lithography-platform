// src/features/reference-document/ui/reference-document-detail-panel.tsx

import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Card, Descriptions, message, Popconfirm, Skeleton } from 'antd';
import { useNavigate } from 'react-router';

import { formatDateTimeText } from '@/shared/ui/format-date-time';

import { useReferenceDocumentDetail } from '../application/use-reference-document-detail';
import type {
  DeleteReferenceDocumentResult,
  UpdateReferenceDocumentPatch,
  UpdateReferenceDocumentResult,
} from '../infrastructure/reference-document.types';
import { REFERENCE_DOCUMENT_TYPE_LABELS } from '../infrastructure/reference-document.types';
import {
  deleteReferenceDocument,
  updateReferenceDocument,
} from '../infrastructure/reference-document-adapter';

import type {
  ReferenceDocumentFormOutput,
  ReferenceDocumentFormSubmitResult,
} from './reference-document-form';
import { ReferenceDocumentForm } from './reference-document-form';
import { REFERENCE_DOCUMENTS_LIST_PATH } from './reference-document-paths';

/**
 * 参考资料详情面板（F-05/F-06/F-07）。
 *
 * - documentId 由页面从路由参数解析后注入，本组件保持可独立测试；
 * - 不存在 / 已软删由后端统一 NOT_FOUND（防探测），呈现 warning 态而非数据；
 * - 编辑与软删入口仅 SUPER_ADMIN 可见（canManage 由页面层按角色判定）；
 * - 编辑为页内表单切换（PATCH 全字段），取消丢弃修改，成功后刷新详情；
 * - 软删 Popconfirm 二次确认；删除中禁用；失败给明确原因并刷新数据态，
 *   不得乐观成功（backend e2e 口径：重复软删统一 NOT_FOUND）。
 */
export function ReferenceDocumentDetailPanel({
  documentId,
  canManage,
}: {
  documentId: number;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const { state, reload } = useReferenceDocumentDetail(documentId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const handleUpdate = useCallback(
    async (output: ReferenceDocumentFormOutput): Promise<ReferenceDocumentFormSubmitResult> => {
      const patch: UpdateReferenceDocumentPatch = {
        title: output.title,
        documentType: output.documentType,
        equipmentModelId: output.equipmentModelId,
        description: output.description,
        contentText: output.contentText,
      };
      const result: UpdateReferenceDocumentResult = await updateReferenceDocument(
        documentId,
        patch,
      );

      if (result.ok) {
        message.success('参考资料已保存。');
        setEditing(false);
        reload();

        return { ok: true };
      }

      return { ok: false, message: result.message };
    },
    [documentId, reload],
  );

  const handleDelete = useCallback(async () => {
    if (deletingRef.current) {
      return;
    }

    deletingRef.current = true;
    setDeleting(true);

    try {
      const result: DeleteReferenceDocumentResult = await deleteReferenceDocument(documentId);

      if (result.ok) {
        message.success('参考资料已删除。');
        navigate(REFERENCE_DOCUMENTS_LIST_PATH);
      } else {
        // 失败给明确原因并刷新数据态，不做乐观成功
        message.error(result.message);
        reload();
      }
    } catch {
      message.error('参考资料删除失败，请稍后重试。');
      reload();
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [documentId, navigate, reload]);

  if (state.status === 'loading') {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (state.status === 'not-found') {
    return (
      <Alert
        action={
          <Button onClick={() => navigate(REFERENCE_DOCUMENTS_LIST_PATH)} size="small">
            返回列表
          </Button>
        }
        showIcon
        title={state.message}
        type="warning"
      />
    );
  }

  if (state.status === 'failed') {
    return (
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
    );
  }

  const { detail } = state;

  if (editing) {
    return (
      <Card
        extra={
          <Button disabled={deleting} onClick={() => setEditing(false)}>
            取消编辑
          </Button>
        }
        title="编辑参考资料"
      >
        <ReferenceDocumentForm
          initial={{
            title: detail.title,
            documentType: detail.documentType,
            equipmentModelId: detail.equipmentModelId,
            description: detail.description,
            contentText: detail.contentText ?? '',
          }}
          submitText="保存修改"
          onSubmit={handleUpdate}
        />
      </Card>
    );
  }

  return (
    <Card
      extra={
        canManage ? (
          <div className="flex gap-2">
            <Button disabled={deleting} onClick={() => setEditing(true)}>
              编辑
            </Button>
            <Popconfirm
              cancelText="取消"
              okButtonProps={{ loading: deleting }}
              okText="确认删除"
              onConfirm={() => void handleDelete()}
              title="确认删除该参考资料？删除后不可恢复。"
            >
              <Button danger disabled={deleting} type="primary">
                删除
              </Button>
            </Popconfirm>
          </div>
        ) : null
      }
      title={detail.title}
    >
      <div className="flex flex-col gap-4">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="文档类型">
            {REFERENCE_DOCUMENT_TYPE_LABELS[detail.documentType] ?? detail.documentType}
          </Descriptions.Item>
          <Descriptions.Item label="适用设备型号">
            {detail.equipmentModelId === null ? '通用资料' : detail.equipmentModelName}
          </Descriptions.Item>
          <Descriptions.Item label="文档说明">{detail.description ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="原始文件名">
            {detail.originalFilename ?? '纯文本资料'}
          </Descriptions.Item>
          {detail.mimeType !== null ? (
            <Descriptions.Item label="文件类型">{detail.mimeType}</Descriptions.Item>
          ) : null}
          <Descriptions.Item label="创建人">{detail.creatorNickname}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {formatDateTimeText(detail.createdAt)}
          </Descriptions.Item>
          <Descriptions.Item label="最近更新">
            {formatDateTimeText(detail.updatedAt)}
          </Descriptions.Item>
        </Descriptions>

        <div>
          <div className="mb-2 font-medium">文本内容</div>
          {detail.contentText !== null && detail.contentText.length > 0 ? (
            <pre className="whitespace-pre-wrap break-words text-sm">{detail.contentText}</pre>
          ) : (
            <div className="text-text-secondary text-sm">该资料暂无文本内容（仅存储引用）。</div>
          )}
        </div>

        <div>
          <Button onClick={() => navigate(REFERENCE_DOCUMENTS_LIST_PATH)}>返回列表</Button>
        </div>
      </div>
    </Card>
  );
}
