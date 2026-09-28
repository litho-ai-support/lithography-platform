// src/features/reference-document/ui/reference-document-detail-panel.tsx

import { Alert, Button, Card, Descriptions, Popconfirm, Skeleton } from 'antd';
import { useNavigate } from 'react-router';

import { formatDateTimeText } from '@/shared/ui/format-date-time';
import { useMessageFeedback } from '@/shared/ui/message-feedback';

import { useReferenceDocumentActions } from '../application/use-reference-document-actions';
import { useReferenceDocumentDetail } from '../application/use-reference-document-detail';
import { REFERENCE_DOCUMENT_TYPE_LABELS } from '../infrastructure/reference-document.types';

import { ReferenceDocumentForm } from './reference-document-form';
import { REFERENCE_DOCUMENTS_LIST_PATH } from './reference-document-paths';

/**
 * 参考资料详情面板（F-05/F-06/F-07）。
 *
 * - documentId 由页面从路由参数解析后注入（非法参数为 null），本组件保持可独立测试；
 * - 不存在 / 已软删由后端统一 NOT_FOUND（防探测），呈现 warning 态而非数据；
 * - 编辑与软删入口仅 SUPER_ADMIN 可见（canManage 由页面层按角色判定）；
 * - 写路径编排（编辑 PATCH、软删、下载、操作代次与在途锁、成功后 reload）已收束在
 *   `application/use-reference-document-actions`（含 documentId 变化时退出旧目标编辑态、
 *   卸载后在途结果作废等口径），本组件只负责渲染与把编排结果转成导航；
 * - 带文件的资料恒显「下载文件」按钮（页面可见角色均可下载；CUSTOMER 无页面访问权限，
 *   REST 下载后端也已收窄，负责人 0910 裁定）：下载经 application 编排、由
 *   infrastructure 的浏览器保存适配落地（Authorization 头鉴权，不用 window.open / 直链）。
 * - 详情态与编辑态的 Card 外层均由 `div.reference-document-detail` 承载页面级作用域类
 *   （AntD 组件禁止挂 className，见 eslint local/no-design-system-classname）：
 *   长标题 / 长文件名 / 长说明的安全换行规则收在 index.css 该前缀下（PR5 S4-3）。
 */
export function ReferenceDocumentDetailPanel({
  documentId,
  canManage,
}: {
  documentId: number | null;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  // 反馈端口由 ui 层注入（application 不依赖具体 UI 组件实现）
  const notify = useMessageFeedback();
  const { state, reload } = useReferenceDocumentDetail(documentId);
  const {
    cancelEditing,
    deleting,
    download,
    downloading,
    editing,
    openEditing,
    remove,
    submitUpdate,
  } = useReferenceDocumentActions({ documentId, notify, reload });

  const handleDelete = async () => {
    // 编排层已在目标切换 / 卸载时把结果整体丢弃（返回 false），此处只在真正删除成功时导航
    if (await remove()) {
      navigate(REFERENCE_DOCUMENTS_LIST_PATH);
    }
  };

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
      <div className="reference-document-detail">
        <Card
          extra={
            <Button disabled={deleting} onClick={cancelEditing}>
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
            onSubmit={submitUpdate}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="reference-document-detail">
      <Card
        extra={
          canManage ? (
            <div className="flex gap-2">
              <Button disabled={deleting} onClick={openEditing}>
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
        title={
          // 窄视口（index.css 的 <640px 媒体查询）标题按 2 行截断，
          // 完整标题由原生 title 属性承载（与列表页 S3-5 同口径）
          <span title={detail.title}>{detail.title}</span>
        }
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
                <Button loading={downloading} onClick={() => void download()} type="primary">
                  下载文件
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
