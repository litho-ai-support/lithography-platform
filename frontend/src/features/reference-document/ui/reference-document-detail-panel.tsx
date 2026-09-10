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
import { downloadReferenceDocumentFile } from '../infrastructure/reference-document-http-adapter';

import type {
  ReferenceDocumentFormOutput,
  ReferenceDocumentFormSubmitResult,
} from './reference-document-form';
import { ReferenceDocumentForm } from './reference-document-form';
import { REFERENCE_DOCUMENTS_LIST_PATH } from './reference-document-paths';

/**
 * 参考资料详情面板（F-05/F-06/F-07）。
 *
 * - documentId 由页面从路由参数解析后注入（非法参数为 null），本组件保持可独立测试；
 * - 不存在 / 已软删由后端统一 NOT_FOUND（防探测），呈现 warning 态而非数据；
 * - 编辑与软删入口仅 SUPER_ADMIN 可见（canManage 由页面层按角色判定）；
 * - 编辑为页内表单切换（PATCH 全字段），取消丢弃修改，成功后刷新详情；
 *   documentId 变化时同步退出旧资料的编辑态，避免新资料加载后沿用旧编辑会话；
 *   已有文件的资料允许清空正文（与后端防御放宽同口径，经 hasExistingFile 传给表单）；
 * - 软删 Popconfirm 二次确认；删除中禁用；失败给明确原因并刷新数据态，
 *   不得乐观成功（backend e2e 口径：重复软删统一 NOT_FOUND）；
 * - 带文件的资料恒显「下载文件」按钮（三角色可见）：fetch blob 后经
 *   createObjectURL + a[download] 触发浏览器保存（Authorization 头鉴权，
 *   不用 window.open / 直链），失败 message 反馈。
 */
export function ReferenceDocumentDetailPanel({
  documentId,
  canManage,
}: {
  documentId: number | null;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const { state, reload } = useReferenceDocumentDetail(documentId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);

  // ID 变化（含从合法变非法）时退出旧资料的编辑态：新资料加载完成后
  // 不得继续显示由旧资料开启的编辑界面，避免「看到 A 的表单、提交到 B」。
  // 采用 React 官方「props 变化时渲染期调整 state」模式，避免 effect 内 setState 级联渲染
  const [editingSessionId, setEditingSessionId] = useState(documentId);

  if (editingSessionId !== documentId) {
    setEditingSessionId(documentId);
    setEditing(false);
  }

  const handleUpdate = useCallback(
    async (output: ReferenceDocumentFormOutput): Promise<ReferenceDocumentFormSubmitResult> => {
      if (documentId === null) {
        return { ok: false, message: '参考资料不存在或不可编辑。' };
      }

      const patch: UpdateReferenceDocumentPatch = {
        title: output.title,
        documentType: output.documentType,
        equipmentModelId: output.equipmentModelId,
        description: output.description,
        // 空白正文传空字符串：后端编辑路径归一为 null，仅当资料已有文件时放行
        // （双空拦截已由表单预检承担，此处不做二次判定）
        contentText: output.contentText ?? '',
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
    if (documentId === null || deletingRef.current) {
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

  /** 下载资料文件：blob → 临时 URL → a[download] 触发浏览器保存 */
  const handleDownload = useCallback(async () => {
    if (documentId === null || downloadingRef.current) {
      return;
    }

    downloadingRef.current = true;
    setDownloading(true);

    try {
      const result = await downloadReferenceDocumentFile(documentId);

      if (!result.ok) {
        message.error(result.message);

        return;
      }

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      message.error('下载失败，请稍后重试。');
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }, [documentId]);

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
          hasExistingFile={detail.hasFile}
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
              title="确认删除该参考资料？删除后将不再显示，且当前版本不提供恢复入口。"
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
          <div className="flex gap-2">
            <Button onClick={() => navigate(REFERENCE_DOCUMENTS_LIST_PATH)}>返回列表</Button>
            {/* 「有文件」以权威字段 hasFile 为准（= 后端存储引用非空），不从 originalFilename 推断 */}
            {detail.hasFile ? (
              <Button loading={downloading} onClick={() => void handleDownload()} type="primary">
                下载文件
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
