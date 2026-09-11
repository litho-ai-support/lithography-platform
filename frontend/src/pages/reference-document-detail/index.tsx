// src/pages/reference-document-detail/index.tsx

import { useParams } from 'react-router';

import { useAuthSession } from '@/features/auth-session';
import {
  parseReferenceDocumentIdParam,
  ReferenceDocumentDetailPanel,
} from '@/features/reference-document';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 参考资料详情页。
 *
 * 路由接线：从路径参数解析 documentId 后注入页面组件，面板保持可独立测试。
 * 非法参数（非正整数：abc/0/负数/小数/空）不发起 GraphQL 请求，
 * 直接呈现面板统一的 not-found 口径（与后端防探测一致；负责人 0909 修复要求）。
 * 编辑与软删入口由 canManage（精确 SUPER_ADMIN）控制。
 */
export function ReferenceDocumentDetailPage() {
  const { documentId } = useParams();
  const { session } = useAuthSession();
  const canManage = session?.role === 'SUPER_ADMIN';

  return (
    <div className="page-stack">
      <PageHeader description="查阅维护知识资料的完整内容与元数据。" title="参考资料详情" />
      <ReferenceDocumentDetailPanel
        canManage={canManage}
        documentId={parseReferenceDocumentIdParam(documentId)}
      />
    </div>
  );
}
