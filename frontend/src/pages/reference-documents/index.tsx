// src/pages/reference-documents/index.tsx

import { useAuthSession } from '@/features/auth-session';
import { ReferenceDocumentList } from '@/features/reference-document';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 参考资料库列表页。
 *
 * 路由 /reference-documents 在 app/router 注册并复用 protectedRouteLoader；
 * 角色路由放行表仅允许 ENGINEER / SUPER_ADMIN（CUSTOMER 被安全跳转回个人主页）。
 * 写入能力按后端口径精确匹配 SUPER_ADMIN（不继承），由页面判定后以 canManage
 * 下发 feature 组件，feature 不读取 Session。
 */
export function ReferenceDocumentsPage() {
  const { session } = useAuthSession();
  const canManage = session?.role === 'SUPER_ADMIN';

  return (
    <div className="page-stack">
      <PageHeader
        description="查阅光刻机维护知识库：错误代码手册、维护指南、安全规范与检查表。"
        title="参考资料库"
      />
      <ReferenceDocumentList canManage={canManage} />
    </div>
  );
}
